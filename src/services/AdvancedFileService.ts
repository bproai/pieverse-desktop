// src/services/AdvancedFileService.ts
import { core } from '@tauri-apps/api';

export interface FileInfo {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified?: number;
  created?: number;
}

export interface SearchOptions {
  pattern?: string;
  regex?: string;
  recursive?: boolean;
  max_depth?: number;
  include_dirs?: boolean;
  include_files?: boolean;
  min_size?: number;
  max_size?: number;
  extensions?: string[];
}

/**
 * Advanced file system operations provided by Rust backend
 */
class AdvancedFileService {
  /**
   * Get detailed information about a file or directory
   */
  async getFileInfo(path: string): Promise<FileInfo> {
    return await core.invoke('get_file_info', { path });
  }

  /**
   * Search for files matching criteria
   */
  async searchFiles(
    directory: string, 
    query: string, 
    options?: SearchOptions
  ): Promise<FileInfo[]> {
    return await core.invoke('search_files', { directory, query, options });
  }

  /**
   * Copy a directory and all its contents
   */
  async copyDirectory(source: string, destination: string): Promise<void> {
    return await core.invoke('copy_directory', { source, destination });
  }

  /**
   * Read a text file with security checks (size limit)
   */
  async readTextFileSecure(filePath: string, maxSize?: number): Promise<string> {
    return await core.invoke('read_text_file_secure', { file_path: filePath, max_size: maxSize });
  }

  /**
   * Write to a text file with security checks
   */
  async writeTextFileSecure(filePath: string, content: string): Promise<void> {
    return await core.invoke('write_text_file_secure', { file_path: filePath, content });
  }

  /**
   * Generate a text representation of a directory tree
   */
  async generateFileTree(
    directory: string, 
    include_files: boolean = true,
    max_depth?: number
  ): Promise<string> {
    return await core.invoke('generate_file_tree', { 
      directory, 
      include_files: include_files,
      max_depth: max_depth 
    });
  }

  /**
   * Safely extract the filename from a path
   */
  getBaseName(path: string): string {
    return path.split('/').pop() || path.split('\\').pop() || path;
  }
}

export default new AdvancedFileService();