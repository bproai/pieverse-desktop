use mongodb::{options::ClientOptions, Client};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct MongoDBState {
    client: Arc<Mutex<Option<Client>>>,
    status: Arc<Mutex<String>>,
}

impl MongoDBState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new("stopped".to_string())),
        }
    }
}

#[tauri::command]
pub async fn start_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    {
        let status = state.status.lock().await;
        if *status == "running" {
            return Err("MongoDB is already running".to_string());
        }
    }

    let client_options = ClientOptions::parse("mongodb://localhost:27017")
        .await
        .map_err(|e| e.to_string())?;

    let client = Client::with_options(client_options).map_err(|e| e.to_string())?;

    // Test the connection
    client
        .list_database_names()
        .await
        .map_err(|e| e.to_string())?;

    {
        let mut client_state = state.client.lock().await;
        *client_state = Some(client);
    }

    {
        let mut status = state.status.lock().await;
        *status = "running".to_string();
    }

    Ok("MongoDB started successfully".to_string())
}

#[tauri::command]
pub async fn stop_mongodb(state: tauri::State<'_, MongoDBState>) -> Result<String, String> {
    {
        let status = state.status.lock().await;
        if *status == "stopped" {
            return Err("MongoDB is already stopped".to_string());
        }
    }

    {
        let mut client_state = state.client.lock().await;
        *client_state = None;
    }

    {
        let mut status = state.status.lock().await;
        *status = "stopped".to_string();
    }

    Ok("MongoDB stopped successfully".to_string())
}

#[tauri::command]
pub async fn list_mongodb_databases(
    state: tauri::State<'_, MongoDBState>,
) -> Result<Vec<String>, String> {
    let client_state = state.client.lock().await;
    match &*client_state {
        Some(client) => client
            .list_database_names()
            .await
            .map_err(|e| e.to_string()),
        None => Err("MongoDB is not connected".to_string()),
    }
}

#[tauri::command]
pub async fn list_mongodb_collections(
    state: tauri::State<'_, MongoDBState>,
    database_name: String,
) -> Result<Vec<String>, String> {
    let client_state = state.client.lock().await;
    match &*client_state {
        Some(client) => {
            let db = client.database(&database_name);
            db.list_collection_names().await.map_err(|e| e.to_string())
        }
        None => Err("MongoDB is not connected".to_string()),
    }
}

#[tauri::command]
pub async fn test_mongodb_connection(
    state: tauri::State<'_, MongoDBState>,
) -> Result<bool, String> {
    let client_state = state.client.lock().await;
    match &*client_state {
        Some(client) => match client.list_database_names().await {
            Ok(_) => Ok(true),
            Err(e) => Err(e.to_string()),
        },
        None => Ok(false),
    }
}
