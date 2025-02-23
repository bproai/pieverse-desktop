// src-tauri/src/lib.rs
use mongodb::{Client, options::ClientOptions};
use std::sync::Mutex;

pub struct MongoDBState {
    client: Mutex<Option<Client>>,
    status: Mutex<String>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn start_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    // Check status first and release the lock
    {
        let status = state.status.lock().unwrap();
        if *status == "running" {
            return Err("MongoDB is already running".to_string());
        }
    }

    let client_options = ClientOptions::parse("mongodb://localhost:27017")
        .await
        .map_err(|e| e.to_string())?;

    let client = Client::with_options(client_options)
        .map_err(|e| e.to_string())?;

    // Test the connection
    client
        .list_database_names()
        .await
        .map_err(|e| e.to_string())?;

    // Update state after successful connection
    {
        let mut client_state = state.client.lock().unwrap();
        *client_state = Some(client);
    }
    
    {
        let mut status = state.status.lock().unwrap();
        *status = "running".to_string();
    }

    Ok("MongoDB started successfully".to_string())
}

#[tauri::command]
async fn stop_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    // Check status first and release the lock
    {
        let status = state.status.lock().unwrap();
        if *status == "stopped" {
            return Err("MongoDB is already stopped".to_string());
        }
    }

    {
        let mut client_state = state.client.lock().unwrap();
        *client_state = None;
    }

    {
        let mut status = state.status.lock().unwrap();
        *status = "stopped".to_string();
    }

    Ok("MongoDB stopped successfully".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MongoDBState {
            client: Mutex::new(None),
            status: Mutex::new("stopped".to_string()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_mongodb, 
            stop_mongodb
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}