use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Runtime, State};
use tauri::Manager;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use std::time::SystemTime;
use regex::Regex;

//
// Shared state for the MCP server
//
pub struct ClaudeMcpState {
    server_handle: Mutex<Option<(oneshot::Sender<()>, JoinHandle<()>)>>,
    allowed_directories: Mutex<Vec<PathBuf>>,
    port: Mutex<u16>,
    running: Mutex<bool>,
}

impl ClaudeMcpState {
    pub fn new() -> Self {
        Self {
            server_handle: Mutex::new(None),
            allowed_directories: Mutex::new(Vec::new()),
            port: Mutex::new(3500), // default port, change here if needed
            running: Mutex::new(false),
        }
    }
}

//
// File information structure
//
#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    name: String,
    path: String,
    is_directory: bool,
    size: u64,
    modified: Option<u64>,
}

//
// Start the MCP server
//
#[command]
pub async fn start_claude_mcp_server<R: Runtime>(
    app_handle: AppHandle<R>,
    port: Option<u16>,
    directories: Vec<String>,
) -> Result<String, String> {
    let state: State<'_, ClaudeMcpState> = app_handle.state();

    println!("[start_claude_mcp_server] Checking if server is already running...");
    {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Claude MCP server is already running".to_string());
        }
    }

    let port_to_use = port.unwrap_or(3500);
    println!("[start_claude_mcp_server] Setting port to {}...", port_to_use);
    {
        let mut port_lock = state.port.lock().map_err(|e| e.to_string())?;
        *port_lock = port_to_use;
    }

    println!("[start_claude_mcp_server] Converting directories...");
    let allowed_dirs: Vec<PathBuf> = directories.iter().map(|dir| PathBuf::from(dir)).collect();
    {
        let mut allowed_dirs_lock = state.allowed_directories.lock().map_err(|e| e.to_string())?;
        *allowed_dirs_lock = allowed_dirs.clone();
    }

    println!("[start_claude_mcp_server] Creating shutdown channel...");
    let (tx, rx) = oneshot::channel();

    let server_port = port_to_use;
    let allowed_dirs_arc = Arc::new(allowed_dirs);
    println!("[start_claude_mcp_server] Spawning MCP server task...");
    let handle = tokio::spawn(async move {
        run_mcp_server(server_port, allowed_dirs_arc, rx).await;
    });

    {
        println!("[start_claude_mcp_server] Storing server handle...");
        let mut server_handle = state.server_handle.lock().map_err(|e| e.to_string())?;
        *server_handle = Some((tx, handle));
    }

    {
        println!("[start_claude_mcp_server] Marking server as running...");
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        *running = true;
    }

    println!("[start_claude_mcp_server] Returning success message...");
    Ok(format!("Claude MCP server started on port {}", port_to_use))
}

//
// Stop the MCP server
//
#[command]
pub async fn stop_claude_mcp_server<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    let state: State<'_, ClaudeMcpState> = app_handle.state();
    
    {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if !*running {
            return Err("Claude MCP server is not running".to_string());
        }
    }
    
    {
        let mut server_handle = state.server_handle.lock().map_err(|e| e.to_string())?;
        if let Some((tx, handle)) = server_handle.take() {
            let _ = tx.send(());
            tokio::task::spawn(async move {
                let _ = handle.await;
            });
        }
    }
    
    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        *running = false;
    }
    
    Ok(())
}

//
// Get the current status of the MCP server
//
#[command]
pub async fn get_claude_mcp_status<R: Runtime>(app_handle: AppHandle<R>) -> Result<serde_json::Value, String> {
    let state: State<'_, ClaudeMcpState> = app_handle.state();
    
    let running = {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        *running
    };
    
    let port = {
        let port = state.port.lock().map_err(|e| e.to_string())?;
        *port
    };
    
    let allowed_directories = {
        let allowed_dirs = state.allowed_directories.lock().map_err(|e| e.to_string())?;
        allowed_dirs.iter()
            .map(|dir| dir.to_string_lossy().to_string())
            .collect::<Vec<String>>()
    };
    
    Ok(serde_json::json!({
        "running": running,
        "port": port,
        "url": format!("http://localhost:{}", port),
        "allowed_directories": allowed_directories
    }))
}

