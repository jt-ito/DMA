use tauri::{Manager, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::TrayIconBuilder,
    menu::{Menu, MenuItem},
};

struct AppState {
    child: Arc<Mutex<Option<std::process::Child>>>,
}

#[tauri::command]
fn stop_server(state: tauri::State<AppState>) -> Result<(), String> {
    if let Ok(mut child_opt) = state.child.lock() {
        if let Some(child) = child_opt.as_mut() {
            let _ = child.kill();
        }
        *child_opt = None;
    }
    Ok(())
}

#[tauri::command]
fn minimize_window(window: tauri::Window) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
fn close_app(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    if let Ok(mut child_opt) = state.child.lock() {
        if let Some(child) = child_opt.as_mut() {
            let _ = child.kill();
        }
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn open_browser() -> Result<(), String> {
    let _ = open::that("http://localhost:3000");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![stop_server, minimize_window, close_app, open_browser])
    .on_window_event(|window, event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.emit("close-requested", ());
        }
        _ => {}
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let child_mutex = Arc::new(Mutex::new(None::<std::process::Child>));
      app.manage(AppState { child: child_mutex.clone() });
      let child_mutex_for_tray = child_mutex.clone();

      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let browser_i = MenuItem::with_id(app, "browser", "Open Web UI", true, None::<&str>)?;
      let show_i = MenuItem::with_id(app, "show", "Open Launcher", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &browser_i, &quit_i])?;

      let _tray = TrayIconBuilder::new()
          .icon(app.default_window_icon().unwrap().clone())
          .menu(&menu)
          .on_menu_event(move |app, event| match event.id.as_ref() {
              "quit" => {
                  if let Ok(mut child_opt) = child_mutex_for_tray.lock() {
                      if let Some(child) = child_opt.as_mut() {
                          let _ = child.kill();
                      }
                  }
                  app.exit(0);
              }
              "browser" => {
                  let _ = open::that("http://localhost:3000");
              }
              "show" => {
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.set_focus();
                  }
              }
              _ => {}
          })
          .on_tray_icon_event(|tray, event| {
              if let tauri::tray::TrayIconEvent::Click {
                  button: tauri::tray::MouseButton::Left,
                  button_state: tauri::tray::MouseButtonState::Up,
                  ..
              } = event {
                  let app = tray.app_handle();
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.set_focus();
                  }
              }
          })
          .build(app)?;

      // Remove on_window_event from setup; it belongs on Builder

      // Spawn Node process
      let mut cmd = if cfg!(debug_assertions) {
          // Dev Mode
          #[cfg(target_os = "windows")]
          {
              let mut c = Command::new("cmd");
              c.args(["/C", "npm run dev"]);
              c
          }
          #[cfg(not(target_os = "windows"))]
          {
              let mut c = Command::new("npm");
              c.args(["run", "dev"]);
              c
          }
      } else {
          // Prod Mode
          let mut start_js_path = std::path::PathBuf::new();
          let mut node_cwd = std::path::PathBuf::new();
          if let Ok(resource_dir) = app.path().resource_dir() {
              // Tauri v2 often drops the _up_ directory structure for resources if configured differently,
              // so let's check multiple potential paths
              let paths_to_check = vec![
                  resource_dir.join("_up_").join(".next").join("standalone").join("start.js"),
                  resource_dir.join(".next").join("standalone").join("start.js"),
                  resource_dir.join("start.js"),
              ];
              
              for path in paths_to_check {
                  if path.exists() {
                      start_js_path = path.clone();
                      node_cwd = path.parent().unwrap().to_path_buf();
                      break;
                  }
              }
          }
          
          if !start_js_path.exists() {
              eprintln!("Failed to find start.js in resource directory. Ensure resources are bundled.");
              if let Ok(resource_dir) = app.path().resource_dir() {
                  eprintln!("Searched inside: {:?}", resource_dir);
              }
              return Ok(());
          }
          
          let mut c = Command::new("node");
          c.arg(&start_js_path).current_dir(&node_cwd);
          c
      };

      cmd.env("PORT", "3000")
         .stdout(Stdio::piped())
         .stderr(Stdio::piped());

      match cmd.spawn() {
          Ok(mut child) => {
              let stdout = child.stdout.take();
              let stderr = child.stderr.take();
              
              if let Ok(mut child_opt) = child_mutex.lock() {
                  *child_opt = Some(child);
              }

              if let Some(stdout) = stdout {
                  let app_handle_clone = app.handle().clone();
                  thread::spawn(move || {
                      let reader = BufReader::new(stdout);
                      for line in reader.lines() {
                          if let Ok(line) = line {
                              println!("[Next.js] {}", line);
                              let _ = app_handle_clone.emit("server-log", line.clone());
                          }
                      }
                  });
              }
              if let Some(stderr) = stderr {
                  let app_handle_clone = app.handle().clone();
                  thread::spawn(move || {
                      let reader = BufReader::new(stderr);
                      for line in reader.lines() {
                          if let Ok(line) = line {
                              eprintln!("[Next.js Error] {}", line);
                              let _ = app_handle_clone.emit("server-log", format!("ERROR: {}", line));
                          }
                      }
                  });
              }
          }
          Err(e) => {
              eprintln!("Failed to start Node server: {}", e);
              let _ = app.handle().emit("server-log", format!("Failed to start server: {}", e));
          }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
