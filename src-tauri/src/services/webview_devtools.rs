// src-tauri/src/services/webview_devtools.rs
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Window};
use tokio::sync::oneshot;
use tauri::{Emitter, Listener};

// State to track DevTools and event handling
pub struct WebViewDevToolsState {
    pub enabled: Arc<Mutex<bool>>,
    pub console_logger_injected: Arc<Mutex<bool>>,
    pub shutdown_sender: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

// Message structure for console logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleMessage {
    pub level: String,
    pub args: Vec<String>,
    pub source: Option<String>,
    pub line_number: Option<u32>,
    pub column_number: Option<u32>,
    pub timestamp: i64,
}

impl WebViewDevToolsState {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(Mutex::new(false)),
            console_logger_injected: Arc::new(Mutex::new(false)),
            shutdown_sender: Arc::new(Mutex::new(None)),
        }
    }
}

// Open DevTools
#[tauri::command]
pub fn open_webview_devtools(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WebViewDevToolsState>();
    
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
        // Update state
        if let Ok(mut enabled) = state.enabled.lock() {
            *enabled = true;
        }
        Ok(())
    } else {
        Err("Main window not found".into())
    }
}

// Close DevTools
#[tauri::command]
pub fn close_webview_devtools(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WebViewDevToolsState>();
    
    if let Some(window) = app.get_webview_window("main") {
        window.close_devtools();
        // Update state
        if let Ok(mut enabled) = state.enabled.lock() {
            *enabled = false;
        }
        Ok(())
    } else {
        Err("Main window not found".into())
    }
}

// Check if DevTools are open
#[tauri::command]
pub fn is_webview_devtools_open(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        Ok(window.is_devtools_open())
    } else {
        Err("Main window not found".into())
    }
}

// Receive console logs directly via IPC
#[tauri::command]
pub fn receive_console_log(
    app: AppHandle,
    level: String,
    args: Vec<String>,
    source: Option<String>,
    line_number: Option<u32>,
    column_number: Option<u32>,
    timestamp: i64
) -> Result<(), String> {
    println!("Received console log: {} - {}", level, args.join(" "));
    
    // Create message object
    let message = ConsoleMessage {
        level,
        args,
        source,
        line_number,
        column_number,
        timestamp
    };
    
    // Emit to frontend
    app.emit("webview-console", message).map_err(|e| format!("Failed to emit event: {}", e))?;
    
    Ok(())
}

// Ready event handler
#[tauri::command]
pub fn console_logger_ready(app: AppHandle) -> Result<(), String> {
    println!("Console logger reported ready");
    let _ = app.emit("webview-console-logger-ready", {});
    Ok(())
}

