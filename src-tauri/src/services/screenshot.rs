// src-tauri/src/services/screenshot.rs
use chrono::Local;
use dirs::picture_dir;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Window;
use base64::{Engine as _, engine::general_purpose};
use std::io::Write;

#[tauri::command]
pub async fn take_screenshot(window: Window) -> Result<String, String> {
    // Create directory structure
    let screenshots_dir = create_screenshots_directory()?;
    
    // Generate filename based on current timestamp
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("pieverse_screenshot_{}.png", timestamp);
    let filepath = screenshots_dir.join(filename);

    // Convert filepath to string
    let filepath_str = filepath.to_string_lossy().to_string();
    
    // Take screenshot using the external "screencapture" command
    Command::new("screencapture")
        .arg("-i")
        .arg(&filepath_str)
        .output()
        .map_err(|e| format!("Failed to capture screenshot: {}", e))?;
    
    // Return the full path to the saved screenshot
    Ok(filepath_str)
}

#[tauri::command]
pub async fn take_screenshot_to_clipboard(window: Window) -> Result<bool, String> {
    // On macOS, try multiple approaches to capture the window
    #[cfg(target_os = "macos")]
    {
        // Debug: Log that we're starting the screenshot process
        println!("Starting screenshot process for app window only...");
        
        // Simple, direct approach with system sound - fastest method
        let capture_result = Command::new("screencapture")
            .args([
                "-c",   // Copy to clipboard directly
                "-x",   // Use system screenshot sound (the standard one)
                "-w"    // Window mode (captures frontmost window automatically)
            ])
            .output();
            
        if let Ok(output) = capture_result {
            if output.status.success() {
                println!("Direct window capture was successful");
                return Ok(true);
            }
        }
        
        // If that fails, try one more simple approach as backup
        println!("Trying backup approach...");
        let backup_result = Command::new("screencapture")
            .args([
                "-c",   // Copy to clipboard 
                "-x"    // System screenshot sound
            ])
            .output();
            
        if let Ok(output) = backup_result {
            if output.status.success() {
                println!("Backup capture successful");
                return Ok(true);
            }
        }
        
        // If really everything failed
        return Err("Failed to capture screenshot. See console for details.".into());
    }

    // On Windows, try multiple approaches to capture the window
    #[cfg(target_os = "windows")]
    {
        // Create a temporary file
        let temp_dir = std::env::temp_dir();
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let temp_file = temp_dir.join(format!("pieverse_temp_screenshot_{}.png", timestamp));
        let temp_path = temp_file.to_string_lossy().to_string();
        
        // Method 1: Try to capture the active window using Alt+PrintScreen
        Command::new("powershell")
            .args([
                "-Command", 
                &format!(r#"
                Add-Type -AssemblyName System.Windows.Forms
                Add-Type -AssemblyName System.Drawing
                
                # Press Alt+PrintScreen to capture active window
                [System.Windows.Forms.SendKeys]::SendWait("%{PRTSC}")
                
                # Wait for clipboard to be updated
                Start-Sleep -Milliseconds 500
                
                # Get the image from clipboard
                $img = [System.Windows.Forms.Clipboard]::GetImage()
                
                # Save to file (as backup)
                if ($img -ne $null) {{
                    $img.Save("{}")
                    return $true
                }}
                return $false
                "#, temp_path.replace("\\", "\\\\"))
            ])
            .output()
            .map_err(|e| format!("Failed to capture window to clipboard: {}", e))?;
        
        // Clean up the temporary file
        let _ = fs::remove_file(temp_file);
        
        return Ok(true);
    }

    // On Linux, try multiple approaches
    #[cfg(target_os = "linux")]
    {
        // Create a temporary file
        let temp_dir = std::env::temp_dir();
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let temp_file = temp_dir.join(format!("pieverse_temp_screenshot_{}.png", timestamp));
        let temp_path = temp_file.to_string_lossy().to_string();
        
        // Try method 1: use gnome-screenshot to capture the current window
        let result = Command::new("gnome-screenshot")
            .args([
                "--window",         // Capture active window
                "--file", &temp_path  // Save to temp file
            ])
            .output();
            
        if result.is_ok() {
            // Copy to clipboard using xclip
            let clip_result = Command::new("xclip")
                .args(["-selection", "clipboard", "-t", "image/png", "-i", &temp_path])
                .output();
                
            if clip_result.is_ok() {
                // Clean up the temporary file
                let _ = fs::remove_file(temp_file);
                return Ok(true);
            }
        }
        
        // Try method 2: Use xdotool to identify active window and import to capture
        let result = Command::new("xdotool")
            .args(["getactivewindow"])
            .output();
            
        if let Ok(output) = result {
            let window_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            if !window_id.is_empty() {
                // Take screenshot of the specific window
                let import_result = Command::new("import")
                    .args(["-window", &window_id, &temp_path])
                    .output();
                    
                if import_result.is_ok() {
                    // Copy to clipboard using xclip
                    let clip_result = Command::new("xclip")
                        .args(["-selection", "clipboard", "-t", "image/png", "-i", &temp_path])
                        .output();
                        
                    if clip_result.is_ok() {
                        // Clean up the temporary file
                        let _ = fs::remove_file(temp_file);
                        return Ok(true);
                    }
                }
            }
        }
        
        // Try method 3: Fallback to scrot for entire screen
        let result = Command::new("scrot")
            .args([&temp_path])
            .output();
            
        if result.is_ok() {
            // Copy to clipboard using xclip
            let clip_result = Command::new("xclip")
                .args(["-selection", "clipboard", "-t", "image/png", "-i", &temp_path])
                .output();
                
            if clip_result.is_ok() {
                // Clean up the temporary file
                let _ = fs::remove_file(temp_file);
                return Ok(true);
            }
        }
        
        return Err("Could not capture application window on Linux".into());
    }

    // Fallback for unsupported platforms
    #[allow(unreachable_code)]
    Err("Screenshot to clipboard is not supported on this platform".into())
}

// New function to save a base64-encoded image from the frontend
#[tauri::command]
pub async fn save_clipboard_image(image_base64: String) -> Result<String, String> {
    // Create screenshots directory
    let screenshots_dir = create_screenshots_directory()?;
    
    // Generate filename based on current timestamp
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("pieverse_clipboard_{}.png", timestamp);
    let filepath = screenshots_dir.join(filename);
    
    // Decode the base64 image
    let image_data = match general_purpose::STANDARD.decode(&image_base64) {
        Ok(data) => {
            println!("Successfully decoded clipboard image, size: {} bytes", data.len());
            data
        },
        Err(e) => {
            println!("Failed to decode base64 image: {}", e);
            return Err(format!("Failed to decode base64 image: {}", e));
        }
    };
    
    // Save the image to file
    match fs::write(&filepath, &image_data) {
        Ok(_) => {
            println!("Clipboard image saved to: {:?}", filepath);
            Ok(filepath.to_string_lossy().to_string())
        },
        Err(e) => {
            println!("Failed to write image file: {}", e);
            Err(format!("Failed to write image file: {}", e))
        }
    }
}

fn create_screenshots_directory() -> Result<PathBuf, String> {
    // Get user's Pictures directory
    let pictures = picture_dir().ok_or_else(|| "Could not determine Pictures directory".to_string())?;
    
    // Create a Screenshots directory inside the Pictures folder
    let screenshots_dir = pictures.join("PieverseScreenshots");
    
    // Create directory if it doesn't exist
    fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots directory: {}", e))?;
    
    Ok(screenshots_dir)
}