use reqwest::Client;
use serde_json::Value;
use tauri::command;

#[command]
pub async fn fetch_chrome_targets(port: u16) -> Result<Value, String> {
    let client = Client::new();
    let url = format!("http://localhost:{}/json", port);
    
    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<Value>().await {
                    Ok(data) => Ok(data),
                    Err(e) => Err(format!("Failed to parse response: {}", e))
                }
            } else {
                Err(format!("Failed to fetch Chrome targets: Status {}", response.status()))
            }
        },
        Err(e) => Err(format!("Failed to connect to Chrome: {}", e))
    }
}