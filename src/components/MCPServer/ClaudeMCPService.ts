// src/components/ClaudeMCP/ClaudeMCPService.ts
import { core } from '@tauri-apps/api';

export interface MCPStatus {
  running: boolean;
  port: number;
  url: string;
  allowed_directories: string[];
}

export class ClaudeMCPService {
  async getStatus(): Promise<MCPStatus> {
    return await core.invoke<MCPStatus>('get_claude_mcp_status');
  }

  async startServer(port: number, directories: string[]): Promise<string> {
    return await core.invoke<string>('start_claude_mcp_server', {
      port,
      directories
    });
  }

  async stopServer(): Promise<void> {
    await core.invoke('stop_claude_mcp_server');
  }

  async addDirectory(directory: string): Promise<void> {
    await core.invoke('add_claude_mcp_directory', { directory });
  }

  async removeDirectory(directory: string): Promise<void> {
    await core.invoke('remove_claude_mcp_directory', { directory });
  }
}

// Create a singleton instance
export const claudeMCPService = new ClaudeMCPService();