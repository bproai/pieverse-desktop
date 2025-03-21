// src/services/SQLitePromptService.ts
import { core } from '@tauri-apps/api';

export interface Prompt {
    id: number;
    title: string;
    description: string | null;
    category: string;
    display_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

class SQLitePromptService {
    async initializeDatabase(): Promise<void> {
        try {
            await core.invoke('sqlite_init');
            console.log('SQLite database initialized');
        } catch (error) {
            console.error('SQLite initialization failed:', error);
            throw error;
        }
    }

    async getPrompts(): Promise<Prompt[]> {
        const result = await core.invoke<any[]>(
            'sqlite_execute_query',
            { query: 'SELECT * FROM prompts ORDER BY category, display_order' }
        );
        return result;
    }

    async createPrompt(prompt: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
        await core.invoke('sqlite_create_prompt', { prompt });
    }

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

    async bulkImport(prompts: Array<Omit<Prompt, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
        // Process prompts sequentially to avoid transaction conflicts
        for (const prompt of prompts) {
            await this.createPrompt(prompt);
        }
    }
}

export default new SQLitePromptService();