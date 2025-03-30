// src-tauri/src/lib.rs
extern crate objc;

mod services;
mod tray;

use tauri::Manager; // Add this import for the state() method

use services::{
    api_server::{start_api_server, stop_api_server, delete_qa_pair, ApiServerState},
    mongodb::{
        list_mongodb_collections, list_mongodb_databases, start_mongodb, stop_mongodb,
        test_mongodb_connection, MongoDBState,
    },
    mysql::{
        mysql_connect, mysql_disconnect, mysql_execute_param_query, mysql_execute_query,
        mysql_get_table_schema, mysql_get_tables, mysql_test_connection, MySqlService,
    },
    python::{python_execute, python_init, python_reset, PythonService},
    sqlite::{sqlite_execute_query, sqlite_init, SqliteService},
    sqlite_prompts::{
        sqlite_create_prompt, sqlite_delete_prompt, sqlite_get_prompts, sqlite_update_prompt,
    },
};

// Import the whisper module functions
use services::whisper::{
    openai_4o_mini, play_last_recording, save_audio_recording, transcribe_audio,
};

// Import the brand sound module functions
use services::brand_sound::{check_brand_sound_exists, get_brand_sound_path};

// Import the Google Trends functions
use services::google_trends::{export_trends_data, get_google_trends, get_related_queries};

// Import the new Trend Spike Prediction functions
use services::trend_spike_service::{
    add_trend_spike_keyword, get_saved_trend_predictions, get_trend_predictions,
    get_trend_spike_monitored_keywords, get_trend_spike_sources, init_default_keywords,
    is_trend_spike_monitoring_active, predict_trend_spike, remove_trend_spike_keyword,
    set_trend_spike_interval, set_trend_spike_threshold, start_trend_spike_monitoring,
    stop_trend_spike_monitoring, TrendSpikeService,
};
use std::sync::Arc;

// Import the screenshot functions
use services::screenshot::{
    save_clipboard_image, // Add this line
    take_screenshot,
    take_screenshot_to_clipboard,
    download_image,
};

use services::chrome_debugger::fetch_chrome_targets;
use services::chrome_debugger::open_chrome_in_terminal;

use services::project_structure::{
    check_drag_drop_dir_exists, create_copies_for_files, generate_structure_text,
    get_project_structure, is_valid_path, open_drag_drop_dir,
};
use services::references::{load_references, save_references};
use services::vscode_ws::{
    get_vscode_ws_status, send_chat_to_vscode, send_code_diff_to_vscode, send_open_file_to_vscode,
    start_vscode_ws_server, stop_vscode_ws_server, VSCodeWebSocketState,
};

use services::file_service::{
    copy_directory, generate_file_tree, get_file_info, read_text_file_secure, search_files,
    write_text_file_secure,
};

use services::claude_mcp_service::{
    add_claude_mcp_directory, get_claude_mcp_status, remove_claude_mcp_directory,
    start_claude_mcp_server, stop_claude_mcp_server, ClaudeMcpState,
};

// Import MCP client service
use services::mcp_client_service::{
    add_puppeteer_mcp_directory, get_puppeteer_mcp_config, get_puppeteer_mcp_directories,
    get_puppeteer_mcp_status, get_puppeteer_mcp_tools, remove_puppeteer_mcp_directory,
    send_to_puppeteer_mcp, start_puppeteer_mcp_server, stop_puppeteer_mcp_server,
    update_puppeteer_mcp_config, update_puppeteer_mcp_directory, PuppeteerMcpState,
};

use services::chrome_extension_ws::{
    get_chrome_ws_clients, get_chrome_ws_status, send_message_to_chrome,
    send_targeted_message_to_chrome, start_chrome_ws_server, stop_chrome_ws_server,
    ChromeExtWebSocketState,
};

