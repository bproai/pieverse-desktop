// src-tauri/src/services/api_server.rs
use crate::services::sqlite::SqliteService;
use crate::services::sqlite_prompts::Prompt;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::TcpListener;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};
use tower_http::cors::CorsLayer;

use tauri::{AppHandle, Emitter};


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

    pub async fn start(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
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
            .route("/api/qa", post(Self::store_qa_data))
            .route("/api/qa", get(Self::get_qa_data))
            .route("/api/qa/:question_id", delete(Self::delete_qa_pair))
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

        // Emit the actual port back to frontend
        app_handle.emit("api-server-started", self.port)
            .map_err(|e| format!("Failed to emit event: {}", e))?;
        // --- End fix here ---

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
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
    ) -> Result<Json<Value>, ApiError> {
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query("SELECT 1") {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "healthy",
                "sqlite": "connected",
                "timestamp": chrono::Utc::now().to_rfc3339()
            }))),
            Err(e) => Err(ApiError(format!("SQLite check failed: {}", e))),
        }
    }

    async fn get_prompts(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
    ) -> Result<Json<Value>, ApiError> {
        let query = "SELECT * FROM prompts ORDER BY category, display_order";
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_query(query) {
            Ok(prompts) => Ok(Json(serde_json::json!({
                "status": "success",
                "prompts": prompts
            }))),
            Err(e) => Err(ApiError(e.to_string())),
        }
    }

    async fn create_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Json(prompt): Json<Prompt>,
    ) -> Result<Json<Value>, ApiError> {
        // No need for manual escaping with parameterized queries
        let query = "INSERT INTO prompts (title, description, category, display_order, is_active) 
                     VALUES (?, ?, ?, ?, ?)";

        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_parameterized(
            query,
            params![
                prompt.title,
                prompt.description,
                prompt.category,
                prompt.display_order,
                if prompt.is_active { 1 } else { 0 }
            ],
        ) {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "success",
                "message": "Prompt created successfully"
            }))),
            Err(e) => Err(ApiError(e.to_string())),
        }
    }

    async fn update_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Path(id): Path<i64>,
        Json(prompt): Json<Prompt>,
    ) -> Result<Json<Value>, ApiError> {
        let query = "UPDATE prompts SET 
        title = ?,
        description = ?,
        category = ?,
        display_order = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?";

        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_parameterized(
            query,
            params![
                prompt.title,
                prompt.description,
                prompt.category,
                prompt.display_order,
                if prompt.is_active { 1 } else { 0 },
                id
            ],
        ) {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "success",
                "message": "Prompt updated successfully"
            }))),
            Err(e) => Err(ApiError(e.to_string())),
        }
    }

    async fn delete_prompt(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Path(id): Path<i64>,
    ) -> Result<Json<Value>, ApiError> {
        let query = "DELETE FROM prompts WHERE id = ?";
        let sqlite_guard = sqlite.lock().await;
        match sqlite_guard.execute_parameterized(query, params![id]) {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "success",
                "message": "Prompt deleted successfully"
            }))),
            Err(e) => Err(ApiError(e.to_string())),
        }
    }

    async fn store_qa_data(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Json(data): Json<QAData>,
    ) -> Result<Json<Value>, ApiError> {
        // Log inbound data in development mode
        #[cfg(debug_assertions)]
        println!("Dev Log: Inbound QA upload received: {:?}", data);
    
        let sqlite_guard = sqlite.lock().await;
    
        // Create QA tables if they don't exist
        let create_questions = "CREATE TABLE IF NOT EXISTS qa_questions (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    question TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    answered INTEGER DEFAULT 0
                )";
        let create_answers = "CREATE TABLE IF NOT EXISTS qa_answers (
                    id TEXT PRIMARY KEY,
                    question_id TEXT NOT NULL,
                    message_id TEXT,
                    platform TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    model TEXT,
                    timestamp TEXT NOT NULL,
                    turn_number INTEGER,
                    metadata TEXT,
                    url TEXT
                )";
        sqlite_guard
            .execute_query(create_questions)
            .map_err(|e| ApiError(e.to_string()))?;
        sqlite_guard
            .execute_query(create_answers)
            .map_err(|e| ApiError(e.to_string()))?;
    
        // Process each question
        for question in &data.questions {
            #[cfg(debug_assertions)]
            println!("Dev Log: Processing question: {:?}", question);
    
            sqlite_guard.execute_parameterized(
                "INSERT OR REPLACE INTO qa_questions (id, platform, question, timestamp, answered)
                VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    question.id,
                    question.platform,
                    question.question,
                    question.timestamp,
                    if question.answered { 1 } else { 0 }
                ],
            ).map_err(|e| ApiError(e.to_string()))?;
        }
    
        // Process each answer
        for answer in &data.answers {
            #[cfg(debug_assertions)]
            println!("Dev Log: Processing answer: {:?}", answer);
    
            let answer_id = answer
                .id
                .clone()
                .unwrap_or_else(|| format!("a_{}", chrono::Utc::now().timestamp_millis()));
    
            #[cfg(debug_assertions)]
            println!(
                "Dev Log: Executing parameterized query for answer_id: {}",
                answer_id
            );
    
            // Execute the parameterized query
            match sqlite_guard.execute_parameterized(
                "INSERT OR REPLACE INTO qa_answers 
                 (id, question_id, message_id, platform, answer, model, timestamp, turn_number, metadata, url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    answer_id,
                    answer.question_id,
                    answer.message_id.as_ref().map(|v| v.as_str()),
                    answer.platform,
                    answer.answer,
                    answer.model,
                    answer.timestamp,
                    answer.turn_number,
                    answer.metadata.as_ref().map(|v| v.as_str()),
                    answer.url.as_ref().map(|v| v.as_str()),
                ],
            ) {
                Ok(_) => {
                    #[cfg(debug_assertions)]
                    println!("Dev Log: Successfully inserted/replaced answer with ID: {}", answer_id);
                },
                Err(e) => {
                    #[cfg(debug_assertions)]
                    println!("Dev Log: Error inserting/replacing answer: {}", e);
                    return Err(ApiError(e.to_string()));
                }
            }
    
            // More debug info for update
            #[cfg(debug_assertions)]
            println!(
                "Dev Log: Updating question answered status for question_id: {}",
                answer.question_id
            );
    
            // Update the question's answered status
            match sqlite_guard.execute_parameterized(
                "UPDATE qa_questions SET answered = 1 WHERE id = ?",
                params![answer.question_id],
            ) {
                Ok(_) => {
                    #[cfg(debug_assertions)]
                    println!("Dev Log: Successfully updated question answered status");
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    println!("Dev Log: Error updating question answered status: {}", e);
                    return Err(ApiError(e.to_string()));
                }
            }
        }
    
        #[cfg(debug_assertions)]
        println!(
            "Dev Log: Finished processing QA data. Stored {} questions and {} answers",
            data.questions.len(),
            data.answers.len()
        );
    
        // Clean up older unanswered questions
        sqlite_guard
            .execute_parameterized(
                "DELETE FROM qa_questions 
                WHERE answered = 0
                AND timestamp < (
                    SELECT MAX(timestamp) FROM qa_questions
                )",
                params![],
            )
            .map_err(|e| ApiError(e.to_string()))?;
    
        #[cfg(debug_assertions)]
        println!("Dev Log: Older unanswered questions cleaned up");
    
        // Clean up duplicate answers keeping only the most recent for each question_id
        sqlite_guard.execute_parameterized(
            "DELETE FROM qa_answers 
            WHERE id NOT IN (
                SELECT id FROM qa_answers a
                INNER JOIN (
                    SELECT question_id, MAX(timestamp) as latest_timestamp
                    FROM qa_answers
                    GROUP BY question_id
                ) latest ON a.question_id = latest.question_id AND a.timestamp = latest.latest_timestamp
            )",
            params![],
        ).map_err(|e| ApiError(e.to_string()))?;
    
        #[cfg(debug_assertions)]
        println!("Dev Log: Duplicate answers cleaned up - keeping only the latest per question");
            
        Ok(Json(serde_json::json!({
            "status": "success",
            "message": format!("Stored {} questions and {} answers", data.questions.len(), data.answers.len())
        })))
    }

    async fn get_qa_data(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        query_params: axum::extract::Query<std::collections::HashMap<String, String>>,
    ) -> Result<Json<Value>, ApiError> {
        let platform = query_params.get("platform");
        let limit = query_params
            .get("limit")
            .map(|s| s.parse::<i64>().unwrap_or(10))
            .unwrap_or(10);
        let offset = query_params
            .get("offset")
            .map(|s| s.parse::<i64>().unwrap_or(0))
            .unwrap_or(0);
        let search = query_params.get("search");

        let sqlite_guard = sqlite.lock().await;

        // Build a base query with placeholders
        let base_query = r#"
        SELECT 
            q.id AS question_id,
            q.platform,
            q.question,
            q.timestamp AS question_timestamp,
            q.answered,
            a.id AS answer_id,
            a.message_id,
            a.answer,
            a.model,
            a.timestamp AS answer_timestamp,
            a.turn_number,
            a.metadata,
            a.url
        FROM qa_questions q
        LEFT JOIN qa_answers a ON q.id = a.question_id
        "#;

        // Similar base query for count
        let base_count_query = r#"
        SELECT COUNT(DISTINCT q.id) AS total
        FROM qa_questions q
        LEFT JOIN qa_answers a ON q.id = a.question_id
        "#;

        // Build where clause and gather parameter values
        let mut conditions = Vec::new();
        let mut param_values: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(platform_value) = platform {
            if platform_value != "all" {
                conditions.push("q.platform = ?");
                param_values.push(platform_value.clone().into());
            }
        }

        if let Some(search_value) = search {
            if !search_value.is_empty() {
                conditions.push("(q.question LIKE ? OR a.answer LIKE ?)");
                let search_pattern = format!("%{}%", search_value);
                param_values.push(search_pattern.clone().into());
                param_values.push(search_pattern.into());
            }
        }

        // Create the full parameterized query
        let where_clause = if !conditions.is_empty() {
            format!("WHERE {}", conditions.join(" AND "))
        } else {
            String::new()
        };

        let main_query = format!(
            "{} {} ORDER BY q.timestamp DESC LIMIT ? OFFSET ?",
            base_query, where_clause
        );

        let count_query = format!("{} {}", base_count_query, where_clause);

        // Add limit and offset to parameters for main query
        let mut main_params = param_values.clone();
        main_params.push(limit.into());
        main_params.push(offset.into());

        // Use the new query_parameterized method
        let result = sqlite_guard
            .query_parameterized(&main_query, rusqlite::params_from_iter(main_params))
            .map_err(|e| ApiError(e.to_string()))?;

        // Get total count with the same conditions
        let count_result = sqlite_guard
            .query_parameterized(&count_query, rusqlite::params_from_iter(param_values))
            .map_err(|e| ApiError(e.to_string()))?;

        let total = if !count_result.is_empty() {
            count_result[0]
                .get("total")
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
        } else {
            0
        };

        Ok(Json(serde_json::json!({
            "status": "success",
            "data": {
                "total": total,
                "offset": offset,
                "limit": limit,
                "rows": result
            }
        })))
    }

    // Add this function inside the ApiServer impl block
    async fn delete_qa_pair(
        State(sqlite): State<Arc<Mutex<SqliteService>>>,
        Path(question_id): Path<String>,
    ) -> Result<Json<Value>, ApiError> {
        let sqlite_guard = sqlite.lock().await;
        
        // First delete associated answers
        let delete_answers_query = "DELETE FROM qa_answers WHERE question_id = ?";
        match sqlite_guard.execute_parameterized(delete_answers_query, params![question_id]) {
            Ok(_) => {},
            Err(e) => return Err(ApiError(format!("Failed to delete answers: {}", e)))
        }
        
        // Then delete the question
        let delete_question_query = "DELETE FROM qa_questions WHERE id = ?";
        match sqlite_guard.execute_parameterized(delete_question_query, params![question_id]) {
            Ok(_) => Ok(Json(serde_json::json!({
                "status": "success",
                "message": "Q&A pair deleted successfully"
            }))),
            Err(e) => Err(ApiError(format!("Failed to delete question: {}", e)))
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }
    
}

