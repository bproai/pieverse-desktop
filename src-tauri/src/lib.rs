mod services;

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
    }
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MongoDBState::new())
        .manage(MySqlService::new())
        .manage(PythonService::new())
        .manage(SqliteService::new().expect("Failed to create SQLite service"))
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
            mysql_disconnect,
            // Python commands
            python_init,
            python_execute,
            python_reset,
            // SQLite commands
            sqlite_init,
            sqlite_execute_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}