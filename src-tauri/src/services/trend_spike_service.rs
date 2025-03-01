// src-tauri/src/services/trend_spike_service.rs
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::process::Command;
use std::path::Path;
// Remove unused import: use std::env;
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};
// Only import what we use
use chrono::Utc;
use tokio::task;
// Remove unused import: use once_cell::sync::Lazy;
use std::collections::HashMap;
use dirs;

// Define types for trend spike predictions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ForecastPoint {
    pub date: String,
    pub value: f64,
    pub lower: f64,
    pub upper: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignalSource {
    pub value: f64,
    pub weight: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<LeadingIndicator>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub predicted_spike_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LeadingIndicator {
    pub term: String,
    pub lead_time: f64,
    pub trend: f64,
    pub signal_strength: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignalDetails {
    pub leading_indicators: SignalSource,
    pub anomalies: SignalSource,
    pub acceleration: SignalSource,
    pub prophet_forecast: SignalSource,
    pub social_signals: SignalSource,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrendPrediction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub keyword: String,
    pub probability: f64,
    pub forecast: Vec<ForecastPoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub predicted_spike_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signals: Option<SignalDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorResult {
    pub predictions: Vec<TrendPrediction>,
}

// Store for monitoring configuration and active monitoring state
pub struct TrendSpikeService {
    pub db_path: Mutex<String>,
    pub monitoring_keywords: Mutex<HashMap<String, Vec<String>>>,
    pub is_monitoring: Mutex<bool>,
    pub threshold: Mutex<f64>,
    pub predictions: Mutex<Vec<TrendPrediction>>,
    pub monitor_interval: Mutex<u64>, // Minutes between monitoring runs
}

impl TrendSpikeService {
    pub fn new() -> Self {
        // Create a database path in the app's data directory
        let app_data_dir = dirs::data_dir()
            .map(|p| p.join("pieverse"))
            .unwrap_or_else(|| Path::new("./data").to_path_buf());
        
        // Create directory if it doesn't exist
        std::fs::create_dir_all(&app_data_dir).unwrap_or_else(|e| {
            eprintln!("Failed to create data directory: {}", e);
        });
        
        let db_path = app_data_dir.join("trend_spikes.db").to_string_lossy().to_string();
        
        Self {
            db_path: Mutex::new(db_path),
            monitoring_keywords: Mutex::new(HashMap::new()),
            is_monitoring: Mutex::new(false),
            threshold: Mutex::new(0.7),
            predictions: Mutex::new(Vec::new()),
            monitor_interval: Mutex::new(60), // Default to 60 minutes
        }
    }
    
    // Add a keyword to monitor for a specific category
    pub fn add_keyword(&self, category: &str, keyword: &str) -> bool {
        let mut keywords = self.monitoring_keywords.lock().unwrap();
        
        let category_keywords = keywords.entry(category.to_string()).or_insert(Vec::new());
        
        if !category_keywords.contains(&keyword.to_string()) {
            category_keywords.push(keyword.to_string());
            true
        } else {
            false
        }
    }
    
    // Remove a keyword from monitoring
    pub fn remove_keyword(&self, category: &str, keyword: &str) -> bool {
        let mut keywords = self.monitoring_keywords.lock().unwrap();
        
        if let Some(category_keywords) = keywords.get_mut(category) {
            let pos = category_keywords.iter().position(|k| k == keyword);
            if let Some(idx) = pos {
                category_keywords.remove(idx);
                return true;
            }
        }
        
        false
    }
    
    // Set monitoring threshold
    pub fn set_threshold(&self, threshold: f64) {
        let mut t = self.threshold.lock().unwrap();
        *t = threshold.max(0.0).min(1.0); // Keep between 0 and 1
    }
    
    // Set monitoring interval
    pub fn set_monitor_interval(&self, minutes: u64) {
        let mut interval = self.monitor_interval.lock().unwrap();
        // Minimum 15 minutes, maximum 24 hours
        *interval = minutes.max(15).min(24*60);
    }
    
    // Get all keywords being monitored
    pub fn get_monitored_keywords(&self) -> HashMap<String, Vec<String>> {
        self.monitoring_keywords.lock().unwrap().clone()
    }
    
    // Check if monitoring is active
    pub fn is_monitoring_active(&self) -> bool {
        *self.is_monitoring.lock().unwrap()
    }
    
    // Get predictions (optionally filtered by category)
    pub fn get_predictions(&self, category: Option<&str>) -> Vec<TrendPrediction> {
        let predictions = self.predictions.lock().unwrap();
        
        if let Some(category) = category {
            // Filter by category - we'll check if the keyword exists in that category
            let keywords = self.monitoring_keywords.lock().unwrap();
            
            if let Some(category_keywords) = keywords.get(category) {
                predictions.iter()
                    .filter(|pred| category_keywords.contains(&pred.keyword))
                    .cloned()
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            // Return all predictions
            predictions.clone()
        }
    }
    
    // Start the background monitoring task
    pub fn start_monitoring(self: &Arc<Self>) -> bool {
        let mut is_monitoring = self.is_monitoring.lock().unwrap();
        
        if *is_monitoring {
            return false; // Already monitoring
        }
        
        *is_monitoring = true;
        
        // Clone the Arc for use in the task
        let service_clone = self.clone();
        
        // Spawn a background task
        tokio::spawn(async move {
            let service = service_clone;
            
            // Monitor indefinitely until stopped
            while *service.is_monitoring.lock().unwrap() {
                // Process each category of keywords
                for (category, keywords) in service.get_monitored_keywords() {
                    if keywords.is_empty() {
                        continue;
                    }
                    
                    // Only process up to 3 keywords at once to avoid rate limiting
                    for chunk in keywords.chunks(3) {
                        let db_path = service.db_path.lock().unwrap().clone();
                        let threshold = *service.threshold.lock().unwrap();
                        
                        if let Err(e) = monitor_keywords(&service, db_path, chunk.to_vec(), threshold, Some(&category)).await {
                            eprintln!("Error monitoring keywords: {}", e);
                        }
                        
                        // Add delay between chunks to avoid rate limiting
                        sleep(Duration::from_secs(10)).await;
                    }
                    
                    // Add delay between categories
                    sleep(Duration::from_secs(10)).await;
                }
                
                // Wait for next monitoring interval
                let interval_minutes = *service.monitor_interval.lock().unwrap();
                sleep(Duration::from_secs(interval_minutes * 60)).await;
            }
        });
        
        true
    }
    
    // Stop the background monitoring task
    pub fn stop_monitoring(&self) -> bool {
        let mut is_monitoring = self.is_monitoring.lock().unwrap();
        
        if !*is_monitoring {
            return false; // Not monitoring
        }
        
        *is_monitoring = false;
        true
    }
    
    // Update predictions from monitoring
    pub fn update_predictions(&self, new_predictions: Vec<TrendPrediction>) {
        let mut predictions = self.predictions.lock().unwrap();
        
        for new_pred in new_predictions {
            // Check if we already have a prediction for this keyword
            let existing_idx = predictions.iter().position(|p| p.keyword == new_pred.keyword);
            
            if let Some(idx) = existing_idx {
                // Update existing prediction
                predictions[idx] = new_pred;
            } else {
                // Add new prediction
                predictions.push(new_pred);
            }
        }
    }
    
    // Get signal sources for a keyword
    pub async fn get_signal_sources(&self, keyword: String) -> Result<serde_json::Value, String> {
        let db_path = self.db_path.lock().unwrap().clone();
        
        // Find the Python script - Use owned data instead of references
        let script_paths = vec![
            "python_scripts/trend_spike_predictor.py".to_string(),
            "src/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/src/python_scripts/trend_spike_predictor.py".to_string(),
        ];
        
        let mut script_path_str = None;
        for path_str in &script_paths {
            if Path::new(path_str).exists() {
                script_path_str = Some(path_str.clone());
                break;
            }
        }
        
        let script_path_str = match script_path_str {
            Some(path) => path,
            None => {
                eprintln!("Python script not found at expected locations");
                return Err("Python script not found".into());
            }
        };
        
        // Determine Python command (python3 or python)
        let python_cmd = if cfg!(windows) { "python".to_string() } else { "/usr/local/bin/python3".to_string() };
        
        // Use cloned values for task
        let keyword_owned = keyword.clone();
        
        // Execute the Python script in a separate thread to avoid blocking
        let output = task::spawn_blocking(move || {
            Command::new(python_cmd)
                .arg(&script_path_str)
                .arg(&db_path)
                .arg("sources")
                .arg(&keyword_owned)
                .output()
        }).await
        .map_err(|e| format!("Task spawn error: {}", e))?
        .map_err(|e| format!("Command execution error: {}", e))?;
        
        if !output.status.success() {
            let error_message = String::from_utf8_lossy(&output.stderr);
            eprintln!("Python script failed: {}", error_message);
            return Err(format!("Python script execution failed: {}", error_message));
        }
        
        // Parse the output
        let response = String::from_utf8_lossy(&output.stdout);
        match serde_json::from_str::<serde_json::Value>(&response) {
            Ok(sources) => Ok(sources),
            Err(e) => {
                eprintln!("Failed to parse Python response: {}", e);
                Err(format!("Failed to parse Python response: {}", e))
            }
        }
    }
    
    // Run a prediction for a single keyword
    pub async fn predict_spike(&self, keyword: String) -> Result<TrendPrediction, String> {
        let db_path = self.db_path.lock().unwrap().clone();
        let threshold = *self.threshold.lock().unwrap();
        
        // Find the Python script - Use owned values
        let script_paths = vec![
            "python_scripts/trend_spike_predictor.py".to_string(),
            "src/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/src/python_scripts/trend_spike_predictor.py".to_string(),
        ];
        
        let mut script_path_str = None;
        for path_str in &script_paths {
            if Path::new(path_str).exists() {
                script_path_str = Some(path_str.clone());
                break;
            }
        }
        
        let script_path_str = match script_path_str {
            Some(path) => path,
            None => {
                eprintln!("Python script not found at expected locations");
                return Err("Python script not found".into());
            }
        };
        
        // Determine Python command (python3 or python)
        let python_cmd = if cfg!(windows) { "python".to_string() } else { "/usr/local/bin/python3".to_string() };
        
        // Clone for task
        let keyword_owned = keyword.clone();
        let threshold_str = threshold.to_string();
        
        // Execute the Python script in a separate thread to avoid blocking
        let output = task::spawn_blocking(move || {
            Command::new(python_cmd)
                .arg(&script_path_str)
                .arg(&db_path)
                .arg("predict")
                .arg(&keyword_owned)
                .arg(&threshold_str)
                .output()
        }).await
        .map_err(|e| format!("Task spawn error: {}", e))?
        .map_err(|e| format!("Command execution error: {}", e))?;
        
        if !output.status.success() {
            let error_message = String::from_utf8_lossy(&output.stderr);
            eprintln!("Python script failed: {}", error_message);
            return Err(format!("Python script execution failed: {}", error_message));
        }
        
        // Parse the output
        let response = String::from_utf8_lossy(&output.stdout);
        match serde_json::from_str::<TrendPrediction>(&response) {
            Ok(prediction) => Ok(prediction),
            Err(e) => {
                eprintln!("Failed to parse Python response: {}", e);
                Err(format!("Failed to parse Python response: {}", e))
            }
        }
    }
    
    // Get predictions from the database
    pub async fn get_saved_predictions(&self, limit: usize, include_past: bool) -> Result<Vec<TrendPrediction>, String> {
        let db_path = self.db_path.lock().unwrap().clone();
        
        // Find the Python script - Use owned values
        let script_paths = vec![
            "python_scripts/trend_spike_predictor.py".to_string(),
            "src/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/python_scripts/trend_spike_predictor.py".to_string(),
            "src-tauri/src/python_scripts/trend_spike_predictor.py".to_string(),
        ];
        
        let mut script_path_str = None;
        for path_str in &script_paths {
            if Path::new(path_str).exists() {
                script_path_str = Some(path_str.clone());
                break;
            }
        }
        
        let script_path_str = match script_path_str {
            Some(path) => path,
            None => {
                eprintln!("Python script not found at expected locations");
                return Err("Python script not found".into());
            }
        };
        
        // Determine Python command (python3 or python)
        let python_cmd = if cfg!(windows) { "python".to_string() } else { "/usr/local/bin/python3".to_string() };
        
        let limit_str = limit.to_string();
        let include_past_str = include_past.to_string();
        
        // Execute the Python script in a separate thread to avoid blocking
        let output = task::spawn_blocking(move || {
            Command::new(python_cmd)
                .arg(&script_path_str)
                .arg(&db_path)
                .arg("predictions")
                .arg(&limit_str)
                .arg(&include_past_str)
                .output()
        }).await
        .map_err(|e| format!("Task spawn error: {}", e))?
        .map_err(|e| format!("Command execution error: {}", e))?;
        
        if !output.status.success() {
            let error_message = String::from_utf8_lossy(&output.stderr);
            eprintln!("Python script failed: {}", error_message);
            return Err(format!("Python script execution failed: {}", error_message));
        }
        
        // Parse the output
        let response = String::from_utf8_lossy(&output.stdout);
        match serde_json::from_str::<Vec<TrendPrediction>>(&response) {
            Ok(predictions) => Ok(predictions),
            Err(e) => {
                eprintln!("Failed to parse Python response: {}", e);
                Err(format!("Failed to parse Python response: {}", e))
            }
        }
    }
}

// Function to monitor keywords using the Python script - Takes owned values to avoid lifetime issues
async fn monitor_keywords(
    service: &Arc<TrendSpikeService>,
    db_path: String,
    keywords: Vec<String>,
    threshold: f64,
    category: Option<&str>
) -> Result<(), Box<dyn Error + Send + Sync>> {
    // Get the location of the Python script - Use owned values
    let script_paths = vec![
        "python_scripts/trend_spike_predictor.py".to_string(),
        "src/python_scripts/trend_spike_predictor.py".to_string(),
        "src-tauri/python_scripts/trend_spike_predictor.py".to_string(),
        "src-tauri/src/python_scripts/trend_spike_predictor.py".to_string(),
    ];
    
    let mut script_path_str = None;
    for path_str in &script_paths {
        if Path::new(path_str).exists() {
            script_path_str = Some(path_str.clone());
            break;
        }
    }
    
    let script_path_str = match script_path_str {
        Some(path) => path,
        None => {
            eprintln!("Python script not found at expected locations");
            return Err("Python script not found".into());
        }
    };
    
    // Build command arguments
    let keywords_str = keywords.join(",");
    let threshold_str = threshold.to_string();
    
    // Determine Python command (python3 or python)
    let python_cmd = if cfg!(windows) { "python".to_string() } else { "/usr/local/bin/python3".to_string() };
    
    // Clone category if it exists
    let category_string = category.map(|c| c.to_string());
    
    // Execute the Python script in a separate thread to avoid blocking
    let output = task::spawn_blocking(move || {
        Command::new(python_cmd)
            .arg(&script_path_str)
            .arg(&db_path)
            .arg("monitor")
            .arg(&keywords_str)
            .arg(&threshold_str)
            .output()
    }).await??;
    
    if !output.status.success() {
        let error_message = String::from_utf8_lossy(&output.stderr);
        eprintln!("Python script failed: {}", error_message);
        return Err(format!("Python script execution failed: {}", error_message).into());
    }
    
    // Parse the output
    let response = String::from_utf8_lossy(&output.stdout);
    match serde_json::from_str::<Vec<TrendPrediction>>(&response) {
        Ok(predictions) => {
            if !predictions.is_empty() {
                println!("Found {} potential trend spikes for keywords: {}", 
                         predictions.len(), 
                         predictions.iter().map(|p| p.keyword.clone()).collect::<Vec<_>>().join(", "));
                
                // Add context about the category if provided
                let predictions_with_context: Vec<TrendPrediction> = predictions.into_iter()
                    .map(|mut pred| {
                        // Add the category as region if provided
                        if let Some(cat) = &category_string {
                            pred.region = Some(cat.clone());
                        }
                        pred
                    })
                    .collect();
                
                // Update the predictions in the service
                service.update_predictions(predictions_with_context);
            }
            Ok(())
        },
        Err(e) => {
            eprintln!("Failed to parse Python response: {}", e);
            Err(format!("Failed to parse Python response: {}", e).into())
        }
    }
}

// Register Tauri commands
#[tauri::command]
pub async fn get_trend_predictions(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    category: Option<String>
) -> Result<Vec<TrendPrediction>, String> {
    let category_ref = category.as_deref();
    Ok(state.get_predictions(category_ref))
}

#[tauri::command]
pub async fn get_saved_trend_predictions(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    limit: Option<usize>,
    include_past: Option<bool>
) -> Result<Vec<TrendPrediction>, String> {
    state.get_saved_predictions(limit.unwrap_or(10), include_past.unwrap_or(false)).await
}

#[tauri::command]
pub async fn predict_trend_spike(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    keyword: String
) -> Result<TrendPrediction, String> {
    state.predict_spike(keyword).await
}

#[tauri::command]
pub async fn add_trend_spike_keyword(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    category: String,
    keyword: String
) -> Result<bool, String> {
    Ok(state.add_keyword(&category, &keyword))
}

#[tauri::command]
pub async fn remove_trend_spike_keyword(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    category: String,
    keyword: String
) -> Result<bool, String> {
    Ok(state.remove_keyword(&category, &keyword))
}

#[tauri::command]
pub async fn start_trend_spike_monitoring(
    state: tauri::State<'_, Arc<TrendSpikeService>>
) -> Result<bool, String> {
    Ok(state.start_monitoring())
}

#[tauri::command]
pub async fn stop_trend_spike_monitoring(
    state: tauri::State<'_, Arc<TrendSpikeService>>
) -> Result<bool, String> {
    Ok(state.stop_monitoring())
}

#[tauri::command]
pub async fn get_trend_spike_monitored_keywords(
    state: tauri::State<'_, Arc<TrendSpikeService>>
) -> Result<HashMap<String, Vec<String>>, String> {
    Ok(state.get_monitored_keywords())
}

#[tauri::command]
pub async fn set_trend_spike_threshold(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    threshold: f64
) -> Result<(), String> {
    state.set_threshold(threshold);
    Ok(())
}

#[tauri::command]
pub async fn set_trend_spike_interval(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    minutes: u64
) -> Result<(), String> {
    state.set_monitor_interval(minutes);
    Ok(())
}

#[tauri::command]
pub async fn is_trend_spike_monitoring_active(
    state: tauri::State<'_, Arc<TrendSpikeService>>
) -> Result<bool, String> {
    Ok(state.is_monitoring_active())
}

#[tauri::command]
pub async fn get_trend_spike_sources(
    state: tauri::State<'_, Arc<TrendSpikeService>>,
    keyword: String
) -> Result<serde_json::Value, String> {
    state.get_signal_sources(keyword).await
}

// Initialize default keywords to monitor
pub fn init_default_keywords(service: &Arc<TrendSpikeService>) {
    // Add some default categories and keywords
    let defaults = [
        ("crypto", vec!["bitcoin", "ethereum", "solana"]),
        ("ai", vec!["deepseek", "claude", "gemini", "llama"]),
        ("tech", vec!["apple", "microsoft", "google", "meta"]),
    ];
    
    for (category, keywords) in defaults.iter() {
        for keyword in keywords {
            service.add_keyword(category, keyword);
        }
    }
}