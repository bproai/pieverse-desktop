// src/services/MySQLPromptService.ts
import { MySQLService } from '../components/MySQL/MySQLService';

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

class MySQLPromptService {
    private database = 'pieverse';

    async initializeDatabase(): Promise<void> {
        try {
            console.log('Initializing database...');
            
            // Create database
            await MySQLService.executeQuery('CREATE DATABASE IF NOT EXISTS pieverse');
            
            // Create prompts table
            const createPromptsTable = `
                CREATE TABLE IF NOT EXISTS pieverse.prompts (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    title VARCHAR(100) NOT NULL,
                    description TEXT,
                    category VARCHAR(50) NOT NULL,
                    display_order INT DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
            
            await MySQLService.executeQuery(createPromptsTable);
            console.log('Prompts table created');

        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async getPrompts(): Promise<Prompt[]> {
        const result = await MySQLService.executeQuery(
            `SELECT * FROM ${this.database}.prompts ORDER BY category, display_order`
        );
        return result as Prompt[];
    }

    async createPrompt(prompt: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
        const query = `
            INSERT INTO ${this.database}.prompts 
            (title, description, category, display_order, is_active)
            VALUES (
                '${prompt.title}',
                ${prompt.description ? `'${prompt.description}'` : 'NULL'},
                '${prompt.category}',
                ${prompt.display_order},
                ${prompt.is_active}
            )`;

        await MySQLService.executeQuery(query);
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
                return `${key} = ${value}`;
            })
            .join(', ');

        await MySQLService.executeQuery(
            `UPDATE ${this.database}.prompts SET ${updateFields} WHERE id = ${id}`
        );
    }

    async deletePrompt(id: number): Promise<void> {
        await MySQLService.executeQuery(
            `DELETE FROM ${this.database}.prompts WHERE id = ${id}`
        );
    }
}

export default new MySQLPromptService();