// src-tauri/src/services/llm_rules.rs
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum VariableType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "select")]
    Select,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Variable {
    pub name: String,
    pub description: String,
    pub default_value: String,
    #[serde(rename = "type")]
    pub variable_type: VariableType,
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LLMRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model: String,
    pub content: String,
    pub tags: Vec<String>,
    pub variables: Vec<Variable>,
    pub date_created: String,
    pub date_modified: String,
    pub is_system: bool,
    pub color: String,
}

pub struct LLMRulesService {
    app_handle: AppHandle,
    rules_file: PathBuf,
}

impl LLMRulesService {
    pub fn new(app_handle: AppHandle) -> Self {
        // Get the app data directory
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        // Create directory if it doesn't exist
        if !app_dir.exists() {
            fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
        }

        let rules_file = app_dir.join("llm_rules.json");

        // Create file with default rules if it doesn't exist
        if !rules_file.exists() {
            let default_rules = Self::create_default_rules();
            let json = serde_json::to_string_pretty(&default_rules)
                .expect("Failed to serialize default rules");
            let mut file = File::create(&rules_file).expect("Failed to create rules file");
            file.write_all(json.as_bytes())
                .expect("Failed to write default rules");
        }

        Self {
            app_handle,
            rules_file,
        }
    }

    fn create_default_rules() -> Vec<LLMRule> {
        vec![
            LLMRule {
                id: "1".to_string(),
                name: "Expert Coding Assistant".to_string(),
                description: "Instructions for an LLM to behave as a coding expert".to_string(),
                model: "gpt-4".to_string(),
                content:
                    r#"You are an expert software developer specializing in modern web technologies.
Follow these guidelines:
- Provide clean, efficient, and well-commented code
- Explain your approach before diving into code
- Offer multiple solutions when appropriate
- Highlight potential issues or edge cases
- Be concise but thorough
- When providing code examples, focus on production-ready patterns

Remember to consider performance, security, and maintainability in all your suggestions.
If the user's request is unclear, ask clarifying questions before providing a solution.

Use variables like this:
- Preferred language: {{preferredLanguage}}
- Project type: {{projectType}}
- Experience level: {{experienceLevel}}"#
                        .to_string(),
                tags: vec![
                    "coding".to_string(),
                    "programming".to_string(),
                    "software development".to_string(),
                ],
                variables: vec![
                    Variable {
                        name: "preferredLanguage".to_string(),
                        description: "The programming language the user prefers".to_string(),
                        default_value: "JavaScript".to_string(),
                        variable_type: VariableType::Select,
                        options: Some(vec![
                            "JavaScript".to_string(),
                            "TypeScript".to_string(),
                            "Python".to_string(),
                            "Rust".to_string(),
                            "Go".to_string(),
                            "Java".to_string(),
                            "C#".to_string(),
                        ]),
                    },
                    Variable {
                        name: "projectType".to_string(),
                        description: "The type of project the user is working on".to_string(),
                        default_value: "Web Application".to_string(),
                        variable_type: VariableType::Text,
                        options: None,
                    },
                    Variable {
                        name: "experienceLevel".to_string(),
                        description: "The user's experience level".to_string(),
                        default_value: "Intermediate".to_string(),
                        variable_type: VariableType::Select,
                        options: Some(vec![
                            "Beginner".to_string(),
                            "Intermediate".to_string(),
                            "Advanced".to_string(),
                            "Expert".to_string(),
                        ]),
                    },
                ],
                date_created: "2023-11-20T08:30:00Z".to_string(),
                date_modified: "2024-02-15T14:45:00Z".to_string(),
                is_system: true,
                color: "#228BE6".to_string(),
            },
            LLMRule {
                id: "2".to_string(),
                name: "Creative Writing Coach".to_string(),
                description: "Instructions for an LLM to act as a writing coach".to_string(),
                model: "claude-3-opus".to_string(),
                content: r#"You are a supportive and insightful creative writing coach.
Your goal is to help writers improve their craft while maintaining their unique voice.

Follow these guidelines:
- Provide constructive feedback that balances positives with areas for improvement
- Focus on storytelling elements: plot, character development, setting, dialogue, pacing
- Suggest concrete examples when possible
- Adapt your approach based on {{genre}} and {{targetAudience}}
- Consider the writer's {{experienceLevel}} when offering advice
- Be encouraging but honest

When reviewing work, consider both technical aspects and creative expression.
If asked for specific exercises or prompts, tailor them to help the writer develop their skills.

Remember: your goal is to help the writer tell THEIR story better, not to rewrite it as your own."#
                    .to_string(),
                tags: vec![
                    "writing".to_string(),
                    "creativity".to_string(),
                    "coaching".to_string(),
                ],
                variables: vec![
                    Variable {
                        name: "genre".to_string(),
                        description: "The genre of writing".to_string(),
                        default_value: "Fiction".to_string(),
                        variable_type: VariableType::Select,
                        options: Some(vec![
                            "Fiction".to_string(),
                            "Science Fiction".to_string(),
                            "Fantasy".to_string(),
                            "Mystery".to_string(),
                            "Romance".to_string(),
                            "Literary".to_string(),
                            "Non-fiction".to_string(),
                            "Poetry".to_string(),
                        ]),
                    },
                    Variable {
                        name: "targetAudience".to_string(),
                        description: "The target audience for the writing".to_string(),
                        default_value: "Adult".to_string(),
                        variable_type: VariableType::Select,
                        options: Some(vec![
                            "Children".to_string(),
                            "Young Adult".to_string(),
                            "Adult".to_string(),
                            "Academic".to_string(),
                            "Professional".to_string(),
                        ]),
                    },
                    Variable {
                        name: "experienceLevel".to_string(),
                        description: "The writer's experience level".to_string(),
                        default_value: "Intermediate".to_string(),
                        variable_type: VariableType::Select,
                        options: Some(vec![
                            "Beginner".to_string(),
                            "Intermediate".to_string(),
                            "Advanced".to_string(),
                        ]),
                    },
                ],
                date_created: "2023-12-05T10:15:00Z".to_string(),
                date_modified: "2024-03-01T09:30:00Z".to_string(),
                is_system: false,
                color: "#40C057".to_string(),
            },
        ]
    }

