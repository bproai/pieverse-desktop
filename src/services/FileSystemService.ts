// src/services/FileSystemService.ts
import { core } from '@tauri-apps/api';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import {
  exists,
  readTextFile,
  writeTextFile,
  copyFile,
  readDir,
  create,
  mkdir
} from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
  size?: number;
  lastModified?: Date;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

// Use these functions instead
const removeFile = async (filePath: string) => {
    return await core.invoke('plugin:fs|remove_file', { path: filePath });
};
  
const removeDir = async (dirPath: string, options?: { recursive?: boolean }) => {
    return await core.invoke('plugin:fs|remove_dir', { 
      path: dirPath,
      recursive: options?.recursive || false 
    });
};
  
const renameFile = async (oldPath: string, newPath: string) => {
    return await core.invoke('plugin:fs|rename', { 
      from: oldPath,
      to: newPath 
    });
};

class FileSystemService {
  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      return await exists(filePath);
    } catch (error) {
      console.error(`Error checking if path exists: ${error}`);
      return false;
    }
  }

  /**
   * Read a text file
   */
  async readTextFile(filePath: string): Promise<string | null> {
    try {
      // Check if the file exists first
      const fileExists = await this.exists(filePath);
      if (!fileExists) {
        console.error(`File does not exist: ${filePath}`);
        return null;
      }

      const content = await readTextFile(filePath);
      return content;
    } catch (error) {
      console.error(`Error reading text file: ${error}`);
      return null;
    }
  }

  /**
   * Write content to a text file
   */
  async writeTextFile(filePath: string, content: string): Promise<boolean> {
    try {
      await writeTextFile(filePath, content);
      return true;
    } catch (error) {
      console.error(`Error writing text file: ${error}`);
      return false;
    }
  }

  /**
   * Copy a file from source to destination
   */
  async copyFile(source: string, destination: string): Promise<boolean> {
    try {
      await copyFile(source, destination);
      return true;
    } catch (error) {
      console.error(`Error copying file: ${error}`);
      return false;
    }
  }

  /**
 * Create a new file (without any content)
 */
async createFile(filePath: string): Promise<boolean> {
    try {
      // Use create function to create an empty file
      await create(filePath);
      return true;
    } catch (error) {
      console.error(`Error creating file: ${error}`);
      return false;
    }
  }

  /**
   * Create a directory (and parent directories if needed)
   */
  async createDirectory(dirPath: string, recursive: boolean = true): Promise<boolean> {
    try {
      // Use the correct function name 'create' instead of 'createDir'
      await mkdir(dirPath, { recursive });
      return true;
    } catch (error) {
      console.error(`Error creating directory: ${error}`);
      return false;
    }
  }

  /**
   * Remove a file
   */
  async removeFile(filePath: string): Promise<boolean> {
    try {
      await removeFile(filePath);
      return true;
    } catch (error) {
      console.error(`Error removing file: ${error}`);
      return false;
    }
  }

  /**
   * Remove a directory
   */
  async removeDirectory(dirPath: string, recursive: boolean = true): Promise<boolean> {
    try {
      await removeDir(dirPath, { recursive });
      return true;
    } catch (error) {
      console.error(`Error removing directory: ${error}`);
      return false;
    }
  }

  /**
   * Rename a file or directory
   */
  async rename(oldPath: string, newPath: string): Promise<boolean> {
    try {
      await renameFile(oldPath, newPath);
      return true;
    } catch (error) {
      console.error(`Error renaming file/directory: ${error}`);
      return false;
    }
  }

  /**
   * List contents of a directory
   */
  async listDirectory(dirPath: string, recursive: boolean = false): Promise<FileEntry[]> {
    try {
      const entries = await readDir(dirPath, { recursive });
      
      // Convert to our FileEntry format
      return entries.map(entry => ({
        name: entry.name || path.basename(entry.path),
        path: entry.path,
        isDir: entry.isDirectory || false,
        children: entry.children?.map(child => ({
          name: child.name || path.basename(child.path),
          path: child.path,
          isDir: child.children !== undefined,
        }))
      }));
    } catch (error) {
      console.error(`Error listing directory: ${error}`);
      return [];
    }
  }

  /**
   * Open file dialog
   */
  async openFileDialog(options?: {
    multiple?: boolean;
    filters?: FileFilter[];
    title?: string;
  }): Promise<string | string[] | null> {
    try {
      const selected = await open({
        multiple: options?.multiple || false,
        filters: options?.filters,
        title: options?.title || 'Open File'
      });
      
      return selected;
    } catch (error) {
      console.error(`Error opening file dialog: ${error}`);
      return null;
    }
  }

  /**
   * Open directory dialog
   */
  async openDirectoryDialog(options?: {
    multiple?: boolean;
    title?: string;
  }): Promise<string | string[] | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: options?.multiple || false,
        title: options?.title || 'Select Directory'
      });
      
      return selected;
    } catch (error) {
      console.error(`Error opening directory dialog: ${error}`);
      return null;
    }
  }

  /**
   * Save file dialog
   */
  async saveFileDialog(options?: {
    defaultPath?: string;
    filters?: FileFilter[];
    title?: string;
  }): Promise<string | null> {
    try {
      const filePath = await save({
        defaultPath: options?.defaultPath,
        filters: options?.filters,
        title: options?.title || 'Save File'
      });
      
      return filePath;
    } catch (error) {
      console.error(`Error opening save dialog: ${error}`);
      return null;
    }
  }

  /**
   * Open and read a file in one operation
   */
  async openAndReadFile(options?: {
    filters?: FileFilter[];
    title?: string;
  }): Promise<{ path: string; content: string } | null> {
    try {
      const filePath = await this.openFileDialog({
        filters: options?.filters,
        title: options?.title
      });
      
      if (!filePath || Array.isArray(filePath)) {
        return null;
      }
      
      const content = await this.readTextFile(filePath);
      
      if (content === null) {
        return null;
      }
      
      return { path: filePath, content };
    } catch (error) {
      console.error(`Error opening and reading file: ${error}`);
      return null;
    }
  }

  /**
   * Save content to a file with dialog
   */
  async saveContent(content: string, options?: {
    defaultPath?: string;
    filters?: FileFilter[];
    title?: string;
  }): Promise<string | null> {
    try {
      const filePath = await this.saveFileDialog(options);
      
      if (!filePath) {
        return null;
      }
      
      const success = await this.writeTextFile(filePath, content);
      
      if (!success) {
        return null;
      }
      
      return filePath;
    } catch (error) {
      console.error(`Error saving content: ${error}`);
      return null;
    }
  }

  /**
   * Confirm an action with a dialog
   */
  async confirmAction(message: string, options?: {
    title?: string;
    type?: 'info' | 'warning' | 'error';
  }): Promise<boolean> {
    try {
      return await confirm(
        message,
        {
          title: options?.title || 'Confirm',
          type: options?.type || 'info'
        }
      );
    } catch (error) {
      console.error(`Error showing confirmation dialog: ${error}`);
      return false;
    }
  }

  /**
   * Copy file content to clipboard
   */
  async copyToClipboard(filePath: string): Promise<boolean> {
    try {
      const content = await this.readTextFile(filePath);
      
      if (content === null) {
        return false;
      }
      
      await writeText(content);
      return true;
    } catch (error) {
      console.error(`Error copying to clipboard: ${error}`);
      return false;
    }
  }

  /**
   * Get the base name of a path (filename or directory name)
   */
  getBaseName(filePath: string): string {
    return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  }
}

export default new FileSystemService();