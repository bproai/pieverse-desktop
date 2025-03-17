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
                                    // Handle diagnostics messages
                                    if let Some(data) = json.get("data") {
                                        println!("Received diagnostics data from VS Code");
                                        // Forward the diagnostics data to the frontend
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