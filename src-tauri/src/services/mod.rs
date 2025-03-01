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