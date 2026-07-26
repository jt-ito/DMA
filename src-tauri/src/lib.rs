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
fn get_settings() -> Result<(String, String), String> {
    let mut config_dir = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    
    config_dir.push(".docker-manager");
    let env_path = config_dir.join(".env");

    let mut username = String::new();
    let mut port = "3000".to_string();

    if let Ok(contents) = std::fs::read_to_string(&env_path) {
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with("ADMIN_USERNAME=") {
                username = line.replace("ADMIN_USERNAME=", "").replace("\"", "").replace("'", "").trim().to_string();
            } else if line.starts_with("PORT=") {
                port = line.replace("PORT=", "").replace("\"", "").replace("'", "").trim().to_string();
            }
        }
    }
    
    Ok((username, port))
}

#[tauri::command]
fn update_settings(username: String, password: Option<String>, port: String) -> Result<(), String> {
    let mut config_dir = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    
    config_dir.push(".docker-manager");
    let env_path = config_dir.join(".env");

    let mut old_hash = String::new();
    let mut old_jwt = String::new();

    if let Ok(contents) = std::fs::read_to_string(&env_path) {
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with("ADMIN_PASSWORD_HASH=") {
                old_hash = line.replace("ADMIN_PASSWORD_HASH=", "").replace("\"", "").replace("'", "").trim().to_string();
            } else if line.starts_with("JWT_SECRET=") {
                old_jwt = line.replace("JWT_SECRET=", "").replace("\"", "").replace("'", "").trim().to_string();
            }
        }
    }

    if old_jwt.is_empty() {
        return Err("Configuration missing JWT_SECRET".to_string());
    }

    let final_hash = if let Some(new_pass) = password {
        if new_pass.is_empty() {
            old_hash
        } else if new_pass.len() < 4 {
            return Err("Password must be at least 4 characters".to_string());
        } else {
            hash(new_pass, DEFAULT_COST).map_err(|e| e.to_string())?
        }
    } else {
        old_hash
    };

    let env_content = format!(
        "ADMIN_USERNAME=\"{}\"\nADMIN_PASSWORD_HASH=\"{}\"\nJWT_SECRET=\"{}\"\nPORT=\"{}\"\n",
        username, final_hash, old_jwt, port
    );

    std::fs::write(env_path, env_content).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn kill_port_process(port: &str) {
    if let Ok(output) = std::process::Command::new("netstat")
        .args(["-ano"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let search_str = format!(":{}", port);
        for line in stdout.lines() {
            if line.contains(&search_str) && line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pid) = parts.last() {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/PID", pid])
                        .status();
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_port_process(port: &str) {
    if let Ok(output) = std::process::Command::new("lsof")
        .args(["-t", "-i", &format!(":{}", port)])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for pid in stdout.lines() {
            let pid = pid.trim();
            if !pid.is_empty() {
                let _ = std::process::Command::new("kill")
                    .args(["-9", pid])
                    .status();
            }
        }
    }
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
    kill_port_process(&port);
    
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
                            let emit_line = if line.starts_with("ERROR: ") || line.starts_with("WARNING: ") {
                                line.clone()
                            } else {
                                format!("ERROR: {}", line)
                            };
                            let _ = app_handle_clone.emit("server-log", emit_line);
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
            #[cfg(target_os = "windows")]
            {
                let pid = child.id();
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .status();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
            }
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
            #[cfg(target_os = "windows")]
            {
                let pid = child.id();
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .status();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
            }
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
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
        is_configured,
        complete_setup,
        get_settings,
        update_settings,
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
                          #[cfg(target_os = "windows")]
                          {
                              let pid = child.id();
                              let _ = std::process::Command::new("taskkill")
                                  .args(["/F", "/T", "/PID", &pid.to_string()])
                                  .status();
                          }
                          #[cfg(not(target_os = "windows"))]
                          {
                              let _ = child.kill();
                          }
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
