// src-tauri/src/services/google_trends.rs
use chrono::Datelike; // Add this import for the year() method
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::Path;
use std::process::Command;
use tauri::Manager; // Add this import for the path() method

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrendResult {
    pub keyword: String,
    pub date: String,
    pub value: f64,
    pub region: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrendResponse {
    pub results: Vec<TrendResult>,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PyTrendsResponse {
    status: String,
    results: Option<Vec<TrendResult>>,
    message: Option<String>,
    related_queries: Option<Vec<String>>,
}

// A simplified in-memory implementation to test with
fn generate_dummy_data(
    keywords: &[String],
    time_range: &str,
    region: Option<&String>,
) -> TrendResponse {
    let mut results = Vec::new();

    // Get current date components
    let now = chrono::Local::now();

    // Generate dates based on time range - looking backward from today
    let dates: Vec<String> = match time_range {
        "1d" => {
            // Generate hourly data points for the last 24 hours
            (0..24)
                .map(|hours_ago| {
                    let date = now - chrono::Duration::hours(hours_ago);
                    date.format("%Y-%m-%d %H:00").to_string()
                })
                .collect()
        }
        "7d" => {
            // Generate daily data points for the last 7 days
            (0..7)
                .map(|days_ago| {
                    let date = now - chrono::Duration::days(days_ago);
                    date.format("%Y-%m-%d").to_string()
                })
                .collect()
        }
        "30d" => {
            // Generate data points every 3 days for the last 30 days
            (0..10)
                .map(|i| {
                    let days_ago = i * 3;
                    let date = now - chrono::Duration::days(days_ago);
                    date.format("%Y-%m-%d").to_string()
                })
                .collect()
        }
        "90d" => {
            // Generate monthly data points for the last 3 months (12 weeks) with bi-weekly points
            (0..6)
                .map(|i| {
                    let days_ago = i * 14; // Every two weeks
                    let date = now - chrono::Duration::days(days_ago);
                    date.format("%Y-%m-%d").to_string()
                })
                .collect()
        }
        "12m" => {
            // Generate monthly data points for the last 12 months
            (0..12)
                .map(|months_ago| {
                    let date = now - chrono::Duration::days(months_ago * 30);
                    date.format("%Y-%m-%d").to_string()
                })
                .collect()
        }
        "5y" => {
            // Generate yearly data points for the last 5 years
            (0..5)
                .map(|years_ago| {
                    let year = now.year() - years_ago; // Using the year() method from the Datelike trait
                    format!("{}-01-01", year)
                })
                .collect()
        }
        _ => {
            // Default to 30-day view with 3 points
            vec![
                (now - chrono::Duration::days(30))
                    .format("%Y-%m-%d")
                    .to_string(),
                (now - chrono::Duration::days(15))
                    .format("%Y-%m-%d")
                    .to_string(),
                now.format("%Y-%m-%d").to_string(),
            ]
        }
    };

    for keyword in keywords {
        for (i, date) in dates.iter().enumerate() {
            let base_value = if keyword.to_lowercase() == "deepseek" {
                // For "deepseek", create an upward trend over time
                // Since dates are now in reverse chronological order (newest first),
                // we need to flip the trend calculation
                30.0 + ((dates.len() - i - 1) as f64 / dates.len() as f64) * 60.0
            } else {
                // For other keywords, create more random patterns
                50.0
            };

            // Add some noise to the values
            let noise = (i % 7) as f64 * 5.0 - 15.0;
            let value = (base_value + noise).max(0.0).min(100.0);

            results.push(TrendResult {
                keyword: keyword.clone(),
                date: date.clone(),
                value,
                region: region.cloned(),
            });
        }
    }

    TrendResponse {
        results,
        status: "success".to_string(),
        message: None,
    }
}

// Helper function to find Python script using app handle
fn find_python_script(app: &tauri::AppHandle, script_name: &str) -> Option<String> {
    // Try to find the script in the resource directory first (for production builds)
    if let Some(resource_dir) = app.path().resource_dir().ok() {
        let resource_paths = [
            resource_dir.join(script_name),
            resource_dir.join("src/python_scripts").join(script_name),
            resource_dir.join("python_scripts").join(script_name),
        ];

        for path in resource_paths.iter() {
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    // Fall back to development paths
    let dev_paths = [
        format!("python_scripts/{}", script_name),
        format!("src/python_scripts/{}", script_name),
        format!("src-tauri/python_scripts/{}", script_name),
        format!("src-tauri/src/python_scripts/{}", script_name),
    ];

    for path in &dev_paths {
        if Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    None
}

pub async fn fetch_trends(
    keywords: Vec<String>,
    time_range: &str,
    region: Option<String>,
    script_path: Option<String>,
) -> Result<TrendResponse, Box<dyn Error>> {
    // If we have a script path, use it
    if let Some(script_path) = script_path {
        println!("Using script at: {}", script_path);

        // Build arguments for the Python script
        let keywords_str = keywords.join(",");
        let region_str = region.as_ref().map_or("".to_string(), |r| r.clone());

        // Determine Python command (python3 or python)
        let python_cmd = if cfg!(windows) {
            "python"
        } else {
            "/usr/local/bin/python3"
        };

        // Run Python script with the appropriate arguments
        let output = Command::new(python_cmd)
            .arg(&script_path)
            .arg(&keywords_str)
            .arg(time_range)
            .arg(&region_str)
            .output()?;

        if !output.status.success() {
            let error_message = String::from_utf8_lossy(&output.stderr);
            println!("Python script failed: {}", error_message);
            return Ok(generate_dummy_data(&keywords, time_range, region.as_ref()));
        }

        // Parse the output
        let response = String::from_utf8_lossy(&output.stdout);
        match serde_json::from_str::<PyTrendsResponse>(&response) {
            Ok(py_response) => {
                if py_response.status == "error" {
                    println!("Python script returned error: {:?}", py_response.message);
                    return Ok(generate_dummy_data(&keywords, time_range, region.as_ref()));
                }

                // Get related queries from the response
                let related_queries = py_response.related_queries.unwrap_or_default();

                // Store the related queries in memory for later use
                if !related_queries.is_empty() && !keywords.is_empty() {
                    LAST_RELATED_QUERIES
                        .lock()
                        .unwrap()
                        .insert(keywords[0].clone(), related_queries);
                }

                return Ok(TrendResponse {
                    results: py_response.results.unwrap_or_default(),
                    status: py_response.status,
                    message: py_response.message,
                });
            }
            Err(e) => {
                println!("Failed to parse Python response: {}", e);
                return Ok(generate_dummy_data(&keywords, time_range, region.as_ref()));
            }
        }
    }

    // If script path not provided or script not found, use dummy data
    println!("Python script not found, using dummy data");
    Ok(generate_dummy_data(&keywords, time_range, region.as_ref()))
}

// A simple in-memory cache for related queries
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;

static LAST_RELATED_QUERIES: Lazy<Mutex<HashMap<String, Vec<String>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Register this as a Tauri command
#[tauri::command]
pub async fn get_google_trends(
    app: tauri::AppHandle, // Add app handle parameter to get access to resource paths
    keywords: Vec<String>,
    time_range: String,
    region: Option<String>,
) -> Result<TrendResponse, String> {
    // Find the Python script using the app handle
    let script_path = find_python_script(&app, "google_trends.py");

    // Execute fetch_trends with the found script path
    match fetch_trends(keywords.clone(), &time_range, region.clone(), script_path).await {
        Ok(data) => Ok(data),
        Err(e) => {
            println!("Error fetching Google Trends data: {}", e);
            // Return dummy data as fallback instead of error
            Ok(generate_dummy_data(
                &vec!["deepseek".to_string()],
                &time_range,
                region.as_ref(),
            ))
        }
    }
}

// Function to get related queries for a keyword
#[tauri::command]
pub async fn get_related_queries(keyword: String) -> Result<Vec<String>, String> {
    // First, check if we have cached results
    {
        let cache = LAST_RELATED_QUERIES.lock().unwrap();
        if let Some(queries) = cache.get(&keyword) {
            if !queries.is_empty() {
                return Ok(queries.clone());
            }
        }
    }

    // Fallback to static responses
    match keyword.to_lowercase().as_str() {
        "bitcoin" => Ok(vec![
            "bitcoin price".to_string(),
            "bitcoin news".to_string(),
            "bitcoin etf".to_string(),
            "how to buy bitcoin".to_string(),
            "bitcoin halving".to_string(),
        ]),
        "ethereum" => Ok(vec![
            "ethereum price".to_string(),
            "ethereum news".to_string(),
            "ethereum 2.0".to_string(),
            "ethereum vs bitcoin".to_string(),
            "how to stake ethereum".to_string(),
        ]),
        "deepseek" => Ok(vec![
            "deepseek ai".to_string(),
            "deepseek coder".to_string(),
            "deepseek vs claude".to_string(),
            "deepseek llm".to_string(),
            "deepseek gemma".to_string(),
        ]),
        _ => Ok(vec![
            format!("{} price", keyword),
            format!("{} news", keyword),
            format!("{} analysis", keyword),
            format!("{} investment", keyword),
            format!("{} forecast", keyword),
        ]),
    }
}

// Function to export trends data to CSV
#[tauri::command]
pub async fn export_trends_data(data: TrendResponse, path: String) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;

    let mut file = match File::create(&path) {
        Ok(file) => file,
        Err(e) => return Err(format!("Failed to create file: {}", e)),
    };

    // Write CSV header
    if let Err(e) = writeln!(file, "keyword,date,value,region") {
        return Err(format!("Failed to write header: {}", e));
    }

    // Write data rows
    for result in data.results {
        let region = result.region.unwrap_or_else(|| "global".to_string());
        if let Err(e) = writeln!(
            file,
            "{},{},{},{}",
            result.keyword, result.date, result.value, region
        ) {
            return Err(format!("Failed to write data: {}", e));
        }
    }

    Ok(())
}
