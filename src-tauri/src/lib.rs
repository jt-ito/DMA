use tauri::{Manager, Emitter};
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::TrayIconBuilder,
    menu::{Menu, MenuItem},
};
use rand::{thread_rng, Rng};
use rand::distributions::Alphanumeric;
use bcrypt::{hash, DEFAULT_COST};

fn get_configured_port() -> String {
    let mut config_dir = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    
    config_dir.push(".docker-manager");
    config_dir.push(".env");

    if let Ok(contents) = std::fs::read_to_string(config_dir) {
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with("PORT=") {
                return line.replace("PORT=", "").replace("\"", "").replace("'", "").trim().to_string();
            }
        }
    }
    "3000".to_string()
}

struct AppState {
    child: Arc<Mutex<Option<std::process::Child>>>,
}

#[tauri::command]
fn is_configured() -> bool {
    let mut config_dir = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    
    config_dir.push(".docker-manager");
    config_dir.push(".env");

    if let Ok(contents) = std::fs::read_to_string(&config_dir) {
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with("ADMIN_PASSWORD_HASH=") {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
fn complete_setup(username: String, password: String, port: String) -> Result<(), String> {
    if is_configured() {
        return Err("App is already configured".to_string());
    }

    if password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }

    let mut config_dir = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    
    config_dir.push(".docker-manager");
    let env_path = config_dir.join(".env");

    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    let hashed = hash(password, DEFAULT_COST).map_err(|e| e.to_string())?;
    let jwt_secret: String = thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let env_content = format!(
        "ADMIN_USERNAME=\"{}\"\nADMIN_PASSWORD_HASH=\"{}\"\nJWT_SECRET=\"{}\"\nPORT=\"{}\"\n",
        username, hashed, jwt_secret, port
    );

    std::fs::write(env_path, env_content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn start_server(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    // Check if already running
    if let Ok(child_opt) = state.child.lock() {
        if child_opt.is_some() {
            return Ok(());
        }
    }

    let port = get_configured_port();
    
    let mut cmd = if cfg!(debug_assertions) {
        // Dev Mode
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(format!("npm run dev -- -p {}", port));
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("npm");
            c.args(["run", "dev", "--", "-p", &port]);
            c
        }
    } else {
        // Prod Mode
        let mut start_js_path = std::path::PathBuf::new();
        let mut node_cwd = std::path::PathBuf::new();
        if let Ok(resource_dir) = app.path().resource_dir() {
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
            let err_msg = "Failed to find start.js in resource directory. Ensure resources are bundled.";
            eprintln!("{}", err_msg);
            let _ = app.emit("server-log", format!("ERROR: {}", err_msg));
            return Err(err_msg.to_string());
        }
        
        let strip_unc = |p: &std::path::Path| -> String {
            let s = p.to_string_lossy().into_owned();
            if s.starts_with("\\\\?\\") {
                s[4..].to_string()
            } else {
                s
            }
        };

        let mut c = Command::new("node");
        c.arg(strip_unc(&start_js_path)).current_dir(strip_unc(&node_cwd));
        c
    };

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let port = get_configured_port();
    cmd.env("PORT", port)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            
            if let Ok(mut child_opt) = state.child.lock() {
                *child_opt = Some(child);
            }

            if let Some(stdout) = stdout {
                let app_handle_clone = app.clone();
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
                let app_handle_clone = app.clone();
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
            let _ = app.emit("server-log", format!("Failed to start server: {}", e));
            return Err(e.to_string());
        }
    }
    
    Ok(())
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
    let port = get_configured_port();
    let _ = open::that(format!("http://localhost:{}", port));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        is_configured,
        complete_setup,
        start_server,
        stop_server,
        minimize_window,
        close_app,
        open_browser
    ])
    .on_window_event(|window, event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            let state = window.app_handle().state::<AppState>();
            let is_running = if let Ok(child_opt) = state.child.lock() {
                child_opt.is_some()
            } else {
                false
            };

            if is_running {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
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
                  let port = get_configured_port();
                  let _ = open::that(format!("http://localhost:{}", port));
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

      // Server is no longer spawned here on boot. 
      // The frontend will manually invoke start_server once setup checks complete.

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
