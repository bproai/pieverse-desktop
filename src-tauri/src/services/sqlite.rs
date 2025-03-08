// src-tauri/src/services/sqlite.rs
use rusqlite::{Connection, Result, Row};
use serde_json::Value;
use std::sync::{Arc, Mutex};  // Added Arc here
use tauri::AppHandle;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum SqliteError {
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("Path error: {0}")]
    PathError(String),
}

#[derive(Clone)]
pub struct SqliteService {
    connection: Arc<Mutex<Option<Connection>>>,
}

impl SqliteService {
    pub fn new() -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn init_database(&self, _app: &AppHandle) -> Result<(), SqliteError> {
        let app_dir = if cfg!(debug_assertions) {
            // Development mode
            PathBuf::from(".local/share/pieverse")
        } else {
            // Production mode
            dirs::data_local_dir()
                .ok_or_else(|| SqliteError::PathError("Could not get local data directory".to_string()))?
                .join("pieverse")
        };
        
        // Create app directory if it doesn't exist
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| SqliteError::PathError(format!("Failed to create directory: {}", e)))?;
        
        let db_path = app_dir.join("prompts.db");
        println!("SQLite database path: {:?}", db_path); // Debug log
        
        let conn = Connection::open(&db_path)
            .map_err(|e| SqliteError::DatabaseError(format!("Failed to open database at {:?}: {}", db_path, e)))?;
    
        conn.execute(
            "CREATE TABLE IF NOT EXISTS prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                display_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        ).map_err(|e| SqliteError::DatabaseError(format!("Failed to create table: {}", e)))?;
    
        let mut conn_guard = self.connection.lock().unwrap();
        *conn_guard = Some(conn);
    
        Ok(())
    }

    fn row_to_json(row: &Row) -> Result<Value, SqliteError> {
        let mut map = serde_json::Map::new();
        
        let stmt = row.as_ref();
        let column_count = stmt.column_count();
        
        for i in 0..column_count {
            let name = stmt.column_name(i)
                .map_err(|e| SqliteError::DatabaseError(e.to_string()))?;
            
            let value = match name {
                "id" => Value::Number(row.get::<_, i64>(i).unwrap().into()),
                "title" | "description" | "category" => {
                    let val: String = row.get(i).unwrap_or_default();
                    Value::String(val)
                },
                "display_order" => Value::Number(row.get::<_, i64>(i).unwrap().into()),
                "is_active" => Value::Number(row.get::<_, i64>(i).unwrap().into()),
                "created_at" | "updated_at" => {
                    let val: String = row.get(i).unwrap_or_default();
                    Value::String(val)
                },
                _ => Value::Null,
            };
            map.insert(name.to_string(), value);
        }
        
        Ok(Value::Object(map))
    }

    pub fn execute_query(&self, query: &str) -> Result<Vec<Value>, SqliteError> {
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref()
            .ok_or_else(|| SqliteError::DatabaseError("Database not initialized".to_string()))?;

        let mut stmt = conn.prepare(query)
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))?;

        let rows = stmt.query_map([], |row| {
            Ok(Self::row_to_json(row).unwrap())
        }).map_err(|e| SqliteError::DatabaseError(e.to_string()))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))
    }

    pub fn execute_parameterized<P>(&self, query: &str, params: P) -> Result<(), SqliteError> 
    where 
        P: rusqlite::Params
    {
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref()
            .ok_or_else(|| SqliteError::DatabaseError("Database not initialized".to_string()))?;
    
        conn.execute(query, params)
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))?;
        
        Ok(())
    }    
    
}

#[tauri::command]
pub async fn sqlite_init(
    state: tauri::State<'_, SqliteService>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    state.init_database(&app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sqlite_execute_query(
    state: tauri::State<'_, SqliteService>,
    query: String,
) -> Result<Vec<Value>, String> {
    state.execute_query(&query)
        .map_err(|e| e.to_string())
}