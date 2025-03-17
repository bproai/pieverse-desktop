// src/services/terminalService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { ExtensionGlobals } from '../extension';

/**
 * Service to handle terminal functionality
 */
export class TerminalService {
  private context: vscode.ExtensionContext;
  private globals: ExtensionGlobals;
  private pieVerseTerminal: vscode.Terminal | null = null;
  private activeCommandId: string | null = null;
  private activeCommand = '';
  
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
          
          // Make sure terminal exists and is shown
          if (!this.pieVerseTerminal || this.pieVerseTerminal.exitStatus !== undefined) {
            await vscode.commands.executeCommand('pieverse-diff.showTerminal');
          } else {
            this.pieVerseTerminal.show();
          }
          
          // Send the command to the terminal character by character
          for (const char of command) {
            // Small delay to ensure characters are processed in order
            await new Promise(resolve => setTimeout(resolve, 5));
            vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: char });
          }
          
          // Send Enter to execute
          await new Promise(resolve => setTimeout(resolve, 10));
          vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: '\r' });
          
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
    
    // Current working directory
    let currentDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    
    // Create the pseudoterminal
    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      
      open: () => {
        // Initial terminal greeting
        writeEmitter.fire('🔌 PieVerse Terminal\r\n');
        writeEmitter.fire(`📁 ${currentDirectory}\r\n`);
        writeEmitter.fire('$ ');
      },
      
      close: () => {
        // Clean up if needed
        this.sendTerminalEvent('terminalClosed');
      },
      
      // Handle input from the terminal UI
      handleInput: async (data: string) => {
        // Check for control characters
        if (data === '\r') { // Enter key
          // Echo the newline
          writeEmitter.fire('\r\n');
          
          if (this.activeCommand.trim()) {
            // Set command ID and store command
            this.activeCommandId = Date.now().toString();
            const fullCommand = this.activeCommand.trim();
            
            // Handle cd commands specially to track directory
            if (fullCommand.startsWith('cd ')) {
              try {
                const targetDir = fullCommand.substring(3).trim();
                let newDir: string;
                
                // Handle relative and absolute paths
                if (path.isAbsolute(targetDir)) {
                  newDir = targetDir;
                } else {
                  newDir = path.resolve(currentDirectory, targetDir);
                }
                
                // Check if directory exists
                if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
                  currentDirectory = newDir;
                  writeEmitter.fire(`📁 ${currentDirectory}\r\n`);
                  writeEmitter.fire('$ ');
                  
                  // Notify PieVerse of directory change
                  this.sendTerminalEvent('directoryChanged', {
                    directory: currentDirectory
                  });
                } else {
                  writeEmitter.fire(`cd: ${targetDir}: No such directory\r\n`);
                  writeEmitter.fire('$ ');
                }
              } catch (error: any) {
                writeEmitter.fire(`Error: ${error.message}\r\n`);
                writeEmitter.fire('$ ');
              }
              
              // Reset command
              this.activeCommand = '';
              return;
            }
            
            // Send command started event
            this.sendTerminalEvent('commandStarted', {
              id: this.activeCommandId,
              command: fullCommand,
              directory: currentDirectory
            });
            
            // Execute command
            try {
              // Determine shell to use
              const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
              const shellArgs = process.platform === 'win32' ? ['-Command'] : ['-c'];
              
              const proc = spawn(shell, [...shellArgs, fullCommand], {
                cwd: currentDirectory,
                shell: true
              });
              
              let outputText = '';
              
              // Capture standard output
              proc.stdout.on('data', (data: Buffer) => {
                const normalizedText = this.normalizeLineEndings(data.toString());
                outputText += normalizedText;
                writeEmitter.fire(normalizedText);
                
                // Send real-time update
                this.sendTerminalEvent('outputChunk', {
                  id: this.activeCommandId,
                  text: normalizedText,
                  isError: false
                });
              });
              
              // Capture error output
              proc.stderr.on('data', (data: Buffer) => {
                const normalizedText = this.normalizeLineEndings(data.toString());
                outputText += normalizedText;
                writeEmitter.fire(normalizedText);
                
                // Send real-time update
                this.sendTerminalEvent('outputChunk', {
                  id: this.activeCommandId,
                  text: normalizedText,
                  isError: true
                });
              });
              
              // Handle command completion
              proc.on('close', (code: number | null) => {
                // Send command completion event
                this.sendTerminalEvent('commandCompleted', {
                  id: this.activeCommandId,
                  command: fullCommand,
                  output: outputText,
                  exitCode: code,
                  success: code === 0
                });
                
                // Reset for next command
                writeEmitter.fire('\r\n$ ');
                this.activeCommand = '';
              });
              
              // Handle process errors
              proc.on('error', (error: Error) => {
                const errorMessage = this.normalizeLineEndings(`\r\nError: ${error.message}\r\n`);
                writeEmitter.fire(errorMessage);
                
                // Send error event
                this.sendTerminalEvent('commandError', {
                  id: this.activeCommandId,
                  command: fullCommand,
                  error: error.message
                });
                
                // Reset for next command
                writeEmitter.fire('$ ');
                this.activeCommand = '';
              });
            } catch (error: any) {
              // Handle execution error
              const errorMessage = this.normalizeLineEndings(`\r\nError: ${error.message}\r\n`);
              writeEmitter.fire(errorMessage);
              
              // Send error event
              this.sendTerminalEvent('commandError', {
                id: this.activeCommandId,
                command: fullCommand,
                error: error.message
              });
              
              // Reset for next command
              writeEmitter.fire('$ ');
              this.activeCommand = '';
            }
          } else {
            // Empty command, just show prompt
            writeEmitter.fire('$ ');
          }
        } else if (data === '\x7f' || data === '\x08') { // Backspace
          if (this.activeCommand.length > 0) {
            // Remove last character from command
            this.activeCommand = this.activeCommand.slice(0, -1);
            // Emulate backspace in terminal (move back, space, move back)
            writeEmitter.fire('\b \b');
          }
        } else if (data === '\x03') { // Ctrl+C
          writeEmitter.fire('^C\r\n');
          
          if (this.activeCommandId) {
            // Send command canceled event
            this.sendTerminalEvent('commandCanceled', {
              id: this.activeCommandId,
              command: this.activeCommand
            });
          }
          
          // Reset for next command
          writeEmitter.fire('$ ');
          this.activeCommand = '';
        } else {
          // Regular character input - add to command and echo
          this.activeCommand += data;
          writeEmitter.fire(data);
        }
      }
    };
    
    // Create and return the terminal
    return vscode.window.createTerminal({ 
      name: 'PieVerse Terminal',
      pty
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