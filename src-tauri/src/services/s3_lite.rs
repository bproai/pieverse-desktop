// src-tauri/src/services/s3_lite.rs - Fixed Response handling
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use tauri::{Runtime, Builder, AppHandle, State, UriSchemeContext};
use tauri::http::Response;
use tauri::{Manager};
use zip::{ZipWriter, write::FileOptions};
use std::path::Path;
use std::fs::File;
use std::io::Write;

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
        
        // Create the files table
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
        ).expect("Failed to create files table");
        
        // Create a dedicated buckets table to store bucket names
        conn.execute(
            "CREATE TABLE IF NOT EXISTS s3_buckets (
                name TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        ).expect("Failed to create buckets table");
        
        Self { db_path }
    }
    
    // Other methods remain the same...
    
    // Add a method to create a bucket
    pub fn create_bucket(&self, bucket: &str) -> Result<(), Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        conn.execute(
            "INSERT OR IGNORE INTO s3_buckets (name) VALUES (?)",
            params![bucket],
        )?;
        
        Ok(())
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
        
        // First get all buckets from the dedicated table
        let mut stmt = conn.prepare("SELECT name FROM s3_buckets ORDER BY name")?;
        
        let bucket_iter = stmt.query_map([], |row| {
            row.get::<_, String>(0)
        })?;
        
        let mut buckets = Vec::new();
        for bucket in bucket_iter {
            buckets.push(bucket?);
        }
        
        // Also include any buckets that might exist in s3_files but not in s3_buckets
        // This ensures backward compatibility
        let mut stmt = conn.prepare(
            "SELECT DISTINCT bucket FROM s3_files 
             WHERE bucket NOT IN (SELECT name FROM s3_buckets) 
             ORDER BY bucket"
        )?;
        
        let file_bucket_iter = stmt.query_map([], |row| {
            row.get::<_, String>(0)
        })?;
        
        for bucket in file_bucket_iter {
            buckets.push(bucket?);
        }
        
        Ok(buckets)
    }

    pub fn rename_bucket(&self, old_name: &str, new_name: &str) -> Result<(), Box<dyn Error>> {
        // Validate the new bucket name
        if new_name.is_empty() || new_name.contains('/') {
            return Err("Invalid bucket name".into());
        }
        
        let conn = self.get_connection()?;
        
        // Begin a transaction for atomicity
        conn.execute("BEGIN TRANSACTION", [])?;
        
        // Try to execute all operations within the transaction
        let result: Result<(), Box<dyn Error>> = (|| {
            // First, rename the bucket in the s3_buckets table
            conn.execute(
                "UPDATE s3_buckets SET name = ? WHERE name = ?",
                params![new_name, old_name],
            )?;
            
            // Then, update all files in the s3_files table
            conn.execute(
                "UPDATE s3_files SET bucket = ? WHERE bucket = ?",
                params![new_name, old_name],
            )?;
            
            Ok(())
        })();
        
        // Commit or rollback based on the result
        if result.is_ok() {
            conn.execute("COMMIT", [])?;
        } else {
            conn.execute("ROLLBACK", [])?;
        }
        
        result
    }

    pub fn export_bucket_as_zip(&self, bucket: &str, export_path: &str) -> Result<(), Box<dyn Error>> {
        // Get connection to the database
        let conn = self.get_connection()?;
        
        // Query all image files in the bucket
        let mut stmt = conn.prepare(
            "SELECT key, data, mime_type FROM s3_files 
             WHERE bucket = ? AND mime_type LIKE 'image/%'
             ORDER BY key"
        )?;
        
        let files_iter = stmt.query_map(params![bucket], |row| {
            let key: String = row.get(0)?;
            let data: Vec<u8> = row.get(1)?;
            let mime_type: String = row.get(2)?;
            Ok((key, data, mime_type))
        })?;
        
        // Collect all files
        let mut files = Vec::new();
        for file in files_iter {
            files.push(file?);
        }
        
        if files.is_empty() {
            return Err("No image files found in bucket".into());
        }
        
        // Create zip file
        let zip_path = Path::new(export_path);
        let file = File::create(zip_path)?;
        
        let mut zip = ZipWriter::new(file);
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);
        
        // Add each file to the zip
        for (key, data, _) in files {
            // Clean up filename for zip
            let filename = key.replace("/", "_");
            
            // Add file to zip
            zip.start_file(filename, options)?;
            zip.write_all(&data)?;
        }
        
        // Finalize zip file
        zip.finish()?;
        
        Ok(())
    }
}

#[tauri::command]
pub async fn s3_export_bucket_as_zip(
    state: State<'_, S3LiteState>,
    bucket: String,
    export_path: String,
) -> Result<(), String> {
    // Validate the bucket name
    if bucket.is_empty() || bucket.contains('/') {
        return Err("Invalid bucket name".into());
    }
    
    // Export the bucket
    state.inner().export_bucket_as_zip(&bucket, &export_path)
        .map_err(|e| format!("Failed to export bucket: {}", e))
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
            
            // Join the remaining parts and URL decode the result
            let encoded_key = parts[1..].join("/");
            
            // URL decode the key to handle %20 (spaces) and other encoded characters
            let key = match urlencoding::decode(&encoded_key) {
                Ok(decoded) => decoded.into_owned(),
                Err(_) => encoded_key // Fall back to the original if decoding fails
            };

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
    state: State<'_, S3LiteState>,
    bucket: String,
) -> Result<(), String> {
    // Validate the bucket name
    if bucket.is_empty() || bucket.contains('/') {
        return Err("Invalid bucket name".into());
    }
    
    // Create the bucket in the database
    state.create_bucket(&bucket)
        .map_err(|e| format!("Failed to create bucket: {}", e))
}

#[tauri::command]
pub fn s3_get_url(bucket: String, key: String) -> String {
    format!("s3://{}/{}", bucket, key)
}



// Add this Tauri command to your commands section
#[tauri::command]
pub async fn s3_rename_bucket(
    state: State<'_, S3LiteState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    // Validate the bucket names
    if old_name.is_empty() || old_name.contains('/') {
        return Err("Invalid old bucket name".into());
    }
    
    if new_name.is_empty() || new_name.contains('/') {
        return Err("Invalid new bucket name".into());
    }
    
    // Rename the bucket
    state.inner().rename_bucket(&old_name, &new_name)
        .map_err(|e| format!("Failed to rename bucket: {}", e))
}