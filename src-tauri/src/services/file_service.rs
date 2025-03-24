// src-tauri/src/services/file_service.rs
use std::path::{Path, PathBuf};
use std::fs;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use tauri::{command, AppHandle, Manager};

// Add this function to validate paths
fn is_path_safe(app_handle: &AppHandle, path: &Path) -> Result<PathBuf, String> {
    // Use the Manager trait methods to get app_handle
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|_| "Failed to get app data directory".to_string())?;
    
    // Get user's home directory as another allowed location
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;
    
    // Canonicalize the path to resolve any symlinks or ".." components
    let canonical_path = path.canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    
    // Check if the path is within allowed directories
    if canonical_path.starts_with(&app_data_dir) || canonical_path.starts_with(&home_dir) {
        Ok(canonical_path)
    } else {
        Err(format!("Access denied: Path is outside of allowed directories: {}", 
            path.display()))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    path: String,
    is_directory: bool,
    size: u64,
    modified: Option<u64>,
    created: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchOptions {
    pattern: Option<String>,
    regex: Option<String>,
    recursive: Option<bool>,
    max_depth: Option<usize>,
    include_dirs: Option<bool>,
    include_files: Option<bool>,
    min_size: Option<u64>,
    max_size: Option<u64>,
    extensions: Option<Vec<String>>,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            pattern: None,
            regex: None,
            recursive: Some(true),
            max_depth: None,
            include_dirs: Some(true),
            include_files: Some(true),
            min_size: None,
            max_size: None,
            extensions: None,
        }
    }
}

#[command]
pub async fn get_file_info(app_handle: AppHandle, path: String) -> Result<FileInfo, String> {
    let path_obj = Path::new(&path);
    
    // Validate path safety
    let canonical_path = is_path_safe(&app_handle, path_obj)?;
    
    if !canonical_path.exists() {
        return Err(format!("Path does not exist: {}", canonical_path.display()));
    }
    
    let metadata = match fs::metadata(&canonical_path) {
        Ok(meta) => meta,
        Err(e) => return Err(format!("Failed to get metadata: {}", e)),
    };
    
    let name = canonical_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    
    let modified = metadata.modified().ok()
        .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    
    let created = metadata.created().ok()
        .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    
    Ok(FileInfo {
        name,
        path: canonical_path.to_string_lossy().to_string(),
        is_directory: metadata.is_dir(),
        size: metadata.len(),
        modified,
        created,
    })
}

#[command]
pub async fn search_files(
    app_handle: AppHandle,
    directory: String, 
    query: String, 
    options: Option<SearchOptions>
) -> Result<Vec<FileInfo>, String> {
    let path = PathBuf::from(&directory);
    
    // Validate path safety
    let canonical_path = is_path_safe(&app_handle, &path)?;
    
    if !canonical_path.exists() || !canonical_path.is_dir() {
        return Err(format!("Invalid directory: {}", canonical_path.display()));
    }
    
    let options = options.unwrap_or_default();
    let mut results = Vec::new();
    
    let regex = if let Some(regex_pattern) = &options.regex {
        match Regex::new(regex_pattern) {
            Ok(re) => Some(re),
            Err(e) => return Err(format!("Invalid regex pattern: {}", e)),
        }
    } else {
        None
    };
    
    // Pass the canonical path to search_directory
    search_directory(
        &canonical_path, 
        &query, 
        &options, 
        &regex, 
        &mut results, 
        0
    )?;
    
    Ok(results)
}

fn search_directory(
    dir: &Path, 
    query: &str, 
    options: &SearchOptions, 
    regex: &Option<Regex>, 
    results: &mut Vec<FileInfo>, 
    current_depth: usize
) -> Result<(), String> {
    let max_depth = options.max_depth.unwrap_or(std::usize::MAX);
    
    if current_depth > max_depth {
        return Ok(());
    }
    
    if !dir.is_dir() {
        return Ok(());
    }
    
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => return Err(format!("Failed to read directory {}: {}", dir.display(), e)),
    };
    
    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(e) => {
                // Log error but continue with other entries
                eprintln!("Error reading entry: {}", e);
                continue;
            }
        };
        
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(meta) => meta,
            Err(e) => {
                eprintln!("Error reading metadata for {}: {}", path.display(), e);
                continue;
            }
        };
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let path_str = path.to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        
        // Match by name
        let name_matches = if let Some(re) = regex {
            re.is_match(&name)
        } else if !query.is_empty() {
            name.to_lowercase().contains(&query.to_lowercase())
        } else {
            true
        };
        
        // Match by extension
        let ext_matches = if let Some(exts) = &options.extensions {
            if is_dir {
                true
            } else {
                path.extension()
                    .and_then(|e| e.to_str())
                    .map(|ext| exts.iter().any(|e| e.eq_ignore_ascii_case(ext)))
                    .unwrap_or(false)
            }
        } else {
            true
        };
        
        // Match by size
        let min_size = options.min_size.unwrap_or(0);
        let max_size = options.max_size.unwrap_or(u64::MAX);
        let size_matches = is_dir || (metadata.len() >= min_size && metadata.len() <= max_size);
        
        if name_matches && ext_matches && size_matches {
            let include_this = if is_dir {
                options.include_dirs.unwrap_or(true)
            } else {
                options.include_files.unwrap_or(true)
            };
            
            if include_this {
                let modified = metadata.modified().ok()
                    .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs());
                
                let created = metadata.created().ok()
                    .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs());
                
                results.push(FileInfo {
                    name,
                    path: path_str,
                    is_directory: is_dir,
                    size: metadata.len(),
                    modified,
                    created,
                });
            }
        }
        
        // Recursively search subdirectories if requested
        if is_dir && options.recursive.unwrap_or(true) {
            search_directory(&path, query, options, regex, results, current_depth + 1)?;
        }
    }
    
    Ok(())
}