// Inject a console logger script that will emit events for all console logs
#[tauri::command]
pub fn inject_console_logger(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WebViewDevToolsState>();
    
    // Check if already injected
    if let Ok(injected) = state.console_logger_injected.lock() {
        if *injected {
            return Ok(());  // Already injected
        }
    }
    
    if let Some(window) = app.get_webview_window("main") {
        // Create a script that will override console methods and use direct Tauri API
        let script = r#"
        (function() {
            // Check if logger is already injected
            if (window.__TAURI_WEBVIEW_DEVTOOLS_INJECTED__) {
                return;
            }

            // Store original console functions immediately
            const originalConsole = {
                log: console.log,
                warn: console.warn,
                error: console.error,
                info: console.info,
                debug: console.debug
            };
            
            // Mark as injected immediately
            window.__TAURI_WEBVIEW_DEVTOOLS_INJECTED__ = true;
            originalConsole.log('🔧 WebView DevTools console logger initializing...');
            
            // Buffer to store messages before Tauri API is available
            const messageBuffer = [];
            let isProcessingBuffer = false;
            
            // Function to extract caller info from stack trace
            function getCallerInfo() {
                try {
                    throw new Error();
                } catch (e) {
                    const stackLines = e.stack.split('\n');
                    // Skip first two lines (Error and this function)
                    const callerLine = stackLines[3] || '';
                    
                    // Try to extract file name and line number
                    const match = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/);
                    if (match) {
                        return {
                            source: match[2],
                            line: parseInt(match[3], 10),
                            column: parseInt(match[4], 10)
                        };
                    }
                    
                    // Fallback for other formats
                    const simpleMatch = callerLine.match(/at\s+(.*):(\d+):(\d+)/);
                    if (simpleMatch) {
                        return {
                            source: simpleMatch[1],
                            line: parseInt(simpleMatch[2], 10),
                            column: parseInt(simpleMatch[3], 10)
                        };
                    }
                    
                    return { source: 'unknown', line: 0, column: 0 };
                }
            }
            
            // Function to convert arguments to strings
            function stringifyArgs(args) {
                return Array.from(args).map(arg => {
                    try {
                        if (arg === null) return 'null';
                        if (arg === undefined) return 'undefined';
                        if (typeof arg === 'object') return JSON.stringify(arg);
                        return String(arg);
                    } catch (e) {
                        return '[Object]';
                    }
                });
            }
            
            // Attempt to send message via Tauri API
            function sendViaTauriInvoke(level, args, source, lineNumber, columnNumber) {
                if (typeof window.__TAURI__ !== 'undefined' && 
                    typeof window.__TAURI__.core.invoke === 'function') {
                    try {
                        window.__TAURI__.core.invoke('receive_console_log', {
                            level,
                            args,
                            source,
                            line_number: lineNumber,
                            column_number: columnNumber,
                            timestamp: Date.now()
                        }).catch(e => {
                            originalConsole.error('Failed to invoke receive_console_log:', e);
                            // Buffer the message if invoke fails
                            bufferMessage(level, args, source, lineNumber, columnNumber);
                        });
                        return true;
                    } catch (e) {
                        originalConsole.error('Error invoking receive_console_log:', e);
                        // Buffer the message if invoke throws
                        bufferMessage(level, args, source, lineNumber, columnNumber);
                        return false;
                    }
                } else {
                    // Buffer the message if Tauri API is not available
                    bufferMessage(level, args, source, lineNumber, columnNumber);
                    return false;
                }
            }
            
            // Add message to buffer
            function bufferMessage(level, args, source, lineNumber, columnNumber) {
                messageBuffer.push({
                    level,
                    args,
                    source,
                    line_number: lineNumber,
                    column_number: columnNumber,
                    timestamp: Date.now()
                });
                
                if (messageBuffer.length === 1) {
                    // Start processing buffer on first message
                    processMessageBuffer();
                }
            }
            
            // Process buffered messages when Tauri API becomes available
            function processMessageBuffer() {
                if (isProcessingBuffer) return;
                isProcessingBuffer = true;
                
                const checkInterval = setInterval(() => {
                    // Check if Tauri API is available now
                    if (typeof window.__TAURI__ !== 'undefined' && 
                        typeof window.__TAURI__.core.invoke === 'function') {
                        
                        // Process all buffered messages
                        while (messageBuffer.length > 0) {
                            const msg = messageBuffer.shift();
                            try {
                                window.__TAURI__.core.invoke('receive_console_log', msg).catch(e => {
                                    originalConsole.error('Failed to send buffered message:', e);
                                });
                            } catch (e) {
                                originalConsole.error('Error sending buffered message:', e);
                            }
                        }
                        
                        clearInterval(checkInterval);
                        isProcessingBuffer = false;
                    }
                }, 100);
                
                // Stop checking after 10 seconds to avoid memory leaks
                setTimeout(() => {
                    clearInterval(checkInterval);
                    isProcessingBuffer = false;
                }, 10000);
            }
            
            // Override console methods
            ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
                console[level] = function() {
                    // Get caller info
                    const { source, line, column } = getCallerInfo();
                    
                    // Convert arguments to strings
                    const stringArgs = stringifyArgs(arguments);
                    
                    // Send via Tauri or buffer
                    sendViaTauriInvoke(level, stringArgs, source, line, column);
                    
                    // Call original method
                    originalConsole[level].apply(console, arguments);
                };
            });
            
            // Capture uncaught errors
            window.addEventListener('error', function(event) {
                sendViaTauriInvoke(
                    'error',
                    [`Uncaught ${event.error}: ${event.message}`],
                    event.filename || 'unknown',
                    event.lineno || 0,
                    event.colno || 0
                );
            });
            
            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', function(event) {
                let message = 'Unhandled Promise Rejection';
                if (event.reason) {
                    message += `: ${event.reason.message || event.reason}`;
                }
                
                sendViaTauriInvoke(
                    'error',
                    [message],
                    'promise',
                    0,
                    0
                );
            });
            
            // Send ready event
            sendViaTauriInvoke(
                'info',
                ['Console logger ready'],
                'system',
                0,
                0
            );
            
            // Also try the dedicated ready function if Tauri is available
            if (typeof window.__TAURI__ !== 'undefined' && 
                typeof window.__TAURI__.core.invoke === 'function') {
                window.__TAURI__.core.invoke('console_logger_ready').catch(e => {
                    originalConsole.error('Failed to invoke console_logger_ready:', e);
                });
            }
            
            // Log success message
            originalConsole.log('🔧 WebView DevTools console logger injected and ready');
        })();
        "#;
        
        // Evaluate the script in the window
        match window.eval(script) {
            Ok(_) => {
                // Update state to mark logger as injected
                if let Ok(mut injected) = state.console_logger_injected.lock() {
                    *injected = true;
                }
                
                Ok(())
            },
            Err(e) => Err(format!("Failed to inject console logger: {}", e))
        }
    } else {
        Err("Main window not found".into())
    }
}

// Execute JavaScript in the WebView
#[tauri::command]
pub fn execute_javascript(app: AppHandle, javascript: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        match window.eval(&javascript) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to execute JavaScript: {}", e))
        }
    } else {
        Err("Main window not found".into())
    }
}

// Get console logger status
#[tauri::command]
pub fn is_console_logger_injected(app: AppHandle) -> Result<bool, String> {
    let result = app.state::<WebViewDevToolsState>()
        .console_logger_injected
        .lock()
        .map(|guard| *guard)
        .map_err(|_| "Failed to get console logger status".to_string());
    
    result
}