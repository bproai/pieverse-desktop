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
use std::borrow::Cow;
use image::GenericImageView;

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

    pub fn rename_file(&self, bucket: &str, old_key: &str, new_key: &str) -> Result<(), Box<dyn Error>> {
        // Validate the new file name
        if new_key.is_empty() {
            return Err("New file name cannot be empty".into());
        }
        
        let conn = self.get_connection()?;
        
        // Begin a transaction for atomicity
        conn.execute("BEGIN TRANSACTION", [])?;
        
        // Try to execute all operations within the transaction
        let result: Result<(), Box<dyn Error>> = (|| {
            // Check if the new key already exists
            let mut stmt = conn.prepare("SELECT 1 FROM s3_files WHERE bucket = ? AND key = ?")?;
            let exists = stmt.exists(params![bucket, new_key])?;
            
            if exists {
                return Err("A file with this name already exists".into());
            }
            
            // Rename the file
            conn.execute(
                "UPDATE s3_files SET key = ? WHERE bucket = ? AND key = ?",
                params![new_key, bucket, old_key],
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

    pub fn list_files(&self, bucket: &str) -> Result<Vec<S3FileEntry>, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let mut stmt = conn.prepare(
            "SELECT bucket, key, mime_type, size, created_at 
             FROM s3_files 
             WHERE bucket = ? 
             ORDER BY created_at DESC"
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
    
    // If you want to add a paginated version as an additional function
    pub fn list_files_paginated(&self, bucket: &str, page: i64, page_size: i64) -> Result<Vec<S3FileEntry>, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let offset = page * page_size;
        
        let mut stmt = conn.prepare(
            "SELECT bucket, key, mime_type, size, created_at 
             FROM s3_files 
             WHERE bucket = ? 
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?"
        )?;
            
        let file_iter = stmt.query_map(params![bucket, page_size, offset], |row| {
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

    // Add this function to s3_lite.rs
    pub fn get_file_count(&self, bucket: &str) -> Result<i64, Box<dyn Error>> {
        let conn = self.get_connection()?;
        
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM s3_files WHERE bucket = ?",
            params![bucket],
            |row| row.get(0)
        )?;
        
        Ok(count)
    }


}

#[tauri::command]
pub async fn s3_rename_file(
    state: State<'_, S3LiteState>,
    bucket: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    // Rename the file
    state.inner().rename_file(&bucket, &old_key, &new_key)
        .map_err(|e| format!("Failed to rename file: {}", e))
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
        "tauri",
        |context: UriSchemeContext<R>, request: tauri::http::Request<Vec<u8>>| -> Response<Vec<u8>> {
            let uri = request.uri().to_string();
            let path = uri.strip_prefix("s3://").unwrap_or(&uri);
            
            // Strip "localhost/" prefix on Windows
            #[cfg(target_os = "windows")]
            let path = path.strip_prefix("localhost/").unwrap_or(path);
            
            let parts: Vec<&str> = path.split('/').collect();
            println!("S3 URI parts: {}, {:?}", uri, parts);


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
    #[cfg(target_os = "windows")]
    {
        format!("http://s3.localhost/{}/{}", bucket, key)
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        format!("s3://{}/{}", bucket, key)
    }
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

#[tauri::command]
pub async fn s3_download_image(
    state: State<'_, S3LiteState>,
    bucket: String,
    key: String,
    save_path: String,
) -> Result<(), String> {
    // Validate inputs
    if bucket.is_empty() || key.is_empty() || save_path.is_empty() {
        return Err("Invalid parameters".into());
    }
    
    // Get the file data from the S3Lite database
    let file_data = match state.inner().get_file(&bucket, &key) {
        Ok(Some((data, _))) => data,
        Ok(None) => return Err(format!("File not found: {}/{}", bucket, key)),
        Err(e) => return Err(format!("Failed to get file: {}", e)),
    };
    
    // Write the file to disk
    match std::fs::write(&save_path, &file_data) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}


#[tauri::command]
pub async fn s3_copy_image_to_clipboard(
    state: State<'_, S3LiteState>,
    bucket: String,
    key: String,
) -> Result<(), String> {
    // Validate inputs
    if bucket.is_empty() || key.is_empty() {
        return Err("Invalid parameters".into());
    }
    
    // Get the file data from the S3Lite database
    let file_data = match state.inner().get_file(&bucket, &key) {
        Ok(Some((data, _))) => data,
        Ok(None) => return Err(format!("File not found: {}/{}", bucket, key)),
        Err(e) => return Err(format!("Failed to get file: {}", e)),
    };
    
    // Decode the image data using the image crate
    let img = image::load_from_memory(&file_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    
    // Convert the image to BGRA8 format required by arboard
    let img = img.to_rgba8();
    let (width, height) = img.dimensions();
    let raw_pixels = img.into_raw();
    
    // Create the ImageData structure for arboard
    let image_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: Cow::Owned(raw_pixels),
    };
    
    // Initialize the clipboard and set the image
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Clipboard initialization failed: {}", e))?;
    clipboard.set_image(image_data)
        .map_err(|e| format!("Failed to set image to clipboard: {}", e))?;
    
    Ok(())
}

// Tauri command for the paginated version
#[tauri::command]
pub async fn s3_list_files_paginated(
    state: State<'_, S3LiteState>,
    bucket: String,
    page: i64,
    page_size: i64,
) -> Result<Vec<S3FileEntry>, String> {
    state.list_files_paginated(&bucket, page, page_size)
        .map_err(|e| format!("Failed to list files: {}", e))
}


// Add corresponding Tauri command
#[tauri::command]
pub async fn s3_get_file_count(
    state: State<'_, S3LiteState>,
    bucket: String,
) -> Result<i64, String> {
    state.get_file_count(&bucket)
        .map_err(|e| format!("Failed to get file count: {}", e))
}