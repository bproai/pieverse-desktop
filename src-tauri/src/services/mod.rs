// src-tauri/src/services/mod.rs

// Database services
pub mod mongodb;
pub mod mysql;
pub mod sqlite;
pub mod sqlite_prompts;

// AI and API services
pub mod api_server;
pub mod whisper;
pub mod brand_sound;
pub mod python;

// Google Trends services
pub mod google_trends;
pub mod trend_spike_service;

// Screenshot service
pub mod screenshot;

// In src-tauri/src/services/mod.rs
pub mod chrome_debugger;

// Project Structure service
pub mod project_structure;

// References service
pub mod references;

// LLM Rules service
pub mod llm_rules;

// VS Code integration service
pub mod vscode_ws;

pub mod file_service;

pub mod claude_mcp_service;

pub mod mcp_client_service;