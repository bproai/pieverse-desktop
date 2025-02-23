use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
use sqlx::{Row, Column, TypeInfo};  // Added TypeInfo here
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub enum MySqlError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    #[error("Query error: {0}")]
    QueryError(String),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MySqlConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: String,
}

pub struct MySqlService {
    pool: Arc<Mutex<Option<MySqlPool>>>,
}

impl MySqlService {
    pub fn new() -> Self {
        Self {
            pool: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn connect(&self, config: MySqlConfig) -> Result<(), MySqlError> {
        let connection_string = format!(
            "mysql://{}:{}@{}:{}/{}",
            config.username, config.password, config.host, config.port, config.database
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(5)
            .connect(&connection_string)
            .await
            .map_err(|e| MySqlError::ConnectionError(e.to_string()))?;

        let mut pool_guard = self.pool.lock().await;
        *pool_guard = Some(pool);
        
        Ok(())
    }

    pub async fn test_connection(&self) -> Result<bool, MySqlError> {
        let pool_guard = self.pool.lock().await;
        if let Some(pool) = &*pool_guard {
            sqlx::query("SELECT 1")
                .fetch_one(pool)
                .await
                .map_err(|e| MySqlError::QueryError(e.to_string()))?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn execute_query(&self, query: &str) -> Result<Vec<serde_json::Value>, MySqlError> {
        let pool_guard = self.pool.lock().await;
        if let Some(pool) = &*pool_guard {
            let rows = sqlx::query(query)
                .fetch_all(pool)
                .await
                .map_err(|e| MySqlError::QueryError(e.to_string()))?;

            let results = rows.iter().map(|row| {
                let columns = row.columns();
                let mut map = serde_json::Map::new();
                
                for (i, column) in columns.iter().enumerate() {
                    let type_info = column.type_info();
                    
                    let value = match type_info.name() {
                        // Integer types
                        "BIGINT" | "INT" | "MEDIUMINT" | "SMALLINT" | "TINYINT" => {
                            match row.try_get::<i64, _>(i) {
                                Ok(v) => serde_json::Value::Number(v.into()),
                                Err(_) => serde_json::Value::Null
                            }
                        }
                        // Floating point types
                        "FLOAT" | "DOUBLE" | "DECIMAL" => {
                            match row.try_get::<f64, _>(i) {
                                Ok(v) if v.is_finite() => {
                                    serde_json::Number::from_f64(v)
                                        .map(serde_json::Value::Number)
                                        .unwrap_or(serde_json::Value::Null)
                                }
                                _ => serde_json::Value::Null
                            }
                        }
                        // Date and Time types
                        "DATETIME" | "TIMESTAMP" => {
                            match row.try_get::<String, _>(i) {
                                Ok(v) => serde_json::Value::String(v),
                                Err(_) => serde_json::Value::Null
                            }
                        }
                        // Default to string for all other types
                        _ => {
                            match row.try_get::<String, _>(i) {
                                Ok(v) => serde_json::Value::String(v),
                                Err(_) => serde_json::Value::Null
                            }
                        }
                    };
                    
                    map.insert(column.name().to_string(), value);
                }
                
                serde_json::Value::Object(map)
            }).collect();

            Ok(results)
        } else {
            Err(MySqlError::ConnectionError("Not connected".to_string()))
        }
    }

    pub async fn get_tables(&self) -> Result<Vec<String>, MySqlError> {
        let pool_guard = self.pool.lock().await;
        if let Some(pool) = &*pool_guard {
            let rows = sqlx::query("SHOW TABLES")
                .fetch_all(pool)
                .await
                .map_err(|e| MySqlError::QueryError(e.to_string()))?;

            let tables = rows
                .iter()
                .map(|row| {
                    let value: String = row.try_get(0).unwrap_or_default();
                    value
                })
                .collect();

            Ok(tables)
        } else {
            Err(MySqlError::ConnectionError("Not connected".to_string()))
        }
    }

    pub async fn get_table_schema(&self, table_name: &str) -> Result<Vec<serde_json::Value>, MySqlError> {
        let pool_guard = self.pool.lock().await;
        if let Some(pool) = &*pool_guard {
            let query = format!("DESCRIBE {}", table_name);
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| MySqlError::QueryError(e.to_string()))?;

            let schema = rows.iter().map(|row| {
                let mut map = serde_json::Map::new();
                let columns = row.columns();
                
                for (i, column) in columns.iter().enumerate() {
                    let value: String = row.try_get(i).unwrap_or_default();
                    map.insert(column.name().to_string(), serde_json::Value::String(value));
                }
                
                serde_json::Value::Object(map)
            }).collect();

            Ok(schema)
        } else {
            Err(MySqlError::ConnectionError("Not connected".to_string()))
        }
    }
}

#[tauri::command]
pub async fn mysql_connect(
    state: tauri::State<'_, MySqlService>,
    config: MySqlConfig,
) -> Result<(), String> {
    state.connect(config).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mysql_execute_query(
    state: tauri::State<'_, MySqlService>,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    state.execute_query(&query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mysql_test_connection(
    state: tauri::State<'_, MySqlService>,
) -> Result<bool, String> {
    state.test_connection().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mysql_get_tables(
    state: tauri::State<'_, MySqlService>,
) -> Result<Vec<String>, String> {
    state.get_tables().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mysql_get_table_schema(
    state: tauri::State<'_, MySqlService>,
    table_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    state.get_table_schema(&table_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mysql_disconnect(
    _state: tauri::State<'_, MySqlService>,
) -> Result<(), String> {
    Ok(()) // Implement if needed
}