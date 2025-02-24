// src-tauri/src/services/api_server.rs
use axum::{
    routing::{get, post, put, delete},
    Router,
    Json,
    extract::{State, Path},
    response::IntoResponse,
    http::StatusCode,
};
use serde_json::Value;
use std::sync::Arc;
use std::net::TcpListener;
use tokio::sync::{Mutex, watch};
use tower_http::cors::CorsLayer;
use crate::services::sqlite::SqliteService;
use crate::services::sqlite_prompts::Prompt;

// Changed to single error type since ServerError is never used
#[derive(Debug)]
pub struct ApiError(String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let body = Json(serde_json::json!({
            "status": "error",
            "message": self.0
        }));

        (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
    }
}

pub struct ApiServerState {
    server: Arc<Mutex<Option<ApiServer>>>,
}

impl Default for ApiServerState {
    fn default() -> Self {
        Self {
            server: Arc::new(Mutex::new(None)),
        }
    }
}

pub struct ApiServer {
    sqlite: Arc<Mutex<SqliteService>>,
    port: u16,
    shutdown: watch::Sender<bool>,
}

impl ApiServer {
    pub fn new(sqlite: Arc<Mutex<SqliteService>>, port: u16) -> Self {
        let (shutdown_tx, _) = watch::channel(false);
        Self { 
            sqlite, 
            port,
            shutdown: shutdown_tx,
        }
    }

    pub fn check_port_available(port: u16) -> bool {
        TcpListener::bind(("127.0.0.1", port)).is_ok()
    }

    pub async fn start(&self) -> Result<(), String> {
        if !Self::check_port_available(self.port) {
            return Err(format!("Port {} is already in use", self.port));
        }

        let cors = CorsLayer::permissive();
        let router = Router::new()
            .route("/api/prompts", get(Self::get_prompts))
            .route("/api/prompts", post(Self::create_prompt))
            .route("/api/prompts/:id", put(Self::update_prompt))
            .route("/api/prompts/:id", delete(Self::delete_prompt))
            .route("/api/status", get(Self::get_status))
            .route("/api/health", get(Self::health_check))
            .with_state(self.sqlite.clone())
            .layer(cors);

        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], self.port));
        println!("API server attempting to start on http://{}", addr);

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                let error_msg = format!("Failed to bind server: {}", e);
                println!("{}", error_msg);
                return Err(error_msg);
            }
        };

        println!("API server successfully bound to address");

        let mut shutdown_rx = self.shutdown.subscribe();
        
        tokio::spawn(async move {
            println!("Starting API server...");
            let server = axum::serve(listener, router);
            tokio::select! {
                result = server => {
                    if let Err(e) = result {
                        println!("Server error: {}", e);
                    }
                },
                _ = shutdown_rx.changed() => {
                    println!("API server received shutdown signal");
                }
            }
        });

        println!("API server startup complete");
        Ok(())
    }

    pub fn stop(&self) {
        let _ = self.shutdown.send(true);
        println!("API server stop signal sent");
    }

    async fn get_status() -> impl IntoResponse {
        Json(serde_json::json!({
            "status": "running",
            "version": env!("CARGO_PKG_VERSION"),
            "timestamp": chrono::Utc::now().to_rfc3339()
        }))
    }

    async fn health_check(
        State(sqlite): State<Arc<Mutex<SqliteService>>>
    ) -> Result<Json<Value>, ApiError> {
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query("SELECT 1") {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "healthy",
                "sqlite": "connected",
                "timestamp": chrono::Utc::now().to_rfc3339()
            }))),
            Err(e) => Err(ApiError(format!("SQLite check failed: {}", e)))
        }
    }

    async fn get_prompts(
        State(sqlite): State<Arc<Mutex<SqliteService>>>
    ) -> Result<Json<Value>, ApiError> {
        let query = "SELECT * FROM prompts ORDER BY category, display_order";
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query(query) {
            Ok(prompts) => Ok(Json(serde_json::json!({ 
                "status": "success",
                "prompts": prompts 
            }))),
            Err(e) => Err(ApiError(e.to_string()))
        }
    }

    async fn create_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Json(prompt): Json<Prompt>
    ) -> Result<Json<Value>, ApiError> {
        let title = prompt.title.replace('\'', "''");
        let description = prompt.description
            .map(|d| d.replace('\'', "''"))
            .map_or("NULL".to_string(), |d| format!("'{}'", d));
        let category = prompt.category.replace('\'', "''");

        let query = format!(
            "INSERT INTO prompts (title, description, category, display_order, is_active) 
             VALUES ('{}', {}, '{}', {}, {})",
            title,
            description,
            category,
            prompt.display_order,
            if prompt.is_active { 1 } else { 0 }
        );

        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query(&query) {
            Ok(_) => Ok(Json(serde_json::json!({ 
                "status": "success",
                "message": "Prompt created successfully" 
            }))),
            Err(e) => Err(ApiError(e.to_string()))
        }
    }

    async fn update_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Path(id): Path<i64>,
        Json(prompt): Json<Prompt>
    ) -> Result<Json<Value>, ApiError> {
        let title = prompt.title.replace('\'', "''");
        let description = prompt.description
            .map(|d| d.replace('\'', "''"))
            .map_or("NULL".to_string(), |d| format!("'{}'", d));
        let category = prompt.category.replace('\'', "''");

        let query = format!(
            "UPDATE prompts SET 
             title = '{}',
             description = {},
             category = '{}',
             display_order = {},
             is_active = {},
             updated_at = CURRENT_TIMESTAMP
             WHERE id = {}",
            title,
            description,
            category,
            prompt.display_order,
            if prompt.is_active { 1 } else { 0 },
            id
        );

        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query(&query) {
            Ok(_) => Ok(Json(serde_json::json!({ 
                "status": "success",
                "message": "Prompt updated successfully" 
            }))),
            Err(e) => Err(ApiError(e.to_string()))
        }
    }

    async fn delete_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Path(id): Path<i64>
    ) -> Result<Json<Value>, ApiError> {
        let query = format!("DELETE FROM prompts WHERE id = {}", id);
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query(&query) {
            Ok(_) => Ok(Json(serde_json::json!({ 
                "status": "success",
                "message": "Prompt deleted successfully" 
            }))),
            Err(e) => Err(ApiError(e.to_string()))
        }
    }
}

#[tauri::command]
pub async fn start_api_server(
    state: tauri::State<'_, SqliteService>,
    api_state: tauri::State<'_, ApiServerState>,
    port: Option<u16>
) -> Result<(), String> {
    let port = port.unwrap_or(3030);
    
    let guard = api_state.server.lock().await;
    if guard.is_some() {
        return Ok(());
    }
    drop(guard);
    
    if !ApiServer::check_port_available(port) {
        return Err(format!("Port {} is already in use", port));
    }

    let state_ref = Arc::new(Mutex::new(state.inner().clone()));
    let server = ApiServer::new(state_ref, port);
    
    server.start().await?;
    
    let mut guard = api_state.server.lock().await;
    *guard = Some(server);
    
    Ok(())
}

#[tauri::command]
pub async fn stop_api_server(
    api_state: tauri::State<'_, ApiServerState>,
) -> Result<(), String> {
    let mut guard = api_state.server.lock().await;
    if let Some(server) = guard.take() {
        server.stop();
        Ok(())
    } else {
        Ok(())
    }
}