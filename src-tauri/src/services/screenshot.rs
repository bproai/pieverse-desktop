// src-tauri/src/services/screenshot.rs
use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use dirs::picture_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::Window;

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
pub async fn take_screenshot_to_clipboard(_window: Window) -> Result<bool, String> {
    // On macOS, try multiple approaches to capture the window
    #[cfg(target_os = "macos")]
    {
        // Debug: Log that we're starting the screenshot process
        println!("Starting screenshot process for app window only...");

        // Simple, direct approach with system sound - fastest method
        let capture_result = Command::new("screencapture")
            .args([
                "-c", // Copy to clipboard directly
                "-x", // Use system screenshot sound (the standard one)
                "-w", // Window mode (captures frontmost window automatically)
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
                "-c", // Copy to clipboard
                "-x", // System screenshot sound
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
                &format!(
                    r#"
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
                "#,
                    temp_path.replace("\\", "\\\\")
                ),
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
                "--window", // Capture active window
                "--file", &temp_path, // Save to temp file
            ])
            .output();

        if result.is_ok() {
            // Copy to clipboard using xclip
            let clip_result = Command::new("xclip")
                .args([
                    "-selection",
                    "clipboard",
                    "-t",
                    "image/png",
                    "-i",
                    &temp_path,
                ])
                .output();

            if clip_result.is_ok() {
                // Clean up the temporary file
                let _ = fs::remove_file(temp_file);
                return Ok(true);
            }
        }

        // Try method 2: Use xdotool to identify active window and import to capture
        let result = Command::new("xdotool").args(["getactivewindow"]).output();

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
                        .args([
                            "-selection",
                            "clipboard",
                            "-t",
                            "image/png",
                            "-i",
                            &temp_path,
                        ])
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
        let result = Command::new("scrot").args([&temp_path]).output();

        if result.is_ok() {
            // Copy to clipboard using xclip
            let clip_result = Command::new("xclip")
                .args([
                    "-selection",
                    "clipboard",
                    "-t",
                    "image/png",
                    "-i",
                    &temp_path,
                ])
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
            println!(
                "Successfully decoded clipboard image, size: {} bytes",
                data.len()
            );
            data
        }
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
        }
        Err(e) => {
            println!("Failed to write image file: {}", e);
            Err(format!("Failed to write image file: {}", e))
        }
    }
}

fn create_screenshots_directory() -> Result<PathBuf, String> {
    // Get user's Pictures directory
    let pictures =
        picture_dir().ok_or_else(|| "Could not determine Pictures directory".to_string())?;

    // Create a Screenshots directory inside the Pictures folder
    let screenshots_dir = pictures.join("PieverseScreenshots");

    // Create directory if it doesn't exist
    fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots directory: {}", e))?;

    Ok(screenshots_dir)
}


// Add this at the bottom of your screenshot.rs file
use tauri_plugin_dialog::DialogExt;
use std::path::Path;

// Simple function to download images from the HTML renderer
#[tauri::command]
pub async fn download_image(app_handle: tauri::AppHandle, image_data: String, filename: Option<String>) -> Result<String, String> {
    // Determine image type and get base64 data
    let (mime_type, base64_data) = if image_data.starts_with("data:image/") {
        // Extract MIME type from data URL
        let parts: Vec<&str> = image_data.split(',').collect();
        if parts.len() != 2 {
            return Err("Invalid data URL format".to_string());
        }
        
        // Get MIME type (e.g., "image/png;base64")
        let mime_info = parts[0].replace("data:", "");
        let mime_parts: Vec<&str> = mime_info.split(';').collect();
        if mime_parts.is_empty() {
            return Err("Invalid MIME type in data URL".to_string());
        }
        
        // Extract clean MIME type (e.g., "image/png")
        let mime = mime_parts[0];
        (mime.to_string(), parts[1].to_string())
    } else {
        // Assume it's already base64 encoded and default to PNG
        ("image/png".to_string(), image_data)
    };
    
    // Determine file extension and filter name from MIME type
    let (extension, filter_name) = match mime_type.as_str() {
        "image/jpeg" | "image/jpg" => ("jpg", "JPEG Image (*.jpg)"),
        "image/png" => ("png", "PNG Image (*.png)"),
        "image/gif" => ("gif", "GIF Image (*.gif)"),
        "image/webp" => ("webp", "WebP Image (*.webp)"),
        "image/svg+xml" => ("svg", "SVG Image (*.svg)"),
        _ => ("png", "PNG Image (*.png)"), // Default to PNG for unknown types
    };
    
    // Generate default filename if none provided
    let default_filename = if let Some(name) = filename {
        // If filename doesn't have an extension, add the correct one
        if !name.contains('.') {
            format!("{}.{}", name, extension)
        } else {
            name
        }
    } else {
        // Create a timestamped filename with the correct extension
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        format!("pieverse_image_{}.{}", timestamp, extension)
    };
    
    // Use Tauri 2 dialog API with the correct extension filter
    let save_path = app_handle
        .dialog()
        .file()
        .add_filter(filter_name, &[extension]) // Use descriptive filter name
        .set_file_name(&default_filename)
        .blocking_save_file();
    
    if let Some(path) = save_path {
        // Convert FilePath to a regular String path
        let path_str = path.to_string();
        
        // Decode the base64 data
        let image_bytes = match general_purpose::STANDARD.decode(&base64_data) {
            Ok(data) => data,
            Err(e) => return Err(format!("Failed to decode image data: {}", e))
        };
        
        // Save the file using the string path
        match fs::write(&path_str, &image_bytes) {
            Ok(_) => Ok(path_str),
            Err(e) => Err(format!("Failed to save image: {}", e))
        }
    } else {
        // User cancelled the save dialog
        Err("Save operation cancelled".to_string())
    }
}