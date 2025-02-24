// src-tauri/src/tray.rs
use tauri::{
    AppHandle, Manager, WindowEvent
};

pub fn setup_tray_handler(app: &AppHandle) {
    let app_handle = app.clone();
    
    // Just toggle the window visibility on any tray event
    app.on_tray_icon_event(move |_, _| {
        if let Some(window) = app_handle.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
    }
}