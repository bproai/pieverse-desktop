// src-tauri/src/services/project_structure.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

#[command]
pub async fn get_project_structure(path: String, filters: HashMap<String, bool>) -> Result<FileNode, String> {
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
            // If the child is a directory, process recursively; if it's a file and includeFiles is true, just print it.
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
        .unwrap_or_else(|| {
            current_path.to_str().unwrap_or("Unknown")
        })
        .to_string();
    
    let rel_path = current_path.strip_prefix(base_path.parent().unwrap_or(Path::new("")))
        .map_err(|e| format!("Failed to get relative path: {}", e))?;
    
    let path_str = rel_path.to_string_lossy().to_string();
    
    // Check if path matches exclude pattern
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
                                Ok(child_node) => {
                                    children.push(child_node);
                                },
                                Err(_) => {
                                    // Skip excluded files/directories
                                    continue;
                                }
                            }
                        },
                        Err(e) => {
                            return Err(format!("Failed to read directory entry: {}", e));
                        }
                    }
                }
            },
            Err(e) => {
                return Err(format!("Failed to read directory {}: {}", current_path.display(), e));
            }
        }
        
        // Sort children: directories first, then files, alphabetically within each group
        children.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                // Both are directories or both are files - sort alphabetically
                (true, true) | (false, false) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                // Directory before file
                (true, false) => std::cmp::Ordering::Less,
                // File after directory
                (false, true) => std::cmp::Ordering::Greater,
            }
        });
        
        node.children = Some(children);
    }
    
    Ok(node)
}

fn create_exclude_regex(filters: &HashMap<String, bool>) -> Result<Option<Regex>, String> {
    let mut patterns = Vec::<String>::new();  // Change to Vec<String> to own the strings
    
    // Add common patterns to exclude
    if filters.get("exclude_node_modules").unwrap_or(&true) == &true {
        patterns.push("node_modules".to_string());
    }
    if filters.get("exclude_git").unwrap_or(&true) == &true {
        patterns.push(r"\.git".to_string());
    }
    if filters.get("exclude_target").unwrap_or(&true) == &true {
        patterns.push("target".to_string());
    }
    if filters.get("exclude_build").unwrap_or(&true) == &true {
        patterns.push("build|dist".to_string());
    }
    if filters.get("exclude_hidden").unwrap_or(&true) == &true {
        patterns.push(r"/\.[^/]*$".to_string());  // Files starting with a dot
    }
    
    // Add custom exclude patterns
    if let Some(custom_excludes) = filters.get("custom_excludes") {
        if custom_excludes == &true {
            if let Some(exclude_patterns) = filters.get("exclude_patterns") {
                // Store the owned string in the vector
                patterns.push(exclude_patterns.to_string());
            }
        }
    }
    
    if patterns.is_empty() {
        return Ok(None);
    }
    
    // Join the owned strings
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