#[tauri::command]
pub async fn start_api_server(
    state: tauri::State<'_, SqliteService>,
    api_state: tauri::State<'_, ApiServerState>,
    app_handle: AppHandle,
    port: Option<u16>,
) -> Result<u16, String> {
    let requested_port = port.unwrap_or(3030);

    let guard = api_state.server.lock().await;
    if let Some(existing_server) = guard.as_ref() {
        // Always emit event when the command is called
        app_handle.emit("api-server-started", existing_server.port())
            .map_err(|e| e.to_string())?;
        return Ok(existing_server.port());
    }
    drop(guard);

    let mut port = requested_port;
    while !ApiServer::check_port_available(port) && port < 3040 {
        port += 1;
    }

    if port >= 3040 {
        return Err("No available ports found in range".into());
    }

    let state_ref = Arc::new(Mutex::new(state.inner().clone()));
    let server = ApiServer::new(state_ref, port);

    // Start and emit the event internally
    server.start(&app_handle).await?;
    app_handle.emit("api-server-started", port)
        .map_err(|e| e.to_string())?;

    let mut guard = api_state.server.lock().await;
    *guard = Some(server);

    Ok(port)
}

#[tauri::command]
pub async fn stop_api_server(api_state: tauri::State<'_, ApiServerState>) -> Result<(), String> {
    let mut guard = api_state.server.lock().await;
    if let Some(server) = guard.take() {
        server.stop();
        Ok(())
    } else {
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuestionData {
    pub id: String,
    pub platform: String,
    pub question: String,
    pub timestamp: String,
    pub answered: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerData {
    pub id: Option<String>,
    pub question_id: String,
    pub message_id: Option<String>,
    pub platform: String,
    pub answer: String,
    pub model: String,
    pub timestamp: String,
    pub turn_number: Option<i32>,
    pub metadata: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QAData {
    pub questions: Vec<QuestionData>,
    pub answers: Vec<AnswerData>,
}

#[tauri::command]
pub async fn delete_qa_pair(
    api_state: tauri::State<'_, ApiServerState>,
    question_id: String
) -> Result<(), String> {
    // Check if server is running
    let guard = api_state.server.lock().await;
    if guard.is_none() {
        return Err("API server is not running".to_string());
    }
    
    // Make HTTP request to our local API server
    let client = reqwest::Client::new();
    let response = client
        .delete(&format!("http://localhost:3030/api/qa/{}", question_id))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to API server: {}", e))?;
        
    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Failed to delete Q&A pair: {}", error_text))
    }
}