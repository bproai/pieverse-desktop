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
        // #[cfg(any(debug_assertions, feature = "devtools"))]
        // {
            // Fix: open_devtools() returns () not Result
            window.open_devtools();
            // Update state
            if let Ok(mut enabled) = state.enabled.lock() {
                *enabled = true;
            }
            Ok(())
        // }
        // #[cfg(not(any(debug_assertions, feature = "devtools")))]
        // {
        //     Err("DevTools are only available in debug mode or when the 'devtools' feature is enabled.".into())
        // }
    } else {
        Err("Main window not found".into())
    }
}

// Close DevTools
#[tauri::command]
pub fn close_webview_devtools(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WebViewDevToolsState>();
    
    if let Some(window) = app.get_webview_window("main") {
        // #[cfg(any(debug_assertions, feature = "devtools"))]
        // {
            // Fix: close_devtools() returns () not Result
            window.close_devtools();
            // Update state
            if let Ok(mut enabled) = state.enabled.lock() {
                *enabled = false;
            }
            Ok(())
        // }
        // #[cfg(not(any(debug_assertions, feature = "devtools")))]
        // {
        //     Err("DevTools are only available in debug mode or when the 'devtools' feature is enabled.".into())
        // }
    } else {
        Err("Main window not found".into())
    }
}


// Check if DevTools are open
#[tauri::command]
pub fn is_webview_devtools_open(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        // #[cfg(any(debug_assertions, feature = "devtools"))]
        // {
            Ok(window.is_devtools_open())
        // }
        // #[cfg(not(any(debug_assertions, feature = "devtools")))]
        // {
        //     Err("DevTools are only available in debug mode or when the 'devtools' feature is enabled.".into())
        // }
    } else {
        Err("Main window not found".into())
    }
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
        // Create a script that will override console methods and emit events
        // Update the script in the inject_console_logger function
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
            
            // Initialize a buffer to store messages
            const messageBuffer = [];
            
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
            
            // Custom event for console messages
            const CONSOLE_EVENT = 'console-message';
            const READY_EVENT = 'console-logger-ready';
            
            // Function to emit an event (adapted for Tauri 2)
            async function emitEvent(eventName, payload) {
                try {
                    // First, try with direct DOM event if available
                    const event = new CustomEvent(`tauri://${eventName}`, { 
                        detail: payload 
                    });
                    window.dispatchEvent(event);
                    return true;
                } catch (e) {
                    originalConsole.error("Failed to emit event:", e);
                    return false;
                }
            }
            
            // Process any buffered messages
            function processBufferedMessages() {
                if (messageBuffer.length > 0) {
                    originalConsole.log(`Processing ${messageBuffer.length} buffered messages`);
                    
                    // Process all buffered messages
                    for (const msg of messageBuffer) {
                        emitEvent(msg.eventName, msg.payload);
                    }
                    messageBuffer.length = 0;
                }
            }
            
            // Try to emit an event or buffer it for later
            function tryEmitEvent(eventName, payload) {
                // Always buffer messages
                messageBuffer.push({ eventName, payload });
                
                // Every 5 messages, try to process the buffer
                if (messageBuffer.length % 5 === 0 || messageBuffer.length === 1) {
                    processBufferedMessages();
                }
            }
            
            // Override console methods
            ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
                console[level] = function() {
                    // Get caller info
                    const { source, line, column } = getCallerInfo();
                    
                    // Convert arguments to strings
                    const stringArgs = stringifyArgs(arguments);
                    
                    // Try to emit the event
                    tryEmitEvent(CONSOLE_EVENT, {
                        level,
                        args: stringArgs,
                        source,
                        line_number: line,
                        column_number: column,
                        timestamp: Date.now()
                    });
                    
                    // Call original method
                    originalConsole[level].apply(console, arguments);
                };
            });
            
            // Capture uncaught errors
            window.addEventListener('error', function(event) {
                tryEmitEvent(CONSOLE_EVENT, {
                    level: 'error',
                    args: [`Uncaught ${event.error}: ${event.message}`],
                    source: event.filename,
                    line_number: event.lineno,
                    column_number: event.colno,
                    timestamp: Date.now()
                });
            });
            
            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', function(event) {
                let message = 'Unhandled Promise Rejection';
                if (event.reason) {
                    message += `: ${event.reason.message || event.reason}`;
                }
                
                tryEmitEvent(CONSOLE_EVENT, {
                    level: 'error',
                    args: [message],
                    source: 'promise',
                    line_number: 0,
                    column_number: 0,
                    timestamp: Date.now()
                });
            });
            
            // Emit ready event
            tryEmitEvent(READY_EVENT, { timestamp: Date.now() });
            
            // Set up an interval to periodically process buffered messages
            setInterval(processBufferedMessages, 1000);
            
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
                
                // Set up an event listener for console messages
                setup_console_listener(&app, window);
                
                Ok(())
            },
            Err(e) => Err(format!("Failed to inject console logger: {}", e))
        }
    } else {
        Err("Main window not found".into())
    }
}

// Helper function to set up event listener for console messages
fn setup_console_listener(app: &AppHandle, window: tauri::WebviewWindow) {
    // Clone app handle for use in listener
    let app_clone = app.clone();
    
    // Listen for console messages events
    let _listener = window.listen("console-message", move |event| {
        // Forward the event to the app
        let payload = event.payload();
        let _ = app_clone.emit("webview-console", payload);
    });
    
    // Also listen for the ready event
    let app_clone2 = app.clone();
    let _ready_listener = window.listen("console-logger-ready", move |_| {
        let _ = app_clone2.emit("webview-console-logger-ready", {});
    });
    
    // Log that listeners were set up
    println!("Console message listeners set up successfully");
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
    // Since we're having persistent lifetime issues, let's take a different approach
    // Copy the value directly instead of dealing with references and locks across function boundaries
    
    let result = app.state::<WebViewDevToolsState>()
        .console_logger_injected
        .lock()
        .map(|guard| *guard)
        .map_err(|_| "Failed to get console logger status".to_string());
    
    result
}