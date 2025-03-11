// src-tauri/src/lib.rs
#[macro_use]
extern crate objc;

mod services;
mod tray;

use tauri::Manager; // Add this import for the state() method

use services::{
    mongodb::{
        MongoDBState,
        start_mongodb,
        stop_mongodb,
        list_mongodb_databases,
        list_mongodb_collections,
        test_mongodb_connection
    },
    mysql::{
        MySqlService,
        mysql_connect,
        mysql_execute_query,
        mysql_test_connection,
        mysql_get_tables,
        mysql_get_table_schema,
        mysql_disconnect
    },
    python::{
        PythonService,
        python_init,
        python_execute,
        python_reset
    },
    sqlite::{
        SqliteService,
        sqlite_init,
        sqlite_execute_query
    },
    sqlite_prompts::{
        sqlite_get_prompts,
        sqlite_create_prompt,
        sqlite_update_prompt,
        sqlite_delete_prompt
    },
    api_server::{
        ApiServerState,
        start_api_server,
        stop_api_server
    }
};

// Import the whisper module functions
use services::whisper::{
    transcribe_audio,
    play_last_recording,
    save_audio_recording,
    openai_4o_mini
};

// Import the brand sound module functions
use services::brand_sound::{
    get_brand_sound_path,
    check_brand_sound_exists
};

// Import the Google Trends functions
use services::google_trends::{
    get_google_trends,
    get_related_queries,
    export_trends_data
};

// Import the new Trend Spike Prediction functions
use services::trend_spike_service::{
    TrendSpikeService,
    init_default_keywords,
    get_trend_predictions,
    get_saved_trend_predictions,
    predict_trend_spike,
    add_trend_spike_keyword,
    remove_trend_spike_keyword,
    start_trend_spike_monitoring,
    stop_trend_spike_monitoring,
    get_trend_spike_monitored_keywords,
    set_trend_spike_threshold,
    set_trend_spike_interval,
    is_trend_spike_monitoring_active,
    get_trend_spike_sources
};
use std::sync::Arc;

// Import the screenshot functions
use services::screenshot::{
    take_screenshot, 
    take_screenshot_to_clipboard,
    save_clipboard_image  // Add this line
};

use services::chrome_debugger::fetch_chrome_targets;
#[cfg(debug_assertions)]
use services::chrome_debugger::open_chrome_in_terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create and initialize the trend spike service
    let trend_spike_service = Arc::new(TrendSpikeService::new());
    init_default_keywords(&trend_spike_service);

    // Clone for use in the setup closure so that the original value remains available.
    let trend_spike_service_for_setup = trend_spike_service.clone();

    tauri::Builder::default()
        .setup(move |app| {
            // Setup tray icon handlers
            tray::setup_tray_handler(&app.handle());
            
            // Store resource directory path in the trend spike service.
            // Note the use of `.ok()` to convert the Result to an Option.
            if let Some(resource_dir) = app.handle().path().resource_dir().ok() {
                if let Ok(mut paths) = trend_spike_service_for_setup.script_paths.lock() {
                    paths.insert("resource_dir".to_string(), resource_dir.to_string_lossy().to_string());
                }
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_window_event(window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(MongoDBState::new())
        .manage(MySqlService::new())
        .manage(PythonService::new())
        .manage(SqliteService::new())
        .manage(ApiServerState::default())
        .manage(trend_spike_service) // use the original value here
        .invoke_handler(tauri::generate_handler![
            // MongoDB commands
            start_mongodb,
            stop_mongodb,
            list_mongodb_databases,
            list_mongodb_collections,
            test_mongodb_connection,
            // MySQL commands
            mysql_connect,
            mysql_execute_query,
            mysql_test_connection,
            mysql_get_tables,
            mysql_get_table_schema,
            mysql_disconnect,
            // Python commands
            python_init,
            python_execute,
            python_reset,
            // SQLite commands
            sqlite_init,
            sqlite_execute_query,
            // SQLite prompts commands
            sqlite_get_prompts,
            sqlite_create_prompt,
            sqlite_update_prompt,
            sqlite_delete_prompt,
            // API Server commands
            start_api_server,
            stop_api_server,
            // Whisper commands
            transcribe_audio,
            play_last_recording,
            save_audio_recording,
            openai_4o_mini,
            // Brand sound commands
            get_brand_sound_path,
            check_brand_sound_exists,
            // Google Trends commands
            get_google_trends,
            get_related_queries,
            export_trends_data,
            // New Trend Spike Prediction commands
            get_trend_predictions,
            get_saved_trend_predictions,
            predict_trend_spike,
            add_trend_spike_keyword,
            remove_trend_spike_keyword,
            start_trend_spike_monitoring,
            stop_trend_spike_monitoring,
            get_trend_spike_monitored_keywords,
            set_trend_spike_threshold,
            set_trend_spike_interval,
            is_trend_spike_monitoring_active,
            get_trend_spike_sources,
            // Screenshot commands
            take_screenshot,
            take_screenshot_to_clipboard,
            save_clipboard_image,
            update_system_appearance,
            fetch_chrome_targets,
            open_chrome_in_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn update_system_appearance(dark: bool) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    // First, try with Cocoa API
    unsafe {
      use cocoa::appkit::NSApp;
      use cocoa::base::{id, nil};
      use cocoa::foundation::NSString;
      use objc::{class, msg_send, sel, sel_impl};
      
      let app: id = NSApp();
      
      let appearance_name = if dark { "NSAppearanceNameDarkAqua" } else { "NSAppearanceNameAqua" };
      println!("Updating appearance to: {}", appearance_name);
      
      let ns_string_class = class!(NSString);
      let ns_appearance_name: id = msg_send![ns_string_class, stringWithUTF8String:appearance_name.as_ptr()];
      
      let nsappearance_class = class!(NSAppearance);
      let appearance: id = msg_send![nsappearance_class, appearanceNamed:ns_appearance_name];
      
      let _: () = msg_send![app, setAppearance:appearance];
      
      let windows: id = msg_send![app, windows];
      let count: usize = msg_send![windows, count];
      
      println!("Found {} windows to update", count);
      for i in 0..count {
        let window: id = msg_send![windows, objectAtIndex:i];
        let _: () = msg_send![window, setAppearance:appearance];
        println!("Updated window at index {}", i);
      }
    }
    
    // Then also try with AppleScript as a backup approach
    // This will affect the entire system appearance which will include our window
    use std::process::Command;
    
    let script = format!("tell application \"System Events\" to tell appearance preferences to set dark mode to {}", 
                        if dark { "true" } else { "false" });
    
    match Command::new("osascript").arg("-e").arg(script).output() {
      Ok(_) => println!("System appearance updated via AppleScript"),
      Err(e) => println!("Failed to update system appearance via AppleScript: {}", e)
    }
  }
  
  Ok(())
}