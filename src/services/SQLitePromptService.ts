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
        const query = `
            INSERT INTO prompts 
            (title, description, category, display_order, is_active)
            VALUES (
                '${prompt.title}',
                ${prompt.description ? `'${prompt.description}'` : 'NULL'},
                '${prompt.category}',
                ${prompt.display_order},
                ${prompt.is_active ? 1 : 0}
            )`;

        await core.invoke('sqlite_execute_query', { query });
    }

    async updatePrompt(id: number, updates: Partial<Prompt>): Promise<void> {
        const updateFields = Object.entries(updates)
            .filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))
            .map(([key, value]) => {
                if (value === null) {
                    return `${key} = NULL`;
                }
                if (typeof value === 'string') {
                    return `${key} = '${value}'`;
                }
                if (typeof value === 'boolean') {
                    return `${key} = ${value ? 1 : 0}`;
                }
                return `${key} = ${value}`;
            })
            .join(', ');

        const query = `UPDATE prompts SET ${updateFields} WHERE id = ${id}`;
        await core.invoke('sqlite_execute_query', { query });
    }

    async deletePrompt(id: number): Promise<void> {
        const query = `DELETE FROM prompts WHERE id = ${id}`;
        await core.invoke('sqlite_execute_query', { query });
    }

    async bulkImport(prompts: Array<Omit<Prompt, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
        const values = prompts.map(p => 
            `('${p.title}', 
              ${p.description ? `'${p.description}'` : 'NULL'}, 
              '${p.category}', 
              ${p.display_order}, 
              ${p.is_active ? 1 : 0})`
        ).join(',');

        const query = `
            INSERT INTO prompts 
            (title, description, category, display_order, is_active)
            VALUES ${values}`;

        await core.invoke('sqlite_execute_query', { query });
    }
}

export default new SQLitePromptService();