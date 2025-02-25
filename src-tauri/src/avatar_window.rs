// src-tauri/src/avatar_window.rs
use tauri::{AppHandle, WindowBuilder, WindowUrl};

pub fn create_avatar_window(app: &AppHandle) -> tauri::Result<()> {
  WindowBuilder::new(
    app,
    "avatar",
    WindowUrl::App("avatar.html".into())
  )
  .decorations(false)
  .transparent(true)
  .always_on_top(true)
  .build()?;
  Ok(())
}

