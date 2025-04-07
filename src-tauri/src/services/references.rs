// src-tauri/src/services/references.rs
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ReferenceType {
    #[serde(rename = "documentation")]
    Documentation,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "code")]
    Code,
    #[serde(rename = "other")]
    Other,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReferenceItem {
    pub id: String,
    pub title: String,
    pub r#type: ReferenceType,
    pub url: Option<String>,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub date_added: String,
    pub image_data: Option<String>,
}

pub struct ReferencesService {
    app_handle: AppHandle,
    references_file: PathBuf,
}

impl ReferencesService {
    pub fn new(app_handle: AppHandle) -> Self {
        // In Tauri 2.0, we use app_data_dir() directly from the AppHandle
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        // Create directory if it doesn't exist
        if !app_dir.exists() {
            fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
        }

        let references_file = app_dir.join("references.json");

        // Create file if it doesn't exist
        if !references_file.exists() {
            let default_references = Vec::<ReferenceItem>::new();
            let json = serde_json::to_string_pretty(&default_references)
                .expect("Failed to serialize default references");
            let mut file =
                File::create(&references_file).expect("Failed to create references file");
            file.write_all(json.as_bytes())
                .expect("Failed to write default references");
        }

        Self {
            app_handle,
            references_file,
        }
    }

    pub fn load_references(&self) -> Result<Vec<ReferenceItem>, String> {
        let mut file = File::open(&self.references_file)
            .map_err(|e| format!("Failed to open references file: {}", e))?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read references file: {}", e))?;

        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse references file: {}", e))
    }

    pub fn save_references(&self, references: Vec<ReferenceItem>) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&references)
            .map_err(|e| format!("Failed to serialize references: {}", e))?;

        let mut file = File::create(&self.references_file)
            .map_err(|e| format!("Failed to create references file: {}", e))?;

        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write references file: {}", e))?;

        Ok(())
    }
}

// Tauri command to load references
#[tauri::command]
pub async fn load_references(app_handle: tauri::AppHandle) -> Result<Vec<ReferenceItem>, String> {
    let references_service = ReferencesService::new(app_handle);
    references_service.load_references()
}

// Tauri command to save references
#[tauri::command]
pub async fn save_references(
    app_handle: tauri::AppHandle,
    references: Vec<ReferenceItem>,
) -> Result<(), String> {
    let references_service = ReferencesService::new(app_handle);
    references_service.save_references(references)
}

// Tauri command to export references to a JSON file
#[tauri::command]
pub async fn export_references_to_json(
    app_handle: tauri::AppHandle,
    file_path: String,
) -> Result<(), String> {
    let references_service = ReferencesService::new(app_handle);
    let references = references_service.load_references()?;
    
    let json = serde_json::to_string_pretty(&references)
        .map_err(|e| format!("Failed to serialize references: {}", e))?;

    let mut file = std::fs::File::create(file_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;

    std::io::Write::write_all(&mut file, json.as_bytes())
        .map_err(|e| format!("Failed to write references to export file: {}", e))?;

    Ok(())
}