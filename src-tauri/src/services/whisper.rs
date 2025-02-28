use serde::{Deserialize, Serialize};
use tokio::fs;
use base64::Engine;
use reqwest::multipart::{Form, Part};
use std::time::Instant;

// Helper function to print a boxed message for important logs
fn print_boxed(message: &str) {
    let line = "━".repeat(message.len() + 4);
    println!("┏{}┓", line);
    println!("┃  {}  ┃", message);
    println!("┗{}┛", line);
}

// Helper function to print a section title
fn print_section(title: &str) {
    println!("\n{}", "=".repeat(50));
    println!("  {}", title);
    println!("{}\n", "=".repeat(50));
}

// Helper function to print json-like output
fn print_json(key: &str, value: &str) {
    println!("  \"{}\": \"{}\"", key, value);
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WhisperResponse {
    pub text: String,
}

#[tauri::command]
pub async fn transcribe_audio(audio_base64: String, api_key: String) -> Result<String, String> {
    println!("Starting audio transcription...");
    let start_time = Instant::now();
    
    // Validate API key
    if api_key.trim().is_empty() {
        return Err("API key is required".into());
    }
    
    // Decode base64 audio
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(audio_base64) {
        Ok(data) => {
            println!("Successfully decoded base64 data, size: {} bytes", data.len());
            data
        },
        Err(e) => {
            println!("Failed to decode base64: {}", e);
            return Err(format!("Failed to decode base64: {}", e));
        }
    };
    
    // If audio data is too small, it's probably invalid
    if audio_data.len() < 100 {
        println!("Audio data too small: {} bytes", audio_data.len());
        return Err("Audio data too small or invalid".into());
    }

    // Save to a temporary file
    let temp_path = std::env::temp_dir().join("audio_recording.mp3");
    match fs::write(&temp_path, &audio_data).await {
        Ok(_) => println!("Temp file written to: {:?}", temp_path),
        Err(e) => {
            println!("Failed to write temp file: {}", e);
            return Err(format!("Failed to write temp file: {}", e));
        }
    }

    // Try multiple MIME types if the first one fails
    let mime_types = vec![
        "audio/mp3",
        "audio/mpeg",
        "audio/wav",
        "audio/webm"
    ];
    
    let mut last_error = String::new();
    
    for mime_type in mime_types {
        println!("Trying MIME type: {}", mime_type);
        
        // Build multipart form
        let file_part = match Part::bytes(audio_data.clone())
            .file_name("audio_recording.mp3")
            .mime_str(mime_type) {
                Ok(part) => part,
                Err(e) => {
                    println!("Failed to create part with MIME {}: {}", mime_type, e);
                    continue;
                }
            };
        
        let form = Form::new()
            .text("model", "whisper-1")
            .part("file", file_part);
        
        let client = reqwest::Client::new();
        match client.post("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .send()
            .await {
                Ok(response) => {
                    // Check status
                    let status = response.status();
                    if status.is_success() {
                        // Parse successful response
                        match response.json::<WhisperResponse>().await {
                            Ok(whisper_response) => {
                                // Clean up temp file
                                let _ = fs::remove_file(&temp_path).await;
                                let duration = start_time.elapsed();
                                
                                print_section("TRANSCRIPTION RESULT");
                                print_json("text", &whisper_response.text);
                                print_json("length", &whisper_response.text.len().to_string());
                                print_json("duration", &format!("{:?}", duration));
                                println!(); // Add a newline for better readability
                                
                                return Ok(whisper_response.text);
                            },
                            Err(e) => {
                                last_error = format!("Failed to parse API response: {}", e);
                                println!("{}", last_error);
                                continue;
                            }
                        }
                    } else {
                        // Handle error response
                        match response.text().await {
                            Ok(error_text) => {
                                last_error = format!("API request failed with status {}: {}", status, error_text);
                                println!("{}", last_error);
                                
                                // If it's a 400 Bad Request, it might be a format issue, so try the next format
                                if status.as_u16() != 400 {
                                    return Err(last_error);
                                }
                                
                                continue;
                            },
                            Err(e) => {
                                last_error = format!("Failed to get error details: {}", e);
                                println!("{}", last_error);
                                continue;
                            }
                        }
                    }
                },
                Err(e) => {
                    last_error = format!("Request failed: {}", e);
                    println!("{}", last_error);
                    continue;
                }
            }
    }
    
    // If we got here, all MIME types failed
    // Clean up temp file
    let _ = fs::remove_file(&temp_path).await;
    
    Err(format!("All audio format attempts failed. Last error: {}", last_error))
}

#[tauri::command]
pub async fn play_last_recording() -> Result<String, String> {
    // Check if the temp file exists
    let temp_path = std::env::temp_dir().join("audio_recording.mp3");
    
    match fs::metadata(&temp_path).await {
        Ok(_) => {
            // File exists, return its path
            println!("Found last recording at {:?}", temp_path);
            return Ok(temp_path.to_string_lossy().to_string());
        },
        Err(e) => {
            println!("No recording found: {}", e);
            return Err("No recent recording found".to_string());
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Serialize, Deserialize, Debug)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[tauri::command]
pub async fn openai_4o_mini(prompt: String, api_key: String) -> Result<String, String> {
    print_section("OPENAI 4O-MINI REQUEST");
    println!("Processing prompt: {} characters", prompt.len());
    let start_time = Instant::now();
    
    // Validate API key
    if api_key.trim().is_empty() {
        return Err("API key is required".into());
    }
    
    // Create the request body
    let messages = vec![
        ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }
    ];
    
    let request_body = ChatRequest {
        model: "gpt-4o-mini".to_string(), // Using the 4o-mini model
        messages,
    };
    
    // Send the request to OpenAI API
    let client = reqwest::Client::new();
    match client.post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await {
            Ok(response) => {
                // Check status
                let status = response.status();
                if status.is_success() {
                    // Parse successful response
                    match response.json::<ChatResponse>().await {
                        Ok(chat_response) => {
                            if !chat_response.choices.is_empty() {
                                let answer = &chat_response.choices[0].message.content;
                                let duration = start_time.elapsed();
                                
                                print_section("OPENAI 4O-MINI RESPONSE");
                                print_json("response_length", &answer.len().to_string());
                                print_json("duration", &format!("{:?}", duration));
                                println!(); // Add a newline for better readability
                                
                                return Ok(answer.clone());
                            } else {
                                return Err("No response choices returned".into());
                            }
                        },
                        Err(e) => {
                            let error = format!("Failed to parse API response: {}", e);
                            println!("{}", error);
                            return Err(error);
                        }
                    }
                } else {
                    // Handle error response
                    match response.text().await {
                        Ok(error_text) => {
                            let error = format!("API request failed with status {}: {}", status, error_text);
                            println!("{}", error);
                            return Err(error);
                        },
                        Err(e) => {
                            let error = format!("Failed to get error details: {}", e);
                            println!("{}", error);
                            return Err(error);
                        }
                    }
                }
            },
            Err(e) => {
                let error = format!("Request failed: {}", e);
                println!("{}", error);
                return Err(error);
            }
        }
}

// Add a function to save recording as well if it's missing
#[tauri::command]
pub async fn save_audio_recording(audio_base64: String) -> Result<String, String> {
    // Decode base64 audio
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(audio_base64) {
        Ok(data) => {
            println!("Successfully decoded base64 data, size: {} bytes", data.len());
            data
        },
        Err(e) => {
            println!("Failed to decode base64: {}", e);
            return Err(format!("Failed to decode base64: {}", e));
        }
    };
    
    // Save to a temporary file
    let temp_path = std::env::temp_dir().join("audio_recording.mp3");
    match fs::write(&temp_path, &audio_data).await {
        Ok(_) => {
            println!("Recording saved to: {:?}", temp_path);
            Ok(temp_path.to_string_lossy().to_string())
        },
        Err(e) => {
            println!("Failed to write recording file: {}", e);
            Err(format!("Failed to write recording file: {}", e))
        }
    }
}