//
// Add a directory to the allowed list
//
#[command]
pub async fn add_claude_mcp_directory<R: Runtime>(
    app_handle: AppHandle<R>, 
    directory: String
) -> Result<(), String> {
    let state: State<'_, ClaudeMcpState> = app_handle.state();
    let dir_path = PathBuf::from(&directory);
    
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", directory));
    }
    
    let mut allowed_dirs = state.allowed_directories.lock().map_err(|e| e.to_string())?;
    if !allowed_dirs.iter().any(|d| d == &dir_path) {
        allowed_dirs.push(dir_path);
    }
    
    Ok(())
}

//
// Remove a directory from the allowed list
//
#[command]
pub async fn remove_claude_mcp_directory<R: Runtime>(
    app_handle: AppHandle<R>, 
    directory: String
) -> Result<(), String> {
    let state: State<'_, ClaudeMcpState> = app_handle.state();
    let dir_path = PathBuf::from(&directory);
    
    let mut allowed_dirs = state.allowed_directories.lock().map_err(|e| e.to_string())?;
    if let Some(index) = allowed_dirs.iter().position(|d| d == &dir_path) {
        allowed_dirs.remove(index);
        Ok(())
    } else {
        Err(format!("Directory not in allowed list: {}", directory))
    }
}

//
// The MCP server implementation
//
async fn run_mcp_server(
    port: u16,
    allowed_dirs: Arc<Vec<PathBuf>>,
    shutdown_signal: oneshot::Receiver<()>,
) {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("[run_mcp_server] Attempting to bind HTTP server on {}", addr);

    use hyper::server::conn::AddrStream;
    let server = hyper::Server::bind(&addr)
        .serve(hyper::service::make_service_fn(|conn: &AddrStream| {
            let remote_addr = conn.remote_addr();
            eprintln!("DEBUG: Accepted TCP connection from {}", remote_addr);
            let allowed_dirs = allowed_dirs.clone();
            async move {
                Ok::<_, hyper::Error>(hyper::service::service_fn(move |req| {
                    eprintln!("DEBUG: handle_request called for {}", req.uri());
                    let allowed_dirs = allowed_dirs.clone();
                    async move { handle_request(req, allowed_dirs).await }
                }))
            }
        }))
        .with_graceful_shutdown(async {
            let _ = shutdown_signal.await;
        });

    println!("[run_mcp_server] Server future created. Awaiting server...");
    if let Err(e) = server.await {
        eprintln!("MCP server error: {}", e);
    } else {
        println!("[run_mcp_server] Server shut down gracefully.");
    }
}

