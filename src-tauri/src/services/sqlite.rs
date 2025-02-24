// src-tauri/src/services/sqlite.rs
use rusqlite::{Connection, Result, Row};
use serde_json::Value;
use std::sync::Mutex;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum SqliteError {
    #[error("Database error: {0}")]
    DatabaseError(String),
}

pub struct SqliteService {
    connection: Mutex<Connection>,
}

impl Default for SqliteService {
    fn default() -> Self {
        Self::new().expect("Failed to create SQLite service")
    }
}

impl SqliteService {
    pub fn new() -> Result<Self, SqliteError> {
        let db_path = PathBuf::from("prompts.db");
        let conn = Connection::open(db_path)
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))?;
        
        Ok(Self {
            connection: Mutex::new(conn),
        })
    }

    pub fn init_database(&self) -> Result<(), SqliteError> {
        let conn = self.connection.lock().unwrap();
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
        ).map_err(|e| SqliteError::DatabaseError(e.to_string()))?;

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
        let conn = self.connection.lock().unwrap();
        let mut stmt = conn.prepare(query)
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))?;

        let rows = stmt.query_map([], |row| {
            Ok(Self::row_to_json(row).unwrap())
        }).map_err(|e| SqliteError::DatabaseError(e.to_string()))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| SqliteError::DatabaseError(e.to_string()))
    }
}

#[tauri::command]
pub async fn sqlite_init(state: tauri::State<'_, SqliteService>) -> Result<(), String> {
    state.init_database()
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