// src-tauri/src/services/project_structure.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
    pub size: u64,
    pub extension: Option<String>,
}

// New custom filter struct that includes an optional string for exclude patterns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptions {
    pub exclude_node_modules: bool,
    pub exclude_git: bool,
    pub exclude_target: bool,
    pub exclude_build: bool,
    pub exclude_hidden: bool,
    pub custom_excludes: bool,
    pub exclude_patterns: Option<String>, // Use Option so it can be omitted if not needed.
}

#[command]
pub async fn get_project_structure(path: String, filters: FilterOptions) -> Result<FileNode, String> {
    let exclude_regex = create_exclude_regex(&filters)?;
    let path = PathBuf::from(path);
    
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    
    let root = read_dir_recursive(&path, &path, &exclude_regex)?;
    Ok(root)
}

#[command]
pub fn generate_structure_text(node: FileNode, includeFiles: bool) -> String {
    // Start with the root node name and an empty prefix.
    let mut output = format!("{}/\n", node.name);
    if let Some(children) = node.children {
        let count = children.len();
        for (i, child) in children.iter().enumerate() {
            let is_last = i == count - 1;
            output.push_str(&generate_tree(child, "", is_last, includeFiles));
        }
    }
    output
}

fn generate_tree(node: &FileNode, prefix: &str, is_last: bool, includeFiles: bool) -> String {
    let mut output = String::new();
    let branch = if is_last { "└── " } else { "├── " };
    output.push_str(&format!("{}{}{}\n", prefix, branch, node.name));

    // Prepare new prefix for children
    let new_prefix = if is_last { format!("{}    ", prefix) } else { format!("{}│   ", prefix) };

    if let Some(children) = &node.children {
        let count = children.len();
        for (i, child) in children.iter().enumerate() {
            let child_is_last = i == count - 1;
            if child.is_dir {
                output.push_str(&generate_tree(child, &new_prefix, child_is_last, includeFiles));
            } else if includeFiles {
                let file_branch = if child_is_last { "└── " } else { "├── " };
                output.push_str(&format!("{}{}{}\n", new_prefix, file_branch, child.name));
            }
        }
    }
    output
}

fn read_dir_recursive(base_path: &Path, current_path: &Path, exclude_regex: &Option<Regex>) -> Result<FileNode, String> {
    let name = current_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_else(|| current_path.to_str().unwrap_or("Unknown"))
        .to_string();
    
    let rel_path = current_path.strip_prefix(base_path.parent().unwrap_or(Path::new("")))
        .map_err(|e| format!("Failed to get relative path: {}", e))?;
    
    let path_str = rel_path.to_string_lossy().to_string();
    
    // Check if path matches the exclude pattern.
    if let Some(regex) = exclude_regex {
        if regex.is_match(&path_str) {
            return Err(format!("Path excluded by filter: {}", path_str));
        }
    }
    
    let metadata = fs::metadata(current_path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", current_path.display(), e))?;
    
    let is_dir = metadata.is_dir();
    let size = if is_dir { 0 } else { metadata.len() };
    
    let extension = if is_dir {
        None
    } else {
        current_path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_string())
    };
    
    let mut node = FileNode {
        name,
        path: path_str,
        is_dir,
        children: None,
        size,
        extension,
    };
    
    if is_dir {
        let mut children = Vec::new();
        
        match fs::read_dir(current_path) {
            Ok(entries) => {
                for entry_result in entries {
                    match entry_result {
                        Ok(entry) => {
                            let child_path = entry.path();
                            match read_dir_recursive(base_path, &child_path, exclude_regex) {
                                Ok(child_node) => children.push(child_node),
                                Err(_) => continue, // Skip excluded files/directories
                            }
                        },
                        Err(e) => return Err(format!("Failed to read directory entry: {}", e)),
                    }
                }
            },
            Err(e) => return Err(format!("Failed to read directory {}: {}", current_path.display(), e)),
        }
        
        // Sort children: directories first, then files, alphabetically.
        children.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, true) | (false, false) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
            }
        });
        
        node.children = Some(children);
    }
    
    Ok(node)
}

fn create_exclude_regex(filters: &FilterOptions) -> Result<Option<Regex>, String> {
    let mut patterns = Vec::<String>::new();
    
    if filters.exclude_node_modules {
        patterns.push("node_modules".to_string());
    }
    if filters.exclude_git {
        patterns.push(r"\.git".to_string());
    }
    if filters.exclude_target {
        patterns.push("target".to_string());
    }
    if filters.exclude_build {
        patterns.push("build|dist".to_string());
    }
    if filters.exclude_hidden {
        patterns.push(r"/\.[^/]*$".to_string());
    }
    
    if filters.custom_excludes {
        if let Some(user_patterns) = &filters.exclude_patterns {
            let trimmed = user_patterns.trim();
            if !trimmed.is_empty() {
                patterns.push(trimmed.to_string());
            }
        }
    }    
    
    if patterns.is_empty() {
        return Ok(None);
    }
    
    let pattern = format!("({})", patterns.join("|"));
    match Regex::new(&pattern) {
        Ok(regex) => Ok(Some(regex)),
        Err(e) => Err(format!("Failed to create regex pattern: {}", e)),
    }
}

#[command]
pub fn is_valid_path(path: String) -> bool {
    PathBuf::from(path).exists()
}
