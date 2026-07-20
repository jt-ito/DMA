use tauri::Manager;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let window = app.get_webview_window("main").unwrap();

      // Determine where start.js is located
      let mut start_js_path = std::path::PathBuf::new();
      let mut node_cwd = std::path::PathBuf::new();

      if let Ok(resource_dir) = app.path().resource_dir() {
          // In production on Windows, resources are placed in _up_
          let prod_path = resource_dir.join("_up_").join(".next").join("standalone").join("start.js");
          if prod_path.exists() {
              start_js_path = prod_path;
              node_cwd = resource_dir.join("_up_").join(".next").join("standalone");
          } else {
              // In production on macOS/Linux, resources are in the root of the resource dir
              let mac_path = resource_dir.join(".next").join("standalone").join("start.js");
              if mac_path.exists() {
                  start_js_path = mac_path;
                  node_cwd = resource_dir.join(".next").join("standalone");
              }
          }
      }

      // Fallback for dev mode
      if !start_js_path.exists() {
          let mut cwd = std::env::current_dir().unwrap();
          if cwd.ends_with("src-tauri") {
              cwd.pop();
          }
          start_js_path = cwd.join(".next").join("standalone").join("start.js");
          node_cwd = cwd.join(".next").join("standalone");
          
          if !start_js_path.exists() {
              start_js_path = cwd.join("start.js");
              node_cwd = cwd;
          }
      }

      println!("Resolved start_js_path: {:?}", start_js_path);
      println!("Resolved node_cwd: {:?}", node_cwd);

      // Spawn node server
      match Command::new("node")
          .arg(&start_js_path)
          .current_dir(&node_cwd)
          .env("PORT", "3000")
          .stdout(Stdio::piped())
          .stderr(Stdio::piped())
          .spawn()
      {
          Ok(mut child) => {
              if let Some(stdout) = child.stdout.take() {
                  let window_clone = window.clone();
                  thread::spawn(move || {
                      let reader = BufReader::new(stdout);
                      for line in reader.lines() {
                          if let Ok(line) = line {
                              println!("[Next.js] {}", line);
                              if line.contains("Ready in") || line.contains("localhost:3000") || line.contains("Listening on") || line.contains("Ready on") {
                                  // Server is ready, redirect window
                                  let _ = window_clone.eval("window.location.replace('http://localhost:3000');");
                              }
                          }
                      }
                  });
              }
              if let Some(stderr) = child.stderr.take() {
                  thread::spawn(move || {
                      let reader = BufReader::new(stderr);
                      for line in reader.lines() {
                          if let Ok(line) = line {
                              eprintln!("[Next.js Error] {}", line);
                          }
                      }
                  });
              }
          }
          Err(e) => {
              eprintln!("Failed to start Node server: {}", e);
          }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
