// src-tauri/src/services/s3_lite.rs - Fixed Response handling
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use tauri::{Runtime, Builder, AppHandle, State, UriSchemeContext};
use tauri::http::Response;
use tauri::{Manager};
pub struct S3LiteState {
    db_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct S3FileEntry {
    pub bucket: String,
    pub key: String,
    pub mime_type: String,
    pub size: usize,
    pub created_at: String,
}

impl S3LiteState {
    pub fn new(app_handle: &tauri::AppHandle) -> Self {
        // Get the app data directory
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        
        fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
        
        let db_path = app_data_dir.join("s3lite.db").to_string_lossy().to_string();
        println!("S3Lite Database Path: {}", db_path);
        
        // Initialize the database
        let conn = Connection::open(&db_path).expect("Failed to open database");
        conn.execute(
            "CREATE TABLE IF NOT EXISTS s3_files (
                bucket TEXT NOT NULL,
                key TEXT NOT NULL,
                data BLOB NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (bucket, key)
            )",
            [],
        ).expect("Failed to create table");
        
        Self { db_path }
    }
    
    // Get connection to the database
    fn get_connection(&self) -> SqliteResult<Connection> {
        Connection::open(&self.db_path)
    }

    // Store a file in the database
    pub fn store_file(&self, bucket: &str, key: &str, data: &[u8], mime_type: &str) -> Result<(), Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        conn.execute(
            "INSERT OR REPLACE INTO s3_files (bucket, key, data, mime_type, size) VALUES (?, ?, ?, ?, ?)",
            params![bucket, key, data, mime_type, data.len()],
        )?;
        
        Ok(())
    }
    
    // Retrieve a file from the database
    pub fn get_file(&self, bucket: &str, key: &str) -> Result<Option<(Vec<u8>, String)>, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let mut stmt = conn.prepare("SELECT data, mime_type FROM s3_files WHERE bucket = ? AND key = ?")?;
            
        let result = stmt.query_row(params![bucket, key], |row| {
            let data: Vec<u8> = row.get(0)?;
            let mime_type: String = row.get(1)?;
            Ok((data, mime_type))
        });
        
        match result {
            Ok(file_data) => Ok(Some(file_data)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Box::new(e)),
        }
    }
    
    // Delete a file from the database
    pub fn delete_file(&self, bucket: &str, key: &str) -> Result<bool, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let affected = conn.execute(
            "DELETE FROM s3_files WHERE bucket = ? AND key = ?",
            params![bucket, key],
        )?;
        
        Ok(affected > 0)
    }
    
    // List files in a bucket
    pub fn list_files(&self, bucket: &str) -> Result<Vec<S3FileEntry>, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let mut stmt = conn.prepare(
            "SELECT bucket, key, mime_type, size, created_at 
             FROM s3_files 
             WHERE bucket = ? 
             ORDER BY key"
        )?;
            
        let file_iter = stmt.query_map(params![bucket], |row| {
            Ok(S3FileEntry {
                bucket: row.get(0)?,
                key: row.get(1)?,
                mime_type: row.get(2)?,
                size: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        
        let mut files = Vec::new();
        for file in file_iter {
            files.push(file?);
        }
        
        Ok(files)
    }
    
    // List all buckets
    pub fn list_buckets(&self) -> Result<Vec<String>, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let mut stmt = conn.prepare("SELECT DISTINCT bucket FROM s3_files ORDER BY bucket")?;
        
        let bucket_iter = stmt.query_map([], |row| {
            row.get::<_, String>(0)
        })?;
        
        let mut buckets = Vec::new();
        for bucket in bucket_iter {
            buckets.push(bucket?);
        }
        
        Ok(buckets)
    }
}

// Updated to use Response instead of ResponseBuilder
pub fn register_s3_protocol<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.register_uri_scheme_protocol(
        "s3",
        |context: UriSchemeContext<R>, request: tauri::http::Request<Vec<u8>>| -> Response<Vec<u8>> {
            let uri = request.uri().to_string();
            let path = uri.strip_prefix("s3://").unwrap_or(&uri);
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() < 2 {
                return Response::builder()
                    .status(404)
                    .body(Vec::new().into())
                    .unwrap();
            }
            let bucket = parts[0];
            let key = parts[1..].join("/");

            // Get the app handle from the context.
            let app_handle = context.app_handle();
            let state = app_handle.state::<S3LiteState>();
            match state.inner().get_file(bucket, &key) {
                Ok(Some((data, mime_type))) => {
                    Response::builder()
                        .header("Content-Type", &mime_type)
                        .body(data.into())
                        .unwrap_or_else(|_| Response::builder().status(500).body(Vec::new().into()).unwrap())
                },
                _ => Response::builder()
                        .status(404)
                        .body(Vec::new().into())
                        .unwrap_or_else(|_| Response::builder().status(500).body(Vec::new().into()).unwrap()),
            }
        },
    )
}


// Tauri commands

#[tauri::command]
pub async fn s3_upload(
    state: State<'_, S3LiteState>,
    bucket: String,
    key: String,
    data_base64: String,
    mime_type: String,
) -> Result<(), String> {
    // Decode base64 data
    let data = base64::decode(data_base64)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
    
    // Store the file
    state.store_file(&bucket, &key, &data, &mime_type)
        .map_err(|e| format!("Failed to store file: {}", e))
}

#[tauri::command]
pub async fn s3_delete(
    state: State<'_, S3LiteState>,
    bucket: String,
    key: String,
) -> Result<bool, String> {
    state.delete_file(&bucket, &key)
        .map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
pub async fn s3_list_files(
    state: State<'_, S3LiteState>,
    bucket: String,
) -> Result<Vec<S3FileEntry>, String> {
    state.list_files(&bucket)
        .map_err(|e| format!("Failed to list files: {}", e))
}

#[tauri::command]
pub async fn s3_list_buckets(
    state: State<'_, S3LiteState>,
) -> Result<Vec<String>, String> {
    state.list_buckets()
        .map_err(|e| format!("Failed to list buckets: {}", e))
}

#[tauri::command]
pub async fn s3_create_bucket(
    _state: State<'_, S3LiteState>,
    bucket: String,
) -> Result<(), String> {
    // Creating a bucket doesn't require any action since buckets
    // are implicitly created when files are uploaded
    // We can just verify the bucket name is valid
    if bucket.is_empty() || bucket.contains('/') {
        return Err("Invalid bucket name".into());
    }
    Ok(())
}

#[tauri::command]
pub fn s3_get_url(bucket: String, key: String) -> String {
    format!("s3://{}/{}", bucket, key)
}