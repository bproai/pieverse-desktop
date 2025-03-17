// src/services/terminalService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionGlobals } from '../extension';

// Import node-pty correctly
import * as nodePty from 'node-pty';

/**
 * Service to handle terminal functionality
 */
export class TerminalService {
  private context: vscode.ExtensionContext;
  private globals: ExtensionGlobals;
  private pieVerseTerminal: vscode.Terminal | null = null;
  private activeCommandId: string | null = null;
  private activeCommand = '';
  private shellProcess: nodePty.IPty | null = null;
  private userInputBuffer = '';
  private isReadingCommand = true;
  
  constructor(context: vscode.ExtensionContext, globals: ExtensionGlobals) {
    this.context = context;
    this.globals = globals;
    this.registerCommands();
  }
  
  /**
   * Register terminal-related commands
   */
  private registerCommands(): void {
    // Register command to show or create the terminal
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.showTerminal', () => {
        if (!this.pieVerseTerminal || this.pieVerseTerminal.exitStatus !== undefined) {
          this.pieVerseTerminal = this.createPieVerseTerminal();
          // Make sure we clear the reference when closed
          this.context.subscriptions.push(
            vscode.window.onDidCloseTerminal(terminal => {
              if (terminal === this.pieVerseTerminal) {
                this.pieVerseTerminal = null;
              }
            })
          );
        }
        this.pieVerseTerminal.show();
        return { success: true };
      })
    );
    
    // Register command to execute a command in the terminal
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.executeInTerminal', async (params: string | { command: string, id?: string }) => {
        try {
          const { command, id } = typeof params === 'string'
            ? { command: params, id: undefined }
            : params;
          
          // Ensure that our custom terminal is available.
          if (!this.pieVerseTerminal || this.pieVerseTerminal.exitStatus !== undefined) {
            await vscode.commands.executeCommand('pieverse-diff.showTerminal');
          } else {
            this.pieVerseTerminal.show();
          }
          
          // Store the active command info for events
          this.activeCommandId = id || Date.now().toString();
          this.activeCommand = command;
          
          // Send command started event
          this.sendTerminalEvent('commandStarted', {
            id: this.activeCommandId,
            command: this.activeCommand
          });
          
          // Now, write the command directly to the shell process and add a marker for tracking completion
          if (this.shellProcess) {
            this.shellProcess.write(command + '\r');

            setTimeout(() => {
              if (this.shellProcess) {
                this.shellProcess.write(`echo "CMD_END_$?_${this.activeCommandId}"\r`);
              }
            }, 100);
          } else {
            console.error('Shell process is not available');
            return { success: false, error: 'Shell process not available' };
          }
          
          return { success: true, command, id };
        } catch (error: any) {
          console.error('Error executing terminal command:', error);
          return { success: false, error: error.message };
        }
      })
    );
  }
  
  /**
   * Creates a custom pseudoterminal that captures all output
   * @returns The created terminal
   */
  private createPieVerseTerminal(): vscode.Terminal {
    // Create terminal write emitter
    const writeEmitter = new vscode.EventEmitter<string>();
  
    // Set current working directory
    let currentDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  
    // Create the pseudoterminal
    const terminal: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
  
      open: () => {
        // Optional initial greeting
        writeEmitter.fire('🔌 PieVerse Terminal\r\n');
        writeEmitter.fire(`📁 ${currentDirectory}\r\n`);
  
        // Determine the shell and its arguments.
        // On Windows, use powershell; on macOS/Linux, use zsh as a login shell.
        const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
        // Use '-l' to run zsh as a login shell (so .zshrc is sourced)
        const shellArgs = process.platform === 'win32' ? ['-Command'] : ['-l'];
  
        try {
          // Spawn a persistent shell process with node-pty:
          this.shellProcess = nodePty.spawn(shell, shellArgs, {
            cwd: currentDirectory,
            env: process.env, // Inherit your environment variables
            name: 'xterm-color', // Terminal type
            cols: 80,
            rows: 30
          });

          // Use onData to listen to output from node-pty
          this.shellProcess.onData((data: string) => {
            // Normalize line endings if needed
            const normalizedData = this.normalizeLineEndings(data);
            writeEmitter.fire(normalizedData);
          
            // Check if this is a command completion marker
            const match = normalizedData.match(/CMD_END_(\d+)_([^\r\n]+)/);
            if (match) {
              const exitCode = parseInt(match[1]);
              const cmdId = match[2];
              
              // Command completed
              this.sendTerminalEvent('commandCompleted', {
                id: cmdId,
                command: this.activeCommand,
                exitCode,
                success: exitCode === 0
              });
              
              // Reset active command tracking
              if (cmdId === this.activeCommandId) {
                this.activeCommandId = null;
                this.activeCommand = '';
                this.isReadingCommand = true; // Ready to detect the next command
              }
            } 
            // If we have an active command, capture its output (not completion markers)
            else if (this.activeCommandId && !normalizedData.includes('CMD_END_')) {
              // Regular output chunk
              this.sendTerminalEvent('outputChunk', {
                id: this.activeCommandId,
                text: normalizedData,
                isError: false // We can't distinguish between stdout/stderr with node-pty
              });
            }
          });
    
          // When the shell exits, report it
          this.shellProcess.onExit(({ exitCode }) => {
            writeEmitter.fire(`\r\nShell exited with code ${exitCode}\r\n`);
            this.sendTerminalEvent('terminalClosed');
          });
        } catch (error) {
          console.error('Failed to spawn shell process:', error);
          writeEmitter.fire(`\r\nError: Failed to start shell: ${error}\r\n`);
        }
      },
  
      close: () => {
        if (this.shellProcess) {
          this.shellProcess.kill();
          this.shellProcess = null;
        }
        this.sendTerminalEvent('terminalClosed');
      },
  
      handleInput: (data: string) => {
        // Forward input to the shell
        if (this.shellProcess) {
          this.shellProcess.write(data);
          
          // Track user input for command detection
          if (this.isReadingCommand) {
            // If Enter key is pressed, consider it the end of a command
            if (data === '\r') {
              // Check if we have a command to process
              if (this.userInputBuffer.trim()) {
                const command = this.userInputBuffer.trim();
                
                // Generate a command ID
                this.activeCommandId = Date.now().toString();
                this.activeCommand = command;
                
                // Send command started event
                this.sendTerminalEvent('commandStarted', {
                  id: this.activeCommandId,
                  command: this.activeCommand
                });
                
                // Start detecting command output
                this.isReadingCommand = false;
                
                // After a small delay, send the tracking echo command
                setTimeout(() => {
                  if (this.shellProcess) {
                    this.shellProcess.write(`echo "CMD_END_$?_${this.activeCommandId}"\r`);
                  }
                }, 100);
              }
              
              // Reset buffer for next command
              this.userInputBuffer = '';
            } 
            // Backspace/delete handling
            else if (data === '\x7f' || data === '\x08') {
              this.userInputBuffer = this.userInputBuffer.slice(0, -1);
            } 
            // Normal character input
            else {
              this.userInputBuffer += data;
            }
          }
        }
      }
    };
  
    return vscode.window.createTerminal({
      name: 'PieVerse Terminal',
      pty: terminal
    });
  }
  
  /**
   * Normalize line endings to \r\n for proper terminal display
   */
  private normalizeLineEndings(text: string): string {
    // Replace all lone \n with \r\n, but don't double-up existing \r\n
    return text.replace(/\r?\n/g, '\r\n');
  }

  /**
   * Sends a terminal event to the PieVerse app via WebSocket
   * @param eventType Type of terminal event
   * @param data Event data
   */
  private sendTerminalEvent(eventType: string, data: any = {}): void {
    // Use the established WebSocketService to send messages
    if (this.globals.webSocketService && this.globals.webSocketService.isConnected()) {
      const message = {
        type: 'terminalEvent',
        eventType,
        timestamp: new Date().toISOString(),
        ...data
      };
      
      this.globals.webSocketService.sendData(message);
      
      // Add to sidebar as system message for important events
      if (['commandStarted', 'commandCompleted', 'commandError', 'commandCanceled'].includes(eventType)) {
        if (eventType === 'commandStarted') {
          this.globals.sidebarProvider.addSystemMessage(
            `Terminal: Running command '${data.command}'`, 
            'info'
          );
        } else if (eventType === 'commandCompleted') {
          const statusText = data.success ? 'completed successfully' : `failed with exit code ${data.exitCode}`;
          this.globals.sidebarProvider.addSystemMessage(
            `Terminal: Command '${data.command}' ${statusText}`, 
            data.success ? 'success' : 'error'
          );
        } else if (eventType === 'commandError' || eventType === 'commandCanceled') {
          this.globals.sidebarProvider.addSystemMessage(
            `Terminal: Command '${data.command}' ${eventType === 'commandError' ? 'failed with error' : 'was canceled'}`, 
            'error'
          );
        }
      }
    }
  }
  
  /**
   * Handle terminal-related WebSocket messages
   * @param message The message object
   */
  public handleWebSocketMessage(message: any): void {
    try {
      if (message.type === 'executeTerminalCommand') {
        vscode.commands.executeCommand('pieverse-diff.executeInTerminal', {
          command: message.command,
          id: message.id
        });
      } else if (message.type === 'showTerminal') {
        vscode.commands.executeCommand('pieverse-diff.showTerminal');
      }
    } catch (error) {
      console.error('Error handling terminal WebSocket message:', error);
    }
  }
}