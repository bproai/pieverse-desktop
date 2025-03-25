// src-tauri/src/services/brand_sound.rs

use anyhow::Result;
use std::path::{Path, PathBuf};

// Function to get the path to the brand sound file
// This will be exposed to the frontend via Tauri commands
#[tauri::command]
pub fn get_brand_sound_path() -> Result<String, String> {
    // Path to the brand sound in your app's resources
    // This is relative to the compiled executable
    let sound_path = "sounds/brand-sound.mp3";

    // Return path that can be used with the asset protocol
    Ok(sound_path.to_string())
}

// Function to check if the sound file exists
#[tauri::command]
pub fn check_brand_sound_exists() -> Result<bool, String> {
    let app_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| "Could not determine app directory".to_string())?
        .to_path_buf();

    let sound_path = app_dir.join("sounds/brand-sound.mp3");
    Ok(sound_path.exists())
}
