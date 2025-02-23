-- src/sql/schema/prompts.sql
CREATE TABLE IF NOT EXISTS prompt_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Initialize with sample data
INSERT INTO prompt_categories (name, display_order) VALUES
('WRITING & ANALYSIS', 1),
('FINANCE & MARKETS', 2),
('CODE & DEVELOPMENT', 3);

INSERT INTO prompts (category_id, title, description, display_order, is_active) VALUES
(1, 'Deep Analysis', 'Analyze text for themes and arguments', 1, true),
(1, 'Quick Summary', 'Get key points and takeaways', 2, true),
(2, 'Market Analysis', 'Understand market movements', 1, true),
(2, 'Financial Writing', 'Enhance financial communication', 2, true),
(3, 'Code Generation', 'Get production-ready code', 1, true),
(3, 'Code Review', 'Review and improve code quality', 2, true);
