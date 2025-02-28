// src-tauri/src/lib.rs
mod services;
mod tray;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Setup tray icon handlers
            tray::setup_tray_handler(&app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_window_event(window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .manage(MongoDBState::new())
        .manage(MySqlService::new())
        .manage(PythonService::new())
        .manage(SqliteService::new())
        .manage(ApiServerState::default())
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
            openai_4o_mini
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}