//
// HTTP request handler
//
async fn handle_request(
    req: hyper::Request<hyper::Body>,
    allowed_dirs: Arc<Vec<PathBuf>>,
) -> Result<hyper::Response<hyper::Body>, hyper::Error> {
    eprintln!("DEBUG: handle_request called for {}", req.uri());
    use hyper::{Body, Response, Request, Server, Method, StatusCode};
    use hyper::header::{CONTENT_TYPE, ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_HEADERS};

    let method = req.method().clone();
    let uri_path = req.uri().path().to_owned();
    eprintln!("DEBUG: Handling request: {} {}", method, uri_path);

    // Log remote address (might be "unknown" for upgraded connections)
    let remote_addr = req
        .extensions()
        .get::<SocketAddr>()
        .cloned()
        .map(|addr| addr.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    eprintln!("DEBUG: Received request from {}: {} {}", remote_addr, method, uri_path);

    // Log all headers
    for (key, value) in req.headers().iter() {
        eprintln!("DEBUG: Header: {}: {:?}", key, value);
    }

    // If the request is for SSE (match any path starting with "/sse")
    if uri_path.starts_with("/sse") {
        eprintln!("DEBUG: Handling SSE request");
        return sse_handler(req).await;
    }

    if method == Method::GET && uri_path == "/config" {
        let config = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "fileSystem": true
            },
            "serverInfo": {
                "name": "pieverse-file-system",
                "version": "0.1.0"
            }
        });
        let config_json = serde_json::to_string(&config).unwrap();
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(config_json))
            .unwrap());
    }

    // Default GET "/" route for health check
    if method == Method::GET && uri_path == "/" {
        eprintln!("DEBUG: Handling GET / for health check");
        return Ok(hyper::Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(hyper::Body::from(r#"{"message":"MCP server is running"}"#))
            .unwrap());
    }

    // Consume the request body and log it
    let body_bytes = hyper::body::to_bytes(req.into_body()).await?;
    eprintln!("DEBUG: Received body: {}", String::from_utf8_lossy(&body_bytes));

    // If it's a JSON-RPC request (e.g., initialize)
    if let Ok(json_value) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        eprintln!("DEBUG: Received JSON-RPC request: {:?}", json_value);
        if json_value.get("jsonrpc").is_some() && json_value.get("method").is_some() {
            if let Some(req_method) = json_value.get("method").and_then(|v| v.as_str()) {
            // Improved error handling for initialize requests
            if req_method == "initialize" {
                eprintln!("DEBUG: Received initialize request with id: {:?}", json_value.get("id"));
                let id = json_value.get("id").cloned().unwrap_or(serde_json::Value::Null);
                let response_body = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": { "fileSystem": true },
                        "serverInfo": { "name": "pieverse-file-system", "version": "0.1.0" }
                    }
                });
                eprintln!("DEBUG: Preparing initialize response: {:?}", response_body);
                
                let response_json = match serde_json::to_string(&response_body) {
                    Ok(json) => json,
                    Err(e) => {
                        eprintln!("ERROR: Failed to serialize response: {:?}", e);
                        format!("{{\"jsonrpc\":\"2.0\",\"id\":{},\"error\":{{\"code\":-32603,\"message\":\"Internal error\"}}}}", id)
                    }
                };
                
                let content_length = response_json.len().to_string();
                eprintln!("DEBUG: Sending response with content length: {}", content_length);
                
                // Add more robust response building with proper error handling
                let response = match hyper::Response::builder()
                    .status(StatusCode::OK)
                    .header(CONTENT_TYPE, "application/json")
                    .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                    .header("Content-Length", content_length)
                    .header("Connection", "keep-alive") // Try adding this
                    .body(hyper::Body::from(response_json)) {
                        Ok(resp) => resp,
                        Err(e) => {
                            eprintln!("ERROR: Failed to build response: {:?}", e);
                            return Ok(hyper::Response::builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(hyper::Body::from("Internal server error"))
                                .unwrap_or_default());
                        }
                    };
                
                eprintln!("DEBUG: Returning initialize response");
                return Ok(response);
            }
            }
        }
    }

    // Handle CORS preflight requests
    if method == Method::OPTIONS {
        eprintln!("DEBUG: Handling CORS preflight");
        let response = hyper::Response::builder()
            .status(StatusCode::OK)
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
            .header(ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type")
            .body(hyper::Body::empty())
            .unwrap();
        return Ok(response);
    }

    // Route for tool calls
    let response_builder = hyper::Response::builder()
        .header(CONTENT_TYPE, "application/json")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*");

    match (method.as_str(), uri_path.as_str()) {
        ("GET", "/tools") => {
            let tools = serde_json::json!({
                "tools": [
                    {
                        "name": "find_files",
                        "description": "Searches for files matching specified criteria",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "directory": {
                                    "type": "string",
                                    "description": "The directory to search in"
                                },
                                "pattern": {
                                    "type": "string",
                                    "description": "Pattern to match"
                                },
                                "recursive": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Whether to search recursively"
                                }
                            },
                            "required": ["directory", "pattern"]
                        },
                        "output_schema": {
                            "type": "object",
                            "properties": {
                                "files": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                }
                            }
                        }
                    },
                    {
                        "name": "read_file",
                        "description": "Reads the contents of a file",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "path": {
                                    "type": "string",
                                    "description": "Path to the file to read"
                                }
                            },
                            "required": ["path"]
                        },
                        "output_schema": {
                            "type": "object",
                            "properties": {
                                "content": { "type": "string" }
                            }
                        }
                    },
                    {
                        "name": "list_directory",
                        "description": "Lists contents of a directory",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "path": {
                                    "type": "string",
                                    "description": "Path to the directory to list"
                                }
                            },
                            "required": ["path"]
                        },
                        "output_schema": {
                            "type": "object",
                            "properties": {
                                "contents": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": { "type": "string" },
                                            "path": { "type": "string" },
                                            "is_directory": { "type": "boolean" },
                                            "size": { "type": "number" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            });
            Ok(response_builder
                .status(StatusCode::OK)
                .body(hyper::Body::from(serde_json::to_string(&tools).unwrap()))
                .unwrap())
        },
        ("POST", tool_path) if tool_path.starts_with("/tools/") => {
            let tool_name = tool_path.strip_prefix("/tools/").unwrap();
            let params: serde_json::Value = match serde_json::from_slice(&body_bytes) {
                Ok(p) => p,
                Err(_) => {
                    return Ok(response_builder
                        .status(StatusCode::BAD_REQUEST)
                        .body(hyper::Body::from(r#"{"error":"Invalid request body"}"#))
                        .unwrap());
                }
            };
            match tool_name {
                "find_files" => {
                    let directory = match params.get("directory").and_then(|v| v.as_str()) {
                        Some(dir) => dir,
                        None => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(r#"{"error":"Missing directory parameter"}"#))
                                .unwrap());
                        }
                    };
                    let pattern = match params.get("pattern").and_then(|v| v.as_str()) {
                        Some(pattern) => pattern,
                        None => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(r#"{"error":"Missing pattern parameter"}"#))
                                .unwrap());
                        }
                    };
                    let recursive = params.get("recursive")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    let path = Path::new(directory);
                    
                    // Try to canonicalize the path first to check if it exists
                    let canonical_path = match path.canonicalize() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(format!(r#"{{"error":"Invalid directory path: {}"}}"#, e)))
                                .unwrap());
                        }
                    };
                    
                    // Check if path is within allowed directories using simplified is_path_safe
                    let is_allowed = allowed_dirs.iter().any(|dir| {
                        if let Ok(canonical_dir) = dir.canonicalize() {
                            canonical_path.starts_with(&canonical_dir)
                        } else {
                            false
                        }
                    });
                    
                    if !is_allowed {
                        return Ok(response_builder
                            .status(StatusCode::FORBIDDEN)
                            .body(hyper::Body::from(r#"{"error":"Access denied: Directory not in allowed list"}"#))
                            .unwrap());
                    }
                    
                    // Check if the pattern is a valid regex before using it
                    let pattern_regex = match Regex::new(pattern) {
                        Ok(re) => re,
                        Err(_) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(r#"{"error":"Invalid regex pattern"}"#))
                                .unwrap());
                        }
                    };
                    
                    // Use the canonicalized path for walking the directory
                    let mut files = Vec::new();
                    let walker = walkdir::WalkDir::new(&canonical_path)
                        .follow_links(false)  // Don't follow symlinks for security
                        .max_depth(if recursive { usize::MAX } else { 1 });
                        
                    // Set a reasonable limit to prevent DoS
                    let max_files = 1000;
                    let mut file_count = 0;
                    
                    for entry in walker.into_iter().filter_map(Result::ok) {
                        // Check file count limit
                        file_count += 1;
                        if file_count > max_files {
                            break;
                        }
                        
                        // We need to create owned variables from entry for use in the async operation
                        let entry_path = entry.path().to_path_buf(); // Create owned PathBuf
                        
                        // Skip any paths that are no longer within the allowed directory
                        // This is a double-check for security using the same simplified check
                        let entry_allowed = allowed_dirs.iter().any(|dir| {
                            if let Ok(canonical_dir) = dir.canonicalize() {
                                if let Ok(canonical_entry) = entry_path.canonicalize() {
                                    canonical_entry.starts_with(&canonical_dir)
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        });
                        
                        if !entry_allowed {
                            continue;
                        }
                        
                        if let Some(file_name) = entry_path.file_name() {
                            if let Some(file_name_str) = file_name.to_str() {
                                let file_name_owned = file_name_str.to_string(); // Create owned String
                                let pattern_regex_clone = pattern_regex.clone(); // Clone the regex
                                
                                // Add timeout protection for regex to prevent ReDoS attacks
                                let pattern_match = match tokio::time::timeout(
                                    std::time::Duration::from_millis(100),
                                    tokio::task::spawn_blocking(move || pattern_regex_clone.is_match(&file_name_owned))
                                ).await {
                                    Ok(Ok(result)) => result,
                                    _ => false, // Timeout or error means no match
                                };
                                
                                if pattern_match {
                                    if let Some(path_str) = entry_path.to_str() {
                                        files.push(path_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                    
                    let result = serde_json::json!({ 
                        "files": files,
                        "truncated": file_count > max_files  // Indicate if results were limited
                    });
                    
                    Ok(response_builder
                        .status(StatusCode::OK)
                        .body(hyper::Body::from(serde_json::to_string(&result).unwrap()))
                        .unwrap())
                },
                "read_file" => {
                    let file_path = match params.get("path").and_then(|v| v.as_str()) {
                        Some(path) => path,
                        None => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(r#"{"error":"Missing path parameter"}"#))
                                .unwrap());
                        }
                    };
                    let path = Path::new(file_path);
                    
                    // Try to canonicalize the path first to check if it exists
                    let canonical_path = match path.canonicalize() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(format!(r#"{{"error":"Invalid file path: {}"}}"#, e)))
                                .unwrap());
                        }
                    };
                    
                    // Check if path is within allowed directories
                    let is_allowed = allowed_dirs.iter().any(|dir| {
                        if let Ok(canonical_dir) = dir.canonicalize() {
                            canonical_path.starts_with(&canonical_dir)
                        } else {
                            false
                        }
                    });
                    
                    if !is_allowed {
                        return Ok(response_builder
                            .status(StatusCode::FORBIDDEN)
                            .body(hyper::Body::from(r#"{"error":"Access denied: File not in allowed directory"}"#))
                            .unwrap());
                    }
                    
                    // Check file size before reading to prevent DoS attacks
                    let metadata = match fs::metadata(&canonical_path) {
                        Ok(meta) => meta,
                        Err(e) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(format!(r#"{{"error":"Failed to get file metadata: {}"}}"#, e)))
                                .unwrap());
                        }
                    };
                    
                    if !metadata.is_file() {
                        return Ok(response_builder
                            .status(StatusCode::BAD_REQUEST)
                            .body(hyper::Body::from(r#"{"error":"Path is not a file"}"#))
                            .unwrap());
                    }
                    
                    // Set a reasonable size limit (10MB) to prevent DoS
                    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
                    if metadata.len() > MAX_FILE_SIZE {
                        return Ok(response_builder
                            .status(StatusCode::BAD_REQUEST)
                            .body(hyper::Body::from(format!(r#"{{"error":"File too large: {} bytes (max: {} bytes)"}}"#, metadata.len(), MAX_FILE_SIZE)))
                            .unwrap());
                    }
                    
                    // Read the canonicalized path instead of the original path
                    match fs::read_to_string(&canonical_path) {
                        Ok(content) => {
                            let result = serde_json::json!({ "content": content });
                            Ok(response_builder
                                .status(StatusCode::OK)
                                .body(hyper::Body::from(serde_json::to_string(&result).unwrap()))
                                .unwrap())
                        },
                        Err(e) => {
                            let error = serde_json::json!({ "error": format!("Failed to read file: {}", e) });
                            Ok(response_builder
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(hyper::Body::from(serde_json::to_string(&error).unwrap()))
                                .unwrap())
                        }
                    }
                },                
                "list_directory" => {
                    let dir_path = match params.get("path").and_then(|v| v.as_str()) {
                        Some(path) => path,
                        None => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(r#"{"error":"Missing path parameter"}"#))
                                .unwrap());
                        }
                    };
                    let path = Path::new(dir_path);
                    
                    // Try to canonicalize the path first to check if it exists
                    let canonical_path = match path.canonicalize() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(format!(r#"{{"error":"Invalid directory path: {}"}}"#, e)))
                                .unwrap());
                        }
                    };
                    
                    // Check if path is within allowed directories
                    let is_allowed = allowed_dirs.iter().any(|dir| {
                        if let Ok(canonical_dir) = dir.canonicalize() {
                            canonical_path.starts_with(&canonical_dir)
                        } else {
                            false
                        }
                    });
                    
                    if !is_allowed {
                        return Ok(response_builder
                            .status(StatusCode::FORBIDDEN)
                            .body(hyper::Body::from(r#"{"error":"Access denied: Directory not in allowed list"}"#))
                            .unwrap());
                    }
                    
                    // Verify the path is actually a directory
                    let metadata = match fs::metadata(&canonical_path) {
                        Ok(meta) => meta,
                        Err(e) => {
                            return Ok(response_builder
                                .status(StatusCode::BAD_REQUEST)
                                .body(hyper::Body::from(format!(r#"{{"error":"Failed to get directory metadata: {}"}}"#, e)))
                                .unwrap());
                        }
                    };
                    
                    if !metadata.is_dir() {
                        return Ok(response_builder
                            .status(StatusCode::BAD_REQUEST)
                            .body(hyper::Body::from(r#"{"error":"Path is not a directory"}"#))
                            .unwrap());
                    }
                    
                    // Read the canonicalized directory
                    match fs::read_dir(&canonical_path) {
                        Ok(entries) => {
                            let mut contents = Vec::new();
                            
                            // Set a reasonable limit to prevent DoS
                            let max_entries = 1000;
                            let mut entry_count = 0;
                            let mut truncated = false;
                            
                            for entry_result in entries {
                                // Check entry count limit
                                entry_count += 1;
                                if entry_count > max_entries {
                                    truncated = true;
                                    break;
                                }
                                
                                let entry = match entry_result {
                                    Ok(e) => e,
                                    Err(_) => continue,
                                };
                                
                                let path = entry.path();
                                
                                // Skip any paths that are no longer within the allowed directories
                                let entry_allowed = allowed_dirs.iter().any(|dir| {
                                    if let Ok(canonical_dir) = dir.canonicalize() {
                                        if let Ok(canonical_entry) = path.canonicalize() {
                                            canonical_entry.starts_with(&canonical_dir)
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                });
                                
                                if !entry_allowed {
                                    continue;
                                }
                                
                                let metadata = match fs::metadata(&path) {
                                    Ok(meta) => meta,
                                    Err(_) => continue,
                                };
                                
                                let name = path.file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("")
                                    .to_string();
                                
                                let path_str = path.to_string_lossy().to_string();
                                
                                let modified = metadata.modified().ok()
                                    .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
                                    .map(|duration| duration.as_secs());
                                
                                contents.push(FileInfo {
                                    name,
                                    path: path_str,
                                    is_directory: metadata.is_dir(),
                                    size: metadata.len(),
                                    modified,
                                });
                            }
                            
                            let result = serde_json::json!({ 
                                "contents": contents,
                                "truncated": truncated  // Indicate if results were limited
                            });
                            
                            Ok(response_builder
                                .status(StatusCode::OK)
                                .body(hyper::Body::from(serde_json::to_string(&result).unwrap()))
                                .unwrap())
                        },
                        Err(e) => {
                            let error = serde_json::json!({ "error": format!("Failed to read directory: {}", e) });
                            Ok(response_builder
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(hyper::Body::from(serde_json::to_string(&error).unwrap()))
                                .unwrap())
                        }
                    }
                },

                _ => {
                    Ok(response_builder
                        .status(StatusCode::NOT_FOUND)
                        .body(hyper::Body::from(format!(r#"{{"error":"Unknown tool: {}"}}"#, tool_name)))
                        .unwrap())
                }
            }
        },
        _ => {
            Ok(response_builder
                .status(StatusCode::NOT_FOUND)
                .body(hyper::Body::from(r#"{"error":"Not found"}"#))
                .unwrap())
        }
    }
}

//
// SSE handler function with periodic keep-alive messages
//
async fn sse_handler(
    _req: hyper::Request<hyper::Body>,
) -> Result<hyper::Response<hyper::Body>, hyper::Error> {
    use hyper::{StatusCode, header::{CONTENT_TYPE, ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_HEADERS}};
    use tokio::time::{self, Duration};

    // Create an SSE stream that sends an initial message and periodic keep-alives.
    let stream = async_stream::stream! {
        // Send an initial event.
        yield Ok::<_, hyper::Error>(format!("data: {}\n\n", "{\"message\":\"Hello from SSE\"}"));
        let mut interval = time::interval(Duration::from_secs(15));
        loop {
            interval.tick().await;
            // SSE comments (prefixed with a colon) act as keep-alives.
            yield Ok::<_, hyper::Error>(format!(": keep-alive\n\n"));
        }
    };

    let response = hyper::Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "text/event-stream")
        .header("Cache-Control", "no-cache")
        // Adding the CORS header to allow cross-origin requests.
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(hyper::Body::wrap_stream(stream))
        .unwrap();

    Ok(response)
}