use crate::services::api_server::ApiServer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create and initialize the trend spike service
    let trend_spike_service = Arc::new(TrendSpikeService::new());
    init_default_keywords(&trend_spike_service);

    // Clone for use in the setup closure so that the original value remains available.
    let trend_spike_service_for_setup = trend_spike_service.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(move |app| {
            // Setup tray icon handlers
            tray::setup_tray_handler(&app.handle());

            // Explicitly start API server in production mode
            let sqlite_service = app.state::<SqliteService>();
            let api_server_state = app.state::<ApiServerState>();


            // tauri::async_runtime::block_on(async move {
            //     start_api_server(sqlite_service, api_server_state, Some(3030))
            //         .await
            //         .expect("Failed to start API server");
        
            tauri::async_runtime::block_on(async move {
                // Define default port
                let default_port = 3030;
                
                // First check if default port is available
                if ApiServer::check_port_available(default_port) {
                    // Start with default port
                    if let Err(e) = start_api_server(sqlite_service, api_server_state, Some(default_port)).await {
                        println!("Failed to start API server on port {}: {}", default_port, e);
                    } else {
                        println!("API server started successfully on port {}", default_port);
                    }
                } else {
                    println!("Port {} is already in use, trying alternative ports...", default_port);
                    
                    // Try to find an available port in a range
                    let mut port_found = false;
                    for port in 3031..3040 {  // Try ports 3031-3039
                        if ApiServer::check_port_available(port) {
                            // Try starting with this port
                            if let Err(e) = start_api_server(sqlite_service, api_server_state, Some(port)).await {
                                println!("Failed to start API server on port {}: {}", port, e);
                            } else {
                                println!("API server started successfully on port {}", port);
                                port_found = true;
                            }
                            break;  // We only try once with these states
                        }
                    }
                    
                    if !port_found {
                        println!("Could not start API server - no available ports found in range 3030-3039");
                    }
                }
            });

            // Store resource directory path in the trend spike service.
            // Note the use of `.ok()` to convert the Result to an Option.
            if let Some(resource_dir) = app.handle().path().resource_dir().ok() {
                if let Ok(mut paths) = trend_spike_service_for_setup.script_paths.lock() {
                    paths.insert(
                        "resource_dir".to_string(),
                        resource_dir.to_string_lossy().to_string(),
                    );
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_window_event(window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(MongoDBState::new())
        .manage(MySqlService::new())
        .manage(PythonService::new())
        .manage(SqliteService::new())
        .manage(ApiServerState::default())
        .manage(trend_spike_service)
        .manage(VSCodeWebSocketState::new())
        .manage(ClaudeMcpState::new())
        .manage(PuppeteerMcpState::new())
        .manage(ChromeExtWebSocketState::new())
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
            mysql_execute_param_query,
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
            delete_qa_pair,
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
            download_image,
            // update_system_appearance,
            fetch_chrome_targets,
            open_chrome_in_terminal,
            get_project_structure,
            generate_structure_text,
            is_valid_path,
            create_copies_for_files,
            check_drag_drop_dir_exists,
            open_drag_drop_dir,
            load_references,
            save_references,
            start_vscode_ws_server,
            stop_vscode_ws_server,
            get_vscode_ws_status,
            send_code_diff_to_vscode,
            send_chat_to_vscode,
            send_open_file_to_vscode,
            get_file_info,
            search_files,
            copy_directory,
            read_text_file_secure,
            write_text_file_secure,
            generate_file_tree,
            start_claude_mcp_server,
            stop_claude_mcp_server,
            get_claude_mcp_status,
            add_claude_mcp_directory,
            remove_claude_mcp_directory,
            // MCP server commands
            start_puppeteer_mcp_server,
            stop_puppeteer_mcp_server,
            get_puppeteer_mcp_status,
            get_puppeteer_mcp_directories,
            get_puppeteer_mcp_tools,
            add_puppeteer_mcp_directory,
            update_puppeteer_mcp_directory,
            remove_puppeteer_mcp_directory,
            get_puppeteer_mcp_config,
            update_puppeteer_mcp_config,
            send_to_puppeteer_mcp,
            start_chrome_ws_server,
            stop_chrome_ws_server,
            get_chrome_ws_status,
            send_message_to_chrome,
            get_chrome_ws_clients,
            send_targeted_message_to_chrome
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// #[tauri::command]
// fn update_system_appearance(dark: bool) -> Result<(), String> {
//   #[cfg(target_os = "macos")]
//   {
//     // First, try with Cocoa API
//     unsafe {
//       use cocoa::appkit::NSApp;
//       use cocoa::base::{id, nil};
//       use cocoa::foundation::NSString;
//       use objc::{class, msg_send, sel, sel_impl};

//       let app: id = NSApp();

//       let appearance_name = if dark { "NSAppearanceNameDarkAqua" } else { "NSAppearanceNameAqua" };
//       println!("Updating appearance to: {}", appearance_name);

//       let ns_string_class = class!(NSString);
//       let ns_appearance_name: id = msg_send![ns_string_class, stringWithUTF8String:appearance_name.as_ptr()];

//       let nsappearance_class = class!(NSAppearance);
//       let appearance: id = msg_send![nsappearance_class, appearanceNamed:ns_appearance_name];

//       let _: () = msg_send![app, setAppearance:appearance];

//       let windows: id = msg_send![app, windows];
//       let count: usize = msg_send![windows, count];

//       println!("Found {} windows to update", count);
//       for i in 0..count {
//         let window: id = msg_send![windows, objectAtIndex:i];
//         let _: () = msg_send![window, setAppearance:appearance];
//         println!("Updated window at index {}", i);
//       }
//     }

//     // Then also try with AppleScript as a backup approach
//     // This will affect the entire system appearance which will include our window
//     use std::process::Command;

//     let script = format!("tell application \"System Events\" to tell appearance preferences to set dark mode to {}",
//                         if dark { "true" } else { "false" });

//     match Command::new("osascript").arg("-e").arg(script).output() {
//       Ok(_) => println!("System appearance updated via AppleScript"),
//       Err(e) => println!("Failed to update system appearance via AppleScript: {}", e)
//     }
//   }

//   Ok(())
// }
