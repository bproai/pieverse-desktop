// src-tauri/src/services/vscode_ws.rs
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_stream::wrappers::{TcpListenerStream, BroadcastStream};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tokio::sync::oneshot;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager, Listener, Emitter};
use tokio_tungstenite::WebSocketStream;

// Make sure everything is Send + Sync
type SendableTx = Arc<Mutex<Option<broadcast::Sender<String>>>>;
type SendableShutdown = Arc<Mutex<Option<oneshot::Sender<()>>>>;

// Structures for our VS Code integration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeDiffRequest {
    pub original_file: String,
    pub suggested_content: String,
    pub description: String,
}

pub struct VSCodeWebSocketState {
    pub server_running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub shutdown_sender: SendableShutdown,
    pub broadcast_tx: SendableTx,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenFileRequest {
    #[serde(rename = "type")]
    pub request_type: String,  // "openFile"
    pub file: String,          // Full path to the file
    pub line: u32,             // Line number (0-based)
    pub character: u32,        // Character position (0-based)
    pub view_column: u32,      // Editor column (1 = left, 2 = right)
}

// Enhanced structures for VS Code diagnostics with additional fields
#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticRange {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticCodeValue {
    pub value: String,
    pub target: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticDocumentation {
    pub value: String,
    pub is_trusted: bool,
    pub support_html: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RelatedInformation {
    pub message: String,
    pub location: DiagnosticLocation,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticLocation {
    pub uri: String,
    pub range: DiagnosticRange,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub is_preferred: Option<bool>,
    pub command: Option<CodeActionCommand>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CodeActionCommand {
    pub title: String,
    pub command: String,
    pub arguments: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticItem {
    pub severity: u32,
    pub message: String,
    pub range: DiagnosticRange,
    pub code: Option<DiagnosticCode>,
    pub source: Option<String>,
    // Additional VS Code diagnostic fields
    pub tags: Option<Vec<u32>>,
    pub related_information: Option<Vec<RelatedInformation>>,
    pub code_actions: Option<Vec<CodeAction>>,
    pub documentation: Option<DiagnosticDocumentation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DiagnosticCode {
    String(String),
    Object(DiagnosticCodeValue),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDiagnostics {
    pub file: String,
    pub diagnostics: Vec<DiagnosticItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyCodeActionRequest {
    #[serde(rename = "type")]
    pub request_type: String,  // "applyCodeAction"
    pub file: String,          // File where code action should be applied
    pub code_action: CodeAction, // The code action to apply
}

impl VSCodeWebSocketState {
    pub fn new() -> Self {
        Self {
            server_running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(3001)), // Default port
            shutdown_sender: Arc::new(Mutex::new(None)),
            broadcast_tx: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub fn start_vscode_ws_server(
    app: AppHandle,
    port: Option<u16>,
    state: tauri::State<'_, VSCodeWebSocketState>,
) -> Result<(), String> {
    // Check if already running
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if is_running {
        return Err("Server is already running".to_string());
    }
    
    // Extract port
    let server_port = port.unwrap_or(3001);
    
    // Update port in state
    if let Ok(mut port_lock) = state.port.lock() {
        *port_lock = server_port;
    }
    
    // Clone state for the server
    let running = state.server_running.clone();
    let shutdown_sender = state.shutdown_sender.clone();
    let broadcast_tx = state.broadcast_tx.clone();
    
    // Create a broadcast channel
    let (tx, _rx) = broadcast::channel::<String>(16);
    let event_tx = tx.clone();
    
    // Store broadcast sender
    if let Ok(mut tx_lock) = broadcast_tx.lock() {
        *tx_lock = Some(tx.clone());
    }

    // First set up event listener for sending messages to VS Code
    let app_for_listen = app.clone();
    let listen_handle = app_for_listen.listen("send-vscode-diff", move |event| {
        let payload = event.payload();
        let _ = event_tx.send(payload.to_string());
    });
    
    // Now spawn the async task
    let app_for_server = app;
    tauri::async_runtime::spawn(async move {
        // Start the server
        if let Err(e) = run_ws_server(
            app_for_server,
            server_port,
            running,
            shutdown_sender,
            tx
        ).await {
            eprintln!("WebSocket server error: {}", e);
        }
        
        // Clean up event listener when server stops
        let _ = app_for_listen.unlisten(listen_handle);
    });
    
    Ok(())
}

// Separate function for the actual server implementation
async fn run_ws_server(
    app: AppHandle,
    port: u16,
    running: Arc<Mutex<bool>>,
    shutdown_sender: SendableShutdown,
    tx: broadcast::Sender<String>
) -> Result<(), String> {
    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    
    // Store shutdown sender
    if let Ok(mut sender) = shutdown_sender.lock() {
        *sender = Some(shutdown_tx);
    }
    
    // Try to bind to the port
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => return Err(format!("Failed to bind to {}: {}", addr, e)),
    };
    
    let actual_port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => return Err(format!("Failed to get local address: {}", e)),
    };
    
    // Set server as running
    if let Ok(mut is_running) = running.lock() {
        *is_running = true;
    }
    
    println!("VS Code WebSocket server started on port {}", actual_port);
    
    // Start accepting connections
    let mut listener_stream = TcpListenerStream::new(listener);
    
    loop {
        tokio::select! {
            Some(socket_result) = listener_stream.next() => {
                match socket_result {
                    Ok(stream) => {
                        if let Ok(peer_addr) = stream.peer_addr() {
                            println!("New VS Code extension connection from: {}", peer_addr);
                        }
                        let conn_tx = tx.clone();
                        let conn_app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            handle_connection(stream, conn_tx, conn_app).await;
                        });
                    },
                    Err(e) => println!("Error accepting connection: {}", e),
                }
            },
            _ = &mut shutdown_rx => {
                println!("VS Code WebSocket server shutting down");
                break;
            }
        }
    }
    
    // Set server as not running
    if let Ok(mut is_running) = running.lock() {
        *is_running = false;
    }
    
    Ok(())
}

#[tauri::command]
pub fn stop_vscode_ws_server(state: tauri::State<'_, VSCodeWebSocketState>) -> Result<(), String> {
    // Check if running
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if !is_running {
        return Err("Server is not running".to_string());
    }
    
    // Get shutdown sender
    let sender = match state.shutdown_sender.lock() {
        Ok(mut lock) => lock.take(),
        Err(_) => return Err("Failed to lock shutdown sender".to_string()),
    };
    
    // Send shutdown signal
    if let Some(tx) = sender {
        let _ = tx.send(());
        Ok(())
    } else {
        Err("No shutdown sender available".to_string())
    }
}

#[tauri::command]
pub fn apply_code_action(
    state: tauri::State<'_, VSCodeWebSocketState>,
    file: String,
    code_action: CodeAction,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Create the code action request
    let action_request = ApplyCodeActionRequest {
        request_type: "applyCodeAction".to_string(),
        file,
        code_action,
    };
    
    // Serialize and send
    match serde_json::to_string(&action_request) {
        Ok(payload) => {
            match tx.send(payload) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to send code action request: {}", e)),
            }
        },
        Err(e) => Err(format!("Failed to serialize code action request: {}", e)),
    }
}

#[tauri::command]
pub fn get_vscode_ws_status(state: tauri::State<'_, VSCodeWebSocketState>) -> Result<(bool, u16), String> {
    let running = match state.server_running.lock() {
        Ok(lock) => *lock,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    let port = match state.port.lock() {
        Ok(lock) => *lock,
        Err(_) => return Err("Failed to get server port".to_string()),
    };
    
    Ok((running, port))
}

#[tauri::command]
pub fn send_chat_to_vscode(
    state: tauri::State<'_, VSCodeWebSocketState>,
    message: String,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Create the chat message payload
    let chat_message = serde_json::json!({
        "type": "chat",
        "content": message
    });
    
    // Serialize and send
    match serde_json::to_string(&chat_message) {
        Ok(payload) => {
            match tx.send(payload) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to send message: {}", e)),
            }
        },
        Err(e) => Err(format!("Failed to serialize chat message: {}", e)),
    }
}

#[tauri::command]
pub fn send_code_diff_to_vscode(
    state: tauri::State<'_, VSCodeWebSocketState>,
    diffRequest: CodeDiffRequest,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Create a JSON object with type field to identify message type
    let message = serde_json::json!({
        "type": "diff",
        "originalFile": diffRequest.original_file,
        "suggestedContent": diffRequest.suggested_content,
        "description": diffRequest.description
    });
    
    // Serialize and send
    match serde_json::to_string(&message) {
        Ok(payload) => {
            match tx.send(payload) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to send message: {}", e)),
            }
        },
        Err(e) => Err(format!("Failed to serialize diff request: {}", e)),
    }
}

#[tauri::command]
pub fn send_open_file_to_vscode(
    state: tauri::State<'_, VSCodeWebSocketState>,
    open_file_request: OpenFileRequest,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Create a JSON object with type field to identify message type
    let message = serde_json::json!({
        "type": "openFile",
        "file": open_file_request.file,
        "line": open_file_request.line,
        "character": open_file_request.character,
        "viewColumn": open_file_request.view_column
    });
    
    // Serialize and send
    match serde_json::to_string(&message) {
        Ok(payload) => {
            match tx.send(payload) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to send message: {}", e)),
            }
        },
        Err(e) => Err(format!("Failed to serialize diff request: {}", e)),
    }
}

async fn handle_connection(stream: TcpStream, tx: broadcast::Sender<String>, app: AppHandle) {
    // Get peer address for logging
    let addr = stream.peer_addr().unwrap_or_else(|_| {
        "unknown".parse().unwrap()
    });
    
    // Upgrade to WebSocket
    match tokio_tungstenite::accept_async(stream).await {
        Ok(ws_stream) => {
            println!("WebSocket connection established with VS Code extension: {}", addr);
            process_messages(ws_stream, tx, addr, app).await;
        },
        Err(e) => println!("Error during WebSocket handshake: {}", e),
    }
}

async fn process_messages(
    ws_stream: WebSocketStream<TcpStream>,
    tx: broadcast::Sender<String>,
    addr: SocketAddr,
    app: AppHandle
) {
    // Subscribe to broadcasts
    let mut rx = BroadcastStream::new(tx.subscribe());
    
    // Split stream for concurrent read/write
    let (mut write, mut read) = ws_stream.split();
    
    // Task for handling incoming messages
    let mut read_task = tauri::async_runtime::spawn(async move {
        while let Some(result) = read.next().await {
            match result {
                Ok(msg) => {
                    if let Ok(text) = msg.to_text() {
                        println!("Received message from VS Code: {}", text);
                        
                        // Try to parse message
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                                if msg_type == "chat" {
                                    if let Some(content) = json.get("content").and_then(|c| c.as_str()) {
                                        // Emit to the frontend
                                        println!("Emitting chat message to frontend: {}", content);
                                        let _ = app.emit("vscode-chat-message", serde_json::json!({
                                            "content": content,
                                            "sender": "vscode"
                                        }));
                                    }
                                } else if msg_type == "diagnostics" {
                                    // Enhanced handling of diagnostics messages with all fields
                                    if let Some(data) = json.get("data") {
                                        println!("Received diagnostics data from VS Code");
                                        
                                        // Try to parse into our enhanced diagnostics structure
                                        if let Ok(diagnostics_data) = serde_json::from_value::<Vec<FileDiagnostics>>(data.clone()) {
                                            println!("Successfully parsed {} files with diagnostics", diagnostics_data.len());
                                            
                                            // Calculate stats for logging
                                            let total_diagnostics: usize = diagnostics_data.iter()
                                                .map(|file| file.diagnostics.len())
                                                .sum();
                                                
                                            let error_count: usize = diagnostics_data.iter()
                                                .flat_map(|file| file.diagnostics.iter())
                                                .filter(|diag| diag.severity == 0)
                                                .count();
                                                
                                            println!("Total of {} diagnostics with {} errors", 
                                                total_diagnostics, error_count);
                                        }
                                        
                                        // Forward the complete diagnostics data to the frontend
                                        let _ = app.emit("vscode-diagnostics", serde_json::json!({
                                            "data": data
                                        }));
                                    }
                                }
                                else if msg_type == "terminalEvent" {
                                    // Handle terminal events
                                    println!("Received terminal event from VS Code");
                                    // Forward the terminal event to the frontend
                                    let _ = app.emit("vscode-terminal-event", json);
                                }
                                else if msg_type == "codeActionResult" {
                                    // Handle code action results
                                    if let Some(success) = json.get("success").and_then(|s| s.as_bool()) {
                                        let status = if success { "succeeded" } else { "failed" };
                                        println!("Code action application {}", status);
                                        
                                        // Forward result to frontend
                                        let _ = app.emit("vscode-code-action-result", json);
                                    }
                                }
                            }
                        }
                    }
                },
                Err(e) => {
                    println!("Error reading from VS Code connection: {}", e);
                    break;
                }
            }
        }
    });
    
    // Task for sending broadcast messages
    let mut write_task = tauri::async_runtime::spawn(async move {
        while let Some(result) = rx.next().await {
            match result {
                Ok(msg) => {
                    use tokio_tungstenite::tungstenite::Message;
                    if let Err(e) = write.send(Message::Text(msg)).await {
                        println!("Error sending to VS Code: {}", e);
                        break;
                    }
                },
                Err(e) => {
                    println!("Error receiving broadcast: {}", e);
                }
            }
        }
    });
    
    // Wait for either task to complete
    tokio::select! {
        _ = &mut read_task => write_task.abort(),
        _ = &mut write_task => read_task.abort(),
    }
    
    println!("WebSocket connection closed with VS Code: {}", addr);
}