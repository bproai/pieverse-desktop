// src-tauri/src/tray.rs
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::tray::TrayIconEvent;
use tauri::{AppHandle, Manager, WindowEvent};

pub fn setup_tray_handler(app: &AppHandle) {
    let app_handle = app.clone();

    // Use atomic boolean to track window state
    let window_visible = Arc::new(AtomicBool::new(false));
    // Track last click time for debouncing
    let last_click = Arc::new(std::sync::Mutex::new(
        Instant::now() - Duration::from_secs(1),
    ));

    app.on_tray_icon_event(move |_, event| {
        if let TrayIconEvent::Click { .. } = event {
            // Simple debounce: ignore events that happen too quickly after the last one
            let mut last_click_time = last_click.lock().unwrap();
            let now = Instant::now();
            let duration_since_last = now.duration_since(*last_click_time);

            // Only process if it's been at least 300ms since the last click event
            if duration_since_last > Duration::from_millis(300) {
                *last_click_time = now;

                if let Some(window) = app_handle.get_webview_window("main") {
                    let current_visible = window_visible.load(Ordering::Relaxed);
                    let new_state = !current_visible;
                    window_visible.store(new_state, Ordering::Relaxed);

                    if new_state {
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        let _ = window.hide();
                    }
                }
            }
        }
    });
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        // let _ = window.hide();
        // api.prevent_close();
        // Exit the app entirely
        std::process::exit(0);        
    }
}
