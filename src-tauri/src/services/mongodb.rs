// src-tauri/src/services/mongodb.rs
use mongodb::{Client, options::ClientOptions};
use std::sync::Mutex;

pub struct MongoDBState {
    client: Mutex<Option<Client>>,
    status: Mutex<String>,
}

#[tauri::command]
pub async fn start_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    let mut status = state.status.lock().unwrap();
    if *status == "running" {
        return Err("MongoDB is already running".to_string());
    }

    let client_options = ClientOptions::parse("mongodb://localhost:27018")
        .await
        .map_err(|e| e.to_string())?;

    let client = Client::with_options(client_options)
        .map_err(|e| e.to_string())?;

    // Test the connection
    client
        .list_database_names(None, None)
        .await
        .map_err(|e| e.to_string())?;

    let mut client_state = state.client.lock().unwrap();
    *client_state = Some(client);
    *status = "running".to_string();

    Ok("MongoDB started successfully".to_string())
}

#[tauri::command]
pub async fn stop_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    let mut status = state.status.lock().unwrap();
    if *status == "stopped" {
        return Err("MongoDB is already stopped".to_string());
    }

    let mut client_state = state.client.lock().unwrap();
    *client_state = None;
    *status = "stopped".to_string();

    Ok("MongoDB stopped successfully".to_string())
}