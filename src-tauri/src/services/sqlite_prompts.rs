// src-tauri/src/services/sqlite_prompts.rs
use super::sqlite::SqliteService;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Prompt {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub category: String,
    pub display_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl TryFrom<Value> for Prompt {
    type Error = String;

    fn try_from(value: Value) -> Result<Self, Self::Error> {
        if let Value::Object(map) = value {
            Ok(Prompt {
                id: map.get("id")
                    .and_then(|v| v.as_i64())
                    .ok_or("Missing or invalid id")?,
                title: map.get("title")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing or invalid title")?
                    .to_string(),
                description: map.get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                category: map.get("category")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing or invalid category")?
                    .to_string(),
                display_order: map.get("display_order")
                    .and_then(|v| v.as_i64())
                    .ok_or("Missing or invalid display_order")? as i32,
                is_active: map.get("is_active")
                    .and_then(|v| v.as_i64())
                    .map(|v| v == 1)
                    .ok_or("Missing or invalid is_active")?,
                created_at: map.get("created_at")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing or invalid created_at")?
                    .to_string(),
                updated_at: map.get("updated_at")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing or invalid updated_at")?
                    .to_string(),
            })
        } else {
            Err("Invalid JSON structure".to_string())
        }
    }
}

#[tauri::command]
pub async fn sqlite_get_prompts(state: State<'_, SqliteService>) -> Result<Vec<Prompt>, String> {
    let query = "SELECT * FROM prompts ORDER BY category, display_order";
    state.execute_query(query)
        .map_err(|e| e.to_string())
        .and_then(|values| {
            values.into_iter()
                .map(Prompt::try_from)
                .collect::<Result<Vec<_>, _>>()
        })
}

#[tauri::command]
pub async fn sqlite_create_prompt(
    prompt: Prompt,
    state: State<'_, SqliteService>
) -> Result<(), String> {
    let query = "INSERT INTO prompts (title, description, category, display_order, is_active) 
                 VALUES (?, ?, ?, ?, ?)";
    
    state.execute_parameterized(
        query,
        [
            prompt.title,
            prompt.description.unwrap_or_default(),
            prompt.category,
            prompt.display_order.to_string(),
            (if prompt.is_active { 1 } else { 0 }).to_string()
        ],
    )
    .map_err(|e| e.to_string())
}

// Replace sqlite_update_prompt with:
#[tauri::command]
pub async fn sqlite_update_prompt(
    id: i64,
    prompt: Prompt,
    state: State<'_, SqliteService>
) -> Result<(), String> {
    let query = "UPDATE prompts SET 
                title = ?,
                description = ?,
                category = ?,
                display_order = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
                WHERE id = ?";
    
    state.execute_parameterized(
        query,
        [
            prompt.title,
            prompt.description.unwrap_or_default(),
            prompt.category,
            prompt.display_order.to_string(),
            (if prompt.is_active { 1 } else { 0 }).to_string(),
            id.to_string()
        ],
    )
    .map_err(|e| e.to_string())
}

// Replace sqlite_delete_prompt with:
#[tauri::command]
pub async fn sqlite_delete_prompt(
    id: i64,
    state: State<'_, SqliteService>
) -> Result<(), String> {
    let query = "DELETE FROM prompts WHERE id = ?";
    state.execute_parameterized(query, [id.to_string()])
        .map_err(|e| e.to_string())
}