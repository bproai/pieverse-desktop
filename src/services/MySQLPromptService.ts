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
        const query = `SELECT * FROM ${this.database}.prompts ORDER BY category, display_order`;
        const result = await MySQLService.executeQuery(query);
        return result as Prompt[];
    }

    async createPrompt(prompt: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
        const query = `
            INSERT INTO ${this.database}.prompts 
            (title, description, category, display_order, is_active)
            VALUES (?, ?, ?, ?, ?)`;

        const params = [
            prompt.title,
            prompt.description,
            prompt.category,
            prompt.display_order,
            prompt.is_active
        ];

        await MySQLService.executeParamQuery(query, params);
    }

    async updatePrompt(id: number, updates: Partial<Prompt>): Promise<void> {
        const allowedFields = ['title', 'description', 'category', 'display_order', 'is_active'];
        const updateFields: string[] = [];
        const params: any[] = [];

        // Build the SET clause and parameters
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (updateFields.length === 0) {
            return; // Nothing to update
        }

        // Add the ID parameter for the WHERE clause
        params.push(id);

        const query = `
            UPDATE ${this.database}.prompts 
            SET ${updateFields.join(', ')} 
            WHERE id = ?`;

        await MySQLService.executeParamQuery(query, params);
    }

    async deletePrompt(id: number): Promise<void> {
        const query = `DELETE FROM ${this.database}.prompts WHERE id = ?`;
        await MySQLService.executeParamQuery(query, [id]);
    }

    async bulkImport(prompts: Array<Omit<Prompt, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
        // Process prompts sequentially
        for (const prompt of prompts) {
          await this.createPrompt(prompt);
        }
    }
}

export default new MySQLPromptService();