// src-tauri/src/services/vscode_ws.rs
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_stream::wrappers::{TcpListenerStream, BroadcastStream};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tokio::sync::oneshot;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager, Window, Listener, Emitter};
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

// Start WebSocket server - safe wrapper around the actual implementation
// This is a non-async command that returns immediately and spawns the server setup in the background
#[tauri::command]
pub fn start_vscode_ws_server(
    app: AppHandle,
    port: Option<u16>,
    state: tauri::State<'_, VSCodeWebSocketState>,
) -> Result<(), String> {
    // Check if already running
    if let Ok(is_running) = state.server_running.lock() {
        if *is_running {
            return Err("Server is already running".to_string());
        }
    } else {
        return Err("Failed to lock server state".to_string());
    }
    
    // Extract port
    let server_port = port.unwrap_or(3001);
    
    // Update port in state
    if let Ok(mut port_lock) = state.port.lock() {
        *port_lock = server_port;
    }
    
    // Clone everything needed for the task
    let app_handle = app.clone();
    let running = state.server_running.clone();
    let shutdown_sender = state.shutdown_sender.clone();
    let broadcast_tx = state.broadcast_tx.clone();
    
    // Spawn task to start server using Tauri's async runtime
    tauri::async_runtime::spawn(async move {
        match setup_server(app_handle, server_port, running, shutdown_sender, broadcast_tx).await {
            Ok(port) => println!("VS Code WebSocket server started on port {}", port),
            Err(e) => eprintln!("Failed to start VS Code WebSocket server: {}", e),
        }
    });
    
    Ok(())
}

// This function starts the actual server in a separate task
// It's an async function designed to run inside Tauri's tokio runtime
async fn setup_server(
    app_handle: AppHandle,
    start_port: u16,
    running: Arc<Mutex<bool>>,
    shutdown_sender: SendableShutdown,
    broadcast_tx: SendableTx,
) -> Result<u16, String> {
    // Create broadcast channel for messages
    let (tx, _rx) = broadcast::channel::<String>(16);
    
    // Store broadcast sender in state
    if let Ok(mut tx_lock) = broadcast_tx.lock() {
        *tx_lock = Some(tx.clone());
    } else {
        return Err("Failed to lock broadcast sender".to_string());
    }
    
    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    
    // Store shutdown sender in state
    if let Ok(mut shutdown_lock) = shutdown_sender.lock() {
        *shutdown_lock = Some(shutdown_tx);
    } else {
        return Err("Failed to lock shutdown sender".to_string());
    }
    
    // Try multiple ports if the initial one is in use
    let mut current_port = start_port;
    let max_port_tries = 10; // Try up to 10 ports
    let mut listener = None;

    for _ in 0..max_port_tries {
        let addr = format!("127.0.0.1:{}", current_port);
        match TcpListener::bind(&addr).await {
            Ok(l) => {
                listener = Some(l);
                break;
            },
            Err(e) => {
                println!("Failed to bind to port {}: {}, trying next port...", current_port, e);
                if current_port < 65535 {
                    // Try the next port
                    current_port += 1;
                } else {
                    return Err(format!("Failed to bind to any port starting from {}", start_port));
                }
            }
        }
    }
    
    let listener = match listener {
        Some(l) => l,
        None => return Err("Failed to find an available port after multiple attempts".to_string()),
    };
    
    let actual_port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => return Err(format!("Failed to get listener address: {}", e)),
    };
    
    // Update port in case we got a different one
    if let Ok(mut port_lock) = running.lock() {
        *port_lock = true;
    } else {
        return Err("Failed to lock server running state".to_string());
    }
    
    // Clone for task
    let running_clone = running.clone();
    let tx_clone = tx.clone();
    
    // Spawn server task
    tauri::async_runtime::spawn(async move {
        println!("VS Code WebSocket server started on port {}", actual_port);
        
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
                            tauri::async_runtime::spawn(async move {
                                handle_connection(stream, conn_tx).await;
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
        
        // Server stopped, update state
        if let Ok(mut is_running) = running_clone.lock() {
            *is_running = false;
        }
    });
    
    // Set up event listener
    app_handle.listen("send-vscode-diff", move |event| {
        let payload = event.payload();
        let _ = tx_clone.send(payload.to_string());
    });
    
    Ok(actual_port)
}

// Get current port - synchronous function
#[tauri::command]
pub fn get_vscode_ws_port(state: tauri::State<'_, VSCodeWebSocketState>) -> Result<u16, String> {
    match state.port.lock() {
        Ok(port) => Ok(*port),
        Err(_) => Err("Failed to get server port".to_string()),
    }
}

// Stop the WebSocket server
#[tauri::command]
pub fn stop_vscode_ws_server(state: tauri::State<'_, VSCodeWebSocketState>) -> Result<(), String> {
    // Check if running
    let is_running = match state.server_running.lock() {
        Ok(lock) => *lock,
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

// Get current server status and port
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

// Send a code diff to VS Code extension
#[tauri::command]
pub fn send_code_diff_to_vscode(
    state: tauri::State<'_, VSCodeWebSocketState>,
    diff_request: CodeDiffRequest,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Serialize and send
    match serde_json::to_string(&diff_request) {
        Ok(payload) => {
            match tx.send(payload) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to send message: {}", e)),
            }
        },
        Err(e) => Err(format!("Failed to serialize diff request: {}", e)),
    }
}

// Handle WebSocket connections
async fn handle_connection(stream: TcpStream, tx: broadcast::Sender<String>) {
    // Attempt to get peer address for logging
    let addr = stream.peer_addr().unwrap_or_else(|_| {
        "unknown".parse().unwrap()
    });
    
    // Upgrade to WebSocket
    match tokio_tungstenite::accept_async(stream).await {
        Ok(ws_stream) => {
            println!("WebSocket connection established with VS Code extension: {}", addr);
            process_messages(ws_stream, tx, addr).await;
        },
        Err(e) => println!("Error during WebSocket handshake: {}", e),
    }
}

// Process WebSocket messages
async fn process_messages(
    ws_stream: WebSocketStream<TcpStream>,
    tx: broadcast::Sender<String>,
    addr: SocketAddr,
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
                    }
                },
                Err(e) => {
                    println!("Error reading from VS Code connection: {}", e);
                    break;
                }
            }
        }
    });
    
    // Task for sending broadcast messages to this client
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