    pub fn load_rules(&self) -> Result<Vec<LLMRule>, String> {
        let mut file = File::open(&self.rules_file)
            .map_err(|e| format!("Failed to open rules file: {}", e))?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read rules file: {}", e))?;

        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse rules file: {}", e))
    }

    pub fn save_rules(&self, rules: Vec<LLMRule>) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&rules)
            .map_err(|e| format!("Failed to serialize rules: {}", e))?;

        let mut file = File::create(&self.rules_file)
            .map_err(|e| format!("Failed to create rules file: {}", e))?;

        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write rules file: {}", e))?;

        Ok(())
    }
}

// Tauri command to load rules
#[tauri::command]
pub async fn load_llm_rules(app_handle: tauri::AppHandle) -> Result<Vec<LLMRule>, String> {
    let rules_service = LLMRulesService::new(app_handle);
    rules_service.load_rules()
}

// Tauri command to save rules
#[tauri::command]
pub async fn save_llm_rules(
    app_handle: tauri::AppHandle,
    rules: Vec<LLMRule>,
) -> Result<(), String> {
    let rules_service = LLMRulesService::new(app_handle);
    rules_service.save_rules(rules)
}


#[tauri::command]
pub async fn export_llm_rules(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let rules_service = LLMRulesService::new(app_handle.clone());
    
    // Load the rules
    let rules = rules_service.load_rules()?;
    
    // Convert to JSON with pretty formatting
    let json = serde_json::to_string_pretty(&rules)
        .map_err(|e| format!("Failed to serialize rules: {}", e))?;
    
    // Write to the specified path
    std::fs::write(&path, json).map_err(|e| format!("Failed to write export file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn import_llm_rules(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    println!("Attempting to import rules from: {}", path);
    
    // Read rules from the file
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => {
            println!("Successfully read file content");
            content
        },
        Err(e) => {
            let error_msg = format!("Failed to read import file: {}", e);
            println!("{}", error_msg);
            return Err(error_msg);
        }
    };
    
    // Parse the rules - Add explicit type parameter here
    let imported_rules: Vec<LLMRule> = match serde_json::from_str::<Vec<LLMRule>>(&content) {
        Ok(rules) => {
            println!("Successfully parsed {} rules", rules.len());
            rules
        },
        Err(e) => {
            let error_msg = format!("Failed to parse imported rules: {}", e);
            println!("{}", error_msg);
            return Err(error_msg);
        }
    };
    
    // Create service and save the imported rules
    let rules_service = LLMRulesService::new(app_handle);
    match rules_service.save_rules(imported_rules) {
        Ok(_) => {
            println!("Import completed successfully");
            Ok(())
        },
        Err(e) => {
            println!("Error saving imported rules: {}", e);
            Err(e)
        }
    }
}