#[command]
pub async fn copy_directory(
    app_handle: AppHandle, 
    source: String, 
    destination: String
) -> Result<(), String> {
    let src_path = Path::new(&source);
    let dst_path = Path::new(&destination);
    
    // Validate both source and destination paths
    let canonical_src = is_path_safe(&app_handle, src_path)?;
    let canonical_dst = is_path_safe(&app_handle, dst_path)?;
    
    if !canonical_src.exists() {
        return Err(format!("Source directory does not exist: {}", canonical_src.display()));
    }
    
    if !canonical_src.is_dir() {
        return Err(format!("Source path is not a directory: {}", canonical_src.display()));
    }
    
    // Create destination directory if it doesn't exist
    if !canonical_dst.exists() {
        if let Err(e) = fs::create_dir_all(&canonical_dst) {
            return Err(format!("Failed to create destination directory: {}", e));
        }
    }
    
    // Copy all contents recursively using canonical paths
    copy_dir_contents(&canonical_src, &canonical_dst)
        .map_err(|e| format!("Failed to copy directory: {}", e))
}

fn copy_dir_contents(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(src_path.file_name().unwrap());
        
        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)?;
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    
    Ok(())
}

#[command]
pub async fn read_text_file_secure(app_handle: AppHandle, file_path: String, max_size: Option<u64>) -> Result<String, String> {
    let max_size = max_size.unwrap_or(10 * 1024 * 1024); // Default to 10MB
    let path = Path::new(&file_path);
    
    // Validate path safety
    let canonical_path = is_path_safe(&app_handle, path)?;
    
    if !canonical_path.exists() {
        return Err(format!("File does not exist: {}", canonical_path.display()));
    }
    
    if !canonical_path.is_file() {
        return Err(format!("Path is not a file: {}", canonical_path.display()));
    }
    
    let metadata = match fs::metadata(&canonical_path) {
        Ok(meta) => meta,
        Err(e) => return Err(format!("Failed to get file metadata: {}", e)),
    };
    
    if metadata.len() > max_size {
        return Err(format!("File is too large: {} bytes (max: {} bytes)", metadata.len(), max_size));
    }
    
    match fs::read_to_string(&canonical_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[command]
pub async fn write_text_file_secure(app_handle: AppHandle, file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    
    // Validate path safety
    let canonical_path = is_path_safe(&app_handle, path)?;
    
    // Create parent directories if needed
    if let Some(parent) = canonical_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return Err(format!("Failed to create parent directories: {}", e));
            }
        }
    }
    
    match fs::write(&canonical_path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

#[command]
pub async fn generate_file_tree(
    app_handle: AppHandle,
    directory: String, 
    include_files: bool, 
    max_depth: Option<usize>
) -> Result<String, String> {
    let path = Path::new(&directory);
    
    // Validate path safety
    let canonical_path = is_path_safe(&app_handle, path)?;
    
    if !canonical_path.exists() {
        return Err(format!("Directory does not exist: {}", canonical_path.display()));
    }
    
    if !canonical_path.is_dir() {
        return Err(format!("Path is not a directory: {}", canonical_path.display()));
    }
    
    let max_depth = max_depth.unwrap_or(std::usize::MAX);
    let mut output = String::new();
    
    let dir_name = canonical_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_else(|| {
            // If file_name() returns None (e.g., for root directories),
            // use the full path string
            canonical_path.to_str().unwrap_or("Unknown")
        });
    
    output.push_str(&format!("{}/\n", dir_name));
    
    generate_tree_text(&canonical_path, "", include_files, max_depth, 0, &mut output)?;
    
    Ok(output)
}

fn generate_tree_text(
    path: &Path,
    prefix: &str,
    include_files: bool,
    max_depth: usize,
    current_depth: usize,
    output: &mut String
) -> Result<(), String> {
    if current_depth >= max_depth {
        return Ok(());
    }
    
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(e) => return Err(format!("Failed to read directory {}: {}", path.display(), e)),
    };
    
    let mut entries: Vec<_> = entries.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect directory entries: {}", e))?;
    
    // Sort entries: directories first, then files
    entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });
    
    let total = entries.len();
    
    for (i, entry) in entries.into_iter().enumerate() {
        let is_last = i == total - 1;
        
        let entry_path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        
        let name = entry.file_name().to_string_lossy().to_string();
        
        let branch = if is_last { "└── " } else { "├── " };
        let new_prefix = if is_last { "    " } else { "│   " };
        
        if is_dir || include_files {
            output.push_str(&format!("{}{}{}\n", prefix, branch, name));
        }
        
        if is_dir {
            generate_tree_text(
                &entry_path,
                &format!("{}{}", prefix, new_prefix),
                include_files,
                max_depth,
                current_depth + 1,
                output
            )?;
        }
    }
    
    Ok(())
}