-- src/sql/init.sql

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS pieverse;
USE pieverse;

-- Create prompt_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS prompt_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create prompts table if it doesn't exist
CREATE TABLE IF NOT EXISTS prompts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES prompt_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample categories if they don't exist
INSERT IGNORE INTO prompt_categories (name, display_order) VALUES
('WRITING & ANALYSIS', 1),
('FINANCE & MARKETS', 2),
('CODE & DEVELOPMENT', 3);

-- Insert sample prompts if they don't exist
INSERT IGNORE INTO prompts (category_id, title, description, display_order, is_active) 
SELECT 
    c.id,
    'Deep Analysis',
    'Analyze text for themes and arguments',
    1,
    true
FROM prompt_categories c
WHERE c.name = 'WRITING & ANALYSIS'
AND NOT EXISTS (
    SELECT 1 FROM prompts 
    WHERE title = 'Deep Analysis' 
    AND category_id = c.id
);
