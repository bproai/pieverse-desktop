// src-tauri/src/lib.rs

mod services;

use services::mongodb::{
    MongoDBState,
    start_mongodb,
    stop_mongodb,
    list_mongodb_databases,
    list_mongodb_collections,
    test_mongodb_connection,
};

use services::mysql::{
    MySqlService,
    mysql_connect,
    mysql_execute_query,
    mysql_test_connection,
    mysql_get_tables,
    mysql_get_table_schema,
    mysql_disconnect,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Initialize any plugins (e.g., for opening external URLs)
        .plugin(tauri_plugin_opener::init())
        // Manage state for your services
        .manage(MongoDBState::new())
        .manage(MySqlService::new())
        // Register all Tauri commands
        .invoke_handler(tauri::generate_handler![
            greet,
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
            mysql_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
