I'll review your code and suggest minimal changes to convert string-based queries to parameterized queries in your prompt database ETL. This is an important security improvement that will help prevent SQL injection attacks.

The issue is most evident in the SQLitePromptService.ts and sqlite_prompts.rs files where queries are built by directly concatenating user input into SQL strings.

Let's make these changes:

1. First, let's update the `sqlite_prompts.rs` file to use parameterized queries:

```rust
// In src-tauri/src/services/sqlite_prompts.rs
// Replace sqlite_create_prompt with:

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
```

2. Next, let's update the SQLitePromptService.ts file to use the parameterized commands:

```typescript
// In src/services/SQLitePromptService.ts
// Replace createPrompt with:
async createPrompt(prompt: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    await core.invoke('sqlite_create_prompt', { prompt });
}

// Replace updatePrompt with:
async updatePrompt(id: number, updates: Partial<Prompt>): Promise<void> {
    // Create a complete prompt object from the updates
    const completePrompt = {
        id,
        title: updates.title || '',
        description: updates.description || null,
        category: updates.category || '',
        display_order: updates.display_order || 0,
        is_active: updates.is_active !== undefined ? updates.is_active : true,
        created_at: '',
        updated_at: ''
    };
    
    await core.invoke('sqlite_update_prompt', { 
        id,
        prompt: completePrompt
    });
}

// Replace deletePrompt with:
async deletePrompt(id: number): Promise<void> {
    await core.invoke('sqlite_delete_prompt', { id });
}
```

3. We also need to update the bulkImport method in SQLitePromptService.ts. Since we don't have a dedicated backend function for bulk import, we'll need to call createPrompt for each item:

```typescript
// In src/services/SQLitePromptService.ts
// Replace bulkImport with:
async bulkImport(prompts: Array<Omit<Prompt, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    // Process prompts sequentially to avoid transaction conflicts
    for (const prompt of prompts) {
        await this.createPrompt(prompt);
    }
}
```

These changes maintain the existing functionality while making your database interactions much more secure by using parameterized queries. The changes are minimal and focused on the specific security issue while preserving the existing code structure.

Note that we're using the `execute_parameterized` method that you already have defined in your SqliteService. This method handles passing parameters safely to the database without risk of SQL injection.