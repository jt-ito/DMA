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
      let mut cwd = std::env::current_dir().unwrap();
      // If we are in src-tauri (e.g. during dev), go up one level
      if cwd.ends_with("src-tauri") {
          cwd.pop();
      }

      // Try standalone first, then fallback to root
      let mut start_js_path = cwd.join(".next").join("standalone").join("start.js");
      let mut node_cwd = cwd.join(".next").join("standalone");

      if !start_js_path.exists() {
          start_js_path = cwd.join("start.js");
          node_cwd = cwd;
      }

      // Spawn node server
      match Command::new("node")
          .arg(&start_js_path)
          .current_dir(&node_cwd)
          .stdout(Stdio::piped())
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
                              if line.contains("Ready in") || line.contains("localhost:3000") || line.contains("Listening on") {
                                  // Server is ready, redirect window
                                  let _ = window_clone.eval("window.location.replace('http://localhost:3000');");
                              }
                          }
                      }
                  });
              }
          }
          Err(e) => {
              println!("Failed to start Node server: {}", e);
          }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
