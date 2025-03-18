// src-tauri/src/services/mcp_client_service.rs
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::Duration;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tower::timeout::Timeout; // for the timeout wrapper

// MCP client imports
use mcp_client::{
    client::{ClientCapabilities, ClientInfo, McpClient, McpClientTrait},
    transport::{StdioTransport, Transport},
    McpService,
};
// Import the concrete transport handle type.
use mcp_client::transport::stdio::StdioTransportHandle;

// Since the crate no longer exports a tool descriptor, define your own.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    pub name: String,
    // add additional fields if needed
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryConfig {
    pub path: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPConfig {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub result: serde_json::Value,
    pub error: Option<String>,
}

// Use the concrete type for the transport handle.
type ClientType = Arc<Mutex<Option<Arc<McpClient<Timeout<McpService<StdioTransportHandle>>>>>>>;
type CommandSender = Arc<Mutex<Option<mpsc::Sender<(String, serde_json::Value)>>>>;

pub struct PuppeteerMcpState {
    pub server_running: Arc<Mutex<bool>>,
    pub mcp_client: ClientType,
    pub command_sender: CommandSender,
    pub allowed_directories: Arc<Mutex<Vec<DirectoryConfig>>>,
    pub mcp_config: Arc<Mutex<MCPConfig>>,
    pub available_tools: Arc<Mutex<Vec<ToolDescriptor>>>,
}

impl PuppeteerMcpState {
    pub fn new() -> Self {
        // Default MCP configuration for Puppeteer
        let default_config = MCPConfig {
            command: "docker".to_string(),
            args: vec![
                "run".to_string(),
                "-i".to_string(),
                "--rm".to_string(),
                "--init".to_string(),
                "-e".to_string(),
                "DOCKER_CONTAINER=true".to_string(),
                "mcp/puppeteer".to_string(),
            ],
        };

        Self {
            server_running: Arc::new(Mutex::new(false)),
            mcp_client: Arc::new(Mutex::new(None)),
            command_sender: Arc::new(Mutex::new(None)),
            allowed_directories: Arc::new(Mutex::new(Vec::new())),
            mcp_config: Arc::new(Mutex::new(default_config)),
            available_tools: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub async fn get_puppeteer_mcp_status(state: tauri::State<'_, PuppeteerMcpState>) -> Result<bool, String> {
    match state.server_running.lock() {
        Ok(running) => Ok(*running),
        Err(_) => Err("Failed to get MCP server status".to_string()),
    }
}

#[tauri::command]
pub async fn get_puppeteer_mcp_directories(
    state: tauri::State<'_, PuppeteerMcpState>,
) -> Result<Vec<DirectoryConfig>, String> {
    match state.allowed_directories.lock() {
        Ok(dirs) => Ok(dirs.clone()),
        Err(_) => Err("Failed to get allowed directories".to_string()),
    }
}

#[tauri::command]
pub async fn get_puppeteer_mcp_tools(
    state: tauri::State<'_, PuppeteerMcpState>,
) -> Result<Vec<String>, String> {
    match state.available_tools.lock() {
        Ok(tools) => {
            let tool_names = tools.iter().map(|t| t.name.clone()).collect();
            Ok(tool_names)
        },
        Err(_) => Err("Failed to get available tools".to_string()),
    }
}

#[tauri::command]
pub async fn add_puppeteer_mcp_directory(
    state: tauri::State<'_, PuppeteerMcpState>,
    directory: String,
    name: String,
) -> Result<(), String> {
    match state.allowed_directories.lock() {
        Ok(mut dirs) => {
            if dirs.iter().any(|dir| dir.path == directory) {
                return Err("Directory already exists".to_string());
            }
            dirs.push(DirectoryConfig {
                path: directory,
                name,
                enabled: true,
            });
            Ok(())
        },
        Err(_) => Err("Failed to lock allowed directories".to_string()),
    }
}

#[tauri::command]
pub async fn update_puppeteer_mcp_directory(
    state: tauri::State<'_, PuppeteerMcpState>,
    directory: String,
    enabled: bool,
) -> Result<(), String> {
    match state.allowed_directories.lock() {
        Ok(mut dirs) => {
            if let Some(dir) = dirs.iter_mut().find(|dir| dir.path == directory) {
                dir.enabled = enabled;
                Ok(())
            } else {
                Err("Directory not found".to_string())
            }
        },
        Err(_) => Err("Failed to lock allowed directories".to_string()),
    }
}

#[tauri::command]
pub async fn remove_puppeteer_mcp_directory(
    state: tauri::State<'_, PuppeteerMcpState>,
    directory: String,
) -> Result<(), String> {
    match state.allowed_directories.lock() {
        Ok(mut dirs) => {
            let index = dirs.iter().position(|dir| dir.path == directory);
            if let Some(idx) = index {
                dirs.remove(idx);
                Ok(())
            } else {
                Err("Directory not found".to_string())
            }
        },
        Err(_) => Err("Failed to lock allowed directories".to_string()),
    }
}

#[tauri::command]
pub async fn get_puppeteer_mcp_config(
    state: tauri::State<'_, PuppeteerMcpState>,
) -> Result<MCPConfig, String> {
    match state.mcp_config.lock() {
        Ok(config) => Ok(config.clone()),
        Err(_) => Err("Failed to get MCP configuration".to_string()),
    }
}

#[tauri::command]
pub async fn update_puppeteer_mcp_config(
    state: tauri::State<'_, PuppeteerMcpState>,
    config: MCPConfig,
) -> Result<(), String> {
    match state.mcp_config.lock() {
        Ok(mut current_config) => {
            *current_config = config;
            Ok(())
        },
        Err(_) => Err("Failed to update MCP configuration".to_string()),
    }
}

#[tauri::command]
pub async fn start_puppeteer_mcp_server(
    app: AppHandle,
    state: tauri::State<'_, PuppeteerMcpState>,
) -> Result<(), String> {
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if is_running {
        return Err("MCP server is already running".to_string());
    }
    
    let config = match state.mcp_config.lock() {
        Ok(cfg) => cfg.clone(),
        Err(_) => return Err("Failed to get MCP configuration".to_string()),
    };
    
    let allowed_dirs = match state.allowed_directories.lock() {
        Ok(dirs) => dirs.clone(),
        Err(_) => return Err("Failed to get allowed directories".to_string()),
    };

    let (tx, mut rx) = mpsc::channel::<(String, serde_json::Value)>(32);
    if let Ok(mut sender) = state.command_sender.lock() {
        *sender = Some(tx);
    }

    let _ = app.emit("mcp-server-output", "Starting Puppeteer MCP server...");

    let mut env_vars = HashMap::new();
    env_vars.insert("DEBUG".to_string(), "true".to_string());
    env_vars.insert("MCP_VERBOSE".to_string(), "true".to_string());
    for (idx, dir) in allowed_dirs.iter().enumerate() {
        if dir.enabled {
            env_vars.insert(format!("MCP_ALLOWED_DIR_{}", idx), dir.path.clone());
        }
    }
    
    let cmd_str = format!("{} {}", config.command, config.args.join(" "));
    let _ = app.emit("mcp-server-output", format!("Executing command: {}", cmd_str));
    
    let server_running = state.server_running.clone();
    let mcp_client = state.mcp_client.clone();
    let available_tools = state.available_tools.clone();
    let app_handle = app.clone();
    
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => return Err(format!("Failed to create tokio runtime: {}", e)),
    };
    
    std::thread::spawn(move || {
        rt.block_on(async {
            let transport = StdioTransport::new(
                config.command,
                config.args,
                env_vars
            );
            
            let transport_handle = match transport.start().await {
                Ok(handle) => handle,
                Err(e) => {
                    let _ = app_handle.emit("mcp-server-output", format!("[ERROR] Failed to start transport: {}", e));
                    if let Ok(mut running) = server_running.lock() {
                        *running = false;
                    }
                    return;
                }
            };
            
            let service = McpService::with_timeout(transport_handle, Duration::from_secs(10));
            let mut client = McpClient::new(service);            
            
            match client.initialize(
                ClientInfo {
                    name: "pieverse-mcp-host".into(),
                    version: "1.0.0".into(),
                },
                ClientCapabilities::default(),
            ).await {
                Ok(info) => {
                    let _ = app_handle.emit("mcp-server-output", format!(
                        "Connected to MCP server: {} v{}",
                        info.server_info.name,
                        info.server_info.version
                    ));
                    
                    if let Ok(mut client_lock) = mcp_client.lock() {
                        *client_lock = Some(Arc::new(client));
                        if let Some(ref client_ref) = *client_lock {
                            if let Ok(mut running) = server_running.lock() {
                                *running = true;
                            }
                            let next_cursor: Option<String> = None;
                            match client_ref.list_tools(next_cursor).await {
                                Ok(tools_response) => {
                                    let tool_names: Vec<String> = tools_response.tools.iter()
                                        .map(|t| t.name.clone())
                                        .collect();
                                    
                                    if let Ok(mut tools_lock) = available_tools.lock() {
                                        *tools_lock = tools_response.tools.into_iter().map(|t| ToolDescriptor { name: t.name }).collect();
                                    }
                                    
                                    let _ = app_handle.emit("mcp-server-output", format!(
                                        "Available tools: {}", 
                                        tool_names.join(", ")
                                    ));
                                },
                                Err(e) => {
                                    let _ = app_handle.emit("mcp-server-output", format!(
                                        "[WARNING] Failed to list tools: {}", e
                                    ));
                                }
                            }
                        } else {
                            let _ = app_handle.emit("mcp-server-output", "[ERROR] Failed to store client");
                            if let Ok(mut running) = server_running.lock() {
                                *running = false;
                            }
                            return;
                        }
                    } else {
                        let _ = app_handle.emit("mcp-server-output", "[ERROR] Failed to lock client state");
                        if let Ok(mut running) = server_running.lock() {
                            *running = false;
                        }
                        return;
                    }
                },
                Err(e) => {
                    let _ = app_handle.emit("mcp-server-output", format!("[ERROR] Failed to initialize: {}", e));
                    if let Ok(mut running) = server_running.lock() {
                        *running = false;
                    }
                    return;
                }
            }
            
            while let Some((tool, args)) = rx.recv().await {
                let _ = app_handle.emit("mcp-server-output", format!(
                    "Calling tool '{}' with args: {}", tool, args
                ));
                
                let client_result = mcp_client.lock().ok().and_then(|guard| guard.as_ref().cloned());
                
                if let Some(client) = client_result {
                    match client.call_tool(&tool, args).await {
                        Ok(result) => {
                            let is_error = result.is_error.unwrap_or(false);
                            
                            let tool_result = ToolResult {
                                success: !is_error,
                                result: serde_json::to_value(&result.content).unwrap_or(serde_json::Value::Null),
                                error: if is_error { 
                                    Some(format!("Tool execution failed: {:?}", result.content)) 
                                } else { 
                                    None 
                                }
                            };
                            
                            let _ = app_handle.emit("mcp-tool-result", tool_result);
                            
                            let _ = app_handle.emit("mcp-server-output", format!(
                                "Tool '{}' {} with result: {}", 
                                tool,
                                if is_error { "failed" } else { "succeeded" },
                                serde_json::to_string_pretty(&result.content).unwrap_or_else(|_| "".to_string())
                            ));
                        },
                        Err(e) => {
                            let tool_result = ToolResult {
                                success: false,
                                result: serde_json::Value::Null,
                                error: Some(format!("Failed to call tool: {}", e))
                            };
                            
                            let _ = app_handle.emit("mcp-tool-result", tool_result);
                            
                            let _ = app_handle.emit("mcp-server-output", format!(
                                "[ERROR] Failed to call tool '{}': {}", tool, e
                            ));
                        }
                    }
                } else {
                    let _ = app_handle.emit("mcp-server-output", "[ERROR] Client not available for tool call");
                    
                    let tool_result = ToolResult {
                        success: false,
                        result: serde_json::Value::Null,
                        error: Some("MCP client not available".to_string())
                    };
                    
                    let _ = app_handle.emit("mcp-tool-result", tool_result);
                }
            }
            
            let _ = app_handle.emit("mcp-server-output", "Command channel closed, shutting down MCP server");
            
            if let Ok(mut client_lock) = mcp_client.lock() {
                *client_lock = None;
            }
            
            if let Ok(mut running) = server_running.lock() {
                *running = false;
            }
            
            let _ = app_handle.emit("mcp-server-stopped", ());
        });
    });
    
    Ok(())
}

#[tauri::command]
pub async fn stop_puppeteer_mcp_server(state: tauri::State<'_, PuppeteerMcpState>) -> Result<(), String> {
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if !is_running {
        return Ok(());
    }
    
    if let Ok(mut running) = state.server_running.lock() {
        *running = false;
    }
    
    if let Ok(mut sender) = state.command_sender.lock() {
        *sender = None;
    }
    
    if let Ok(mut client) = state.mcp_client.lock() {
        *client = None;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn send_to_puppeteer_mcp(
    app: AppHandle,
    state: tauri::State<'_, PuppeteerMcpState>,
    tool: String,
    args: serde_json::Value,
) -> Result<(), String> {
    let is_running = match state.server_running.lock() {
        Ok(guard) => *guard,
        Err(_) => return Err("Failed to lock server state".to_string()),
    };
    
    if !is_running {
        return Err("MCP server is not running".to_string());
    }
    
    let sender = match state.command_sender.lock() {
        Ok(sender) => sender.clone(),
        Err(_) => return Err("Failed to lock command sender".to_string()),
    };
    
    if let Some(tx) = sender {
        match tx.send((tool.clone(), args.clone())).await {
            Ok(_) => {
                let _ = app.emit("mcp-server-output", format!(
                    "Sent tool request '{}' to MCP server", tool
                ));
                Ok(())
            },
            Err(e) => Err(format!("Failed to send command: {}", e)),
        }
    } else {
        Err("Command sender not available".to_string())
    }
}
