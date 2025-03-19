// src-tauri/src/services/chrome_extension_ws.rs
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

// Structures for our Chrome extension integration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromeExtMessage {
    pub message_type: String,
    pub content: serde_json::Value,
    pub timestamp: Option<i64>,
}

pub struct ChromeExtWebSocketState {
    pub server_running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub shutdown_sender: SendableShutdown,
    pub broadcast_tx: SendableTx,
}

impl ChromeExtWebSocketState {
    pub fn new() -> Self {
        Self {
            server_running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(3031)), // Default port for Chrome extension WebSocket
            shutdown_sender: Arc::new(Mutex::new(None)),
            broadcast_tx: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub fn start_chrome_ws_server(
    app: AppHandle,
    port: Option<u16>,
    state: tauri::State<'_, ChromeExtWebSocketState>,
) -> Result<(), String> {
    // Check if already running
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if is_running {
        return Err("Chrome extension WebSocket server is already running".to_string());
    }
    
    // Extract port
    let server_port = port.unwrap_or(3031);
    
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

    // First set up event listener for sending messages to Chrome extensions
    let app_for_listen = app.clone();
    let listen_handle = app_for_listen.listen("send-chrome-message", move |event| {
        let payload = event.payload();
        let _ = event_tx.send(payload.to_string());
    });
    
    // Now spawn the async task
    let app_for_server = app;
    tauri::async_runtime::spawn(async move {
        // Start the server
        if let Err(e) = run_chrome_ws_server(
            app_for_server,
            server_port,
            running,
            shutdown_sender,
            tx
        ).await {
            eprintln!("Chrome extension WebSocket server error: {}", e);
        }
        
        // Clean up event listener when server stops
        let _ = app_for_listen.unlisten(listen_handle);
    });
    
    Ok(())
}

// Separate function for the actual server implementation
async fn run_chrome_ws_server(
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
    
    println!("Chrome extension WebSocket server started on port {}", actual_port);
    
    // Start accepting connections
    let mut listener_stream = TcpListenerStream::new(listener);
    
    loop {
        tokio::select! {
            Some(socket_result) = listener_stream.next() => {
                match socket_result {
                    Ok(stream) => {
                        if let Ok(peer_addr) = stream.peer_addr() {
                            println!("New Chrome extension connection from: {}", peer_addr);
                        }
                        let conn_tx = tx.clone();
                        let conn_app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            handle_chrome_connection(stream, conn_tx, conn_app).await;
                        });
                    },
                    Err(e) => println!("Error accepting connection: {}", e),
                }
            },
            _ = &mut shutdown_rx => {
                println!("Chrome extension WebSocket server shutting down");
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
pub fn stop_chrome_ws_server(state: tauri::State<'_, ChromeExtWebSocketState>) -> Result<(), String> {
    // Check if running
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if !is_running {
        return Err("Chrome extension WebSocket server is not running".to_string());
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
pub fn get_chrome_ws_status(state: tauri::State<'_, ChromeExtWebSocketState>) -> Result<(bool, u16), String> {
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
pub fn send_message_to_chrome(
    state: tauri::State<'_, ChromeExtWebSocketState>,
    message: String,
) -> Result<(), String> {
    // Get broadcast sender
    let tx = match state.broadcast_tx.lock() {
        Ok(lock) => match lock.clone() {
            Some(tx) => tx,
            None => return Err("Chrome extension WebSocket server is not running".to_string()),
        },
        Err(_) => return Err("Failed to lock broadcast sender".to_string()),
    };
    
    // Send the message
    match tx.send(message) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to send message: {}", e)),
    }
}

async fn handle_chrome_connection(stream: TcpStream, tx: broadcast::Sender<String>, app: AppHandle) {
    // Get peer address for logging
    let addr = stream.peer_addr().unwrap_or_else(|_| {
        "unknown".parse().unwrap()
    });
    
    // Upgrade to WebSocket
    match tokio_tungstenite::accept_async(stream).await {
        Ok(ws_stream) => {
            println!("WebSocket connection established with Chrome extension: {}", addr);
            
            // Emit connected event to frontend
            emit_connection_event(&app, true, &addr.to_string());
            
            // Process messages
            process_chrome_messages(ws_stream, tx, addr, app.clone()).await;
            
            // Emit disconnected event when connection closes
            // This will execute after process_chrome_messages returns (connection closed)
            emit_connection_event(&app, false, &addr.to_string());
        },
        Err(e) => println!("Error during WebSocket handshake: {}", e),
    }
}

async fn process_chrome_messages(
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
                        println!("Received message from Chrome extension: {}", text);
                        
                        // Try to parse message
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                                match msg_type {
                                    "request" => {
                                        // Emit the request to the frontend
                                        let _ = app.emit("chrome-extension-request", json);
                                    },
                                    "action" => {
                                        // Emit the action to the frontend
                                        let _ = app.emit("chrome-extension-action", json);
                                    },
                                    "notification" => {
                                        // Emit the notification to the frontend
                                        let _ = app.emit("chrome-extension-notification", json);
                                    },
                                    _ => {
                                        // Emit generic message for unknown types
                                        let _ = app.emit("chrome-extension-message", json);
                                    }
                                }
                            } else {
                                // If no type specified, emit as generic message
                                let _ = app.emit("chrome-extension-message", json);
                            }
                        }
                    }
                },
                Err(e) => {
                    println!("Error reading from Chrome extension connection: {}", e);
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
                        println!("Error sending to Chrome extension: {}", e);
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
    
    println!("WebSocket connection closed with Chrome extension: {}", addr);
}


// Add this function somewhere in your module
fn emit_connection_event(app: &AppHandle, connected: bool, client_info: &str) {
    let _ = app.emit("chrome-extension-connection", serde_json::json!({
        "connected": connected,
        "clientInfo": client_info
    }));
}