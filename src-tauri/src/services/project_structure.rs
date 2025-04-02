// src-tauri/src/services/project_structure.rs
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::create_dir_all;
use std::path::{Path, PathBuf};
use tauri::command;
use tauri::AppHandle;
use tauri::Manager;

#[cfg(unix)]
use std::os::unix::fs as unix_fs;
#[cfg(windows)]
use std::os::windows::fs as windows_fs;

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
pub async fn get_project_structure(
    path: String,
    filters: FilterOptions,
) -> Result<FileNode, String> {
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
pub fn generate_structure_text(node: FileNode, include_files: bool) -> String {
    // Start with the root node name and an empty prefix.
    let mut output = format!("{}/\n", node.name);
    if let Some(children) = node.children {
        let count = children.len();
        for (i, child) in children.iter().enumerate() {
            let is_last = i == count - 1;
            output.push_str(&generate_tree(child, "", is_last, include_files));
        }
    }
    output
}

fn generate_tree(node: &FileNode, prefix: &str, is_last: bool, include_files: bool) -> String {
    let mut output = String::new();
    let branch = if is_last { "└── " } else { "├── " };
    output.push_str(&format!("{}{}{}\n", prefix, branch, node.name));

    // Prepare new prefix for children
    let new_prefix = if is_last {
        format!("{}    ", prefix)
    } else {
        format!("{}│   ", prefix)
    };

    if let Some(children) = &node.children {
        let count = children.len();
        for (i, child) in children.iter().enumerate() {
            let child_is_last = i == count - 1;
            if child.is_dir {
                output.push_str(&generate_tree(
                    child,
                    &new_prefix,
                    child_is_last,
                    include_files,
                ));
            } else if include_files {
                let file_branch = if child_is_last {
                    "└── "
                } else {
                    "├── "
                };
                output.push_str(&format!("{}{}{}\n", new_prefix, file_branch, child.name));
            }
        }
    }
    output
}

fn read_dir_recursive(
    base_path: &Path,
    current_path: &Path,
    exclude_regex: &Option<Regex>,
) -> Result<FileNode, String> {
    let name = current_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_else(|| current_path.to_str().unwrap_or("Unknown"))
        .to_string();

    let rel_path = current_path
        .strip_prefix(base_path.parent().unwrap_or(Path::new("")))
        .map_err(|e| format!("Failed to get relative path: {}", e))?;

    let path_str = rel_path.to_string_lossy().to_string();

    // Check if path matches the exclude pattern.
    if let Some(regex) = exclude_regex {
        if regex.is_match(&path_str) {
            return Err(format!("Path excluded by filter: {}", path_str));
        }
    }

    let metadata = fs::metadata(current_path).map_err(|e| {
        format!(
            "Failed to read metadata for {}: {}",
            current_path.display(),
            e
        )
    })?;

    let is_dir = metadata.is_dir();
    let size = if is_dir { 0 } else { metadata.len() };

    let extension = if is_dir {
        None
    } else {
        current_path
            .extension()
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
                        }
                        Err(e) => return Err(format!("Failed to read directory entry: {}", e)),
                    }
                }
            }
            Err(e) => {
                return Err(format!(
                    "Failed to read directory {}: {}",
                    current_path.display(),
                    e
                ))
            }
        }

        // Sort children: directories first, then files, alphabetically.
        children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, true) | (false, false) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
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

#[command]
pub async fn create_copies_for_files(
    app_handle: AppHandle,
    file_paths: Vec<String>,
    project_base_path: String,
) -> Result<String, String> {
    // Use Tauri 2.0 pattern to get app data directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create the tmp and drag_and_drop directories
    let tmp_dir = app_dir.join("tmp");
    let drag_drop_dir = tmp_dir.join("drag_and_drop");

    // Create directories if they don't exist
    create_dir_all(&drag_drop_dir)
        .map_err(|e| format!("Failed to create drag_and_drop directory: {}", e))?;

    // Check if drag_drop_dir is empty
    let is_empty = fs::read_dir(&drag_drop_dir)
        .map(|entries| entries.count() == 0)
        .unwrap_or(true);

    if !file_paths.is_empty() {
        if !is_empty {
            // Clear the directory (frontend will handle confirmation)
            fs::read_dir(&drag_drop_dir)
                .map_err(|e| format!("Failed to read drag_and_drop directory: {}", e))?
                .filter_map(Result::ok)
                .for_each(|entry| {
                    let _ = fs::remove_file(entry.path());
                });
        }
    }

    let project_path = Path::new(&project_base_path);
    let mut created_links = 0;

    for file_path in file_paths {
        // Construct the full source path
        let full_path = if file_path.starts_with(&project_base_path) {
            PathBuf::from(&file_path)
        } else {
            project_path.join(&file_path)
        };

        // Get the filename
        let file_name = full_path
            .file_name()
            .ok_or_else(|| format!("Invalid file path: {}", full_path.display()))?;

        let target_path = drag_drop_dir.join(file_name);

        let metadata = fs::metadata(&full_path)
            .map_err(|e| format!("Failed to get metadata for {}: {}", full_path.display(), e))?;

        if metadata.is_dir() {
            // Skip directories for now
            continue;
        } else {
            fs::copy(&full_path, &target_path)
                .map_err(|e| format!("Failed to copy file {}: {}", full_path.display(), e))?;
        }

        created_links += 1;
    }

    Ok(format!(
        "Created {} copies in {}",
        created_links,
        drag_drop_dir.display()
    ))
}

#[command]
pub async fn check_drag_drop_dir_exists(app_handle: AppHandle) -> Result<bool, String> {
    // Use Tauri 2.0 pattern to get app data directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let tmp_dir = app_dir.join("tmp");
    let drag_drop_dir = tmp_dir.join("drag_and_drop");

    // Check if directory exists and has files
    if !drag_drop_dir.exists() {
        return Ok(false);
    }

    let has_files = fs::read_dir(&drag_drop_dir)
        .map(|entries| entries.count() > 0)
        .unwrap_or(false);

    Ok(has_files)
}

#[command]
pub async fn open_drag_drop_dir(app_handle: AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let tmp_dir = app_dir.join("tmp");
    let drag_drop_dir = tmp_dir.join("drag_and_drop");

    // Make sure directory exists
    if !drag_drop_dir.exists() {
        create_dir_all(&drag_drop_dir)
            .map_err(|e| format!("Failed to create drag_and_drop directory: {}", e))?;
    }

    // Open the directory using the system's file explorer
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(drag_drop_dir)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(drag_drop_dir)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(drag_drop_dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}
