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
                    Err(e) => Err(format!("Failed to parse response: {}", e)),
                }
            } else {
                Err(format!(
                    "Failed to fetch Chrome targets: Status {}",
                    response.status()
                ))
            }
        }
        Err(e) => Err(format!("Failed to connect to Chrome: {}", e)),
    }
}

// Only include this function in debug builds
#[command]
pub fn open_chrome_in_terminal() -> Result<(), String> {
    // Use AppleScript to open Terminal and run Chrome with remote debugging enabled
    let chrome_script = r#"
        tell application "Terminal"
            do script "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
        end tell
    "#;
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(chrome_script)
        .spawn()
        .map_err(|e| e.to_string())?;

    // Also launch a visible terminal to run npm run bridge at project root
    let bridge_script = r#"
        tell application "Terminal"
            activate
            do script "cd $(osascript -e 'POSIX path of (choose folder with prompt \"Select project root directory:\")') && npm run bridge"
        end tell
    "#;
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(bridge_script)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
