// pieverse-diff-extension/src/services/webSocketService.ts
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { ExtensionGlobals } from '../extension';
import { DiffTreeItem } from '../tree/diffTreeProvider';
import { handleSuggestedUpdate } from './diffService';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private wsReconnectInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectAttempts = 0;

  /**
   * Connect to the WebSocket server
   */
  public connect(wsUrl: string, globals: ExtensionGlobals, context: vscode.ExtensionContext): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    globals.statusBarItem.text = "$(sync~spin) PieVerse";
    globals.statusBarItem.tooltip = "PieVerse: Connecting...";
    
    // Update sidebar status
    globals.sidebarProvider.updateConnectionStatus('connecting');
    
    try {
      // Create new WebSocket connection
      this.ws = new WebSocket(wsUrl);

      // Only setup event handlers if ws is not null
      if (this.ws) {
        this.ws.on('open', () => this.onOpen(wsUrl, globals));
        this.ws.on('message', (data: WebSocket.Data) => this.onMessage(data, globals, context));
        this.ws.on('close', () => this.onClose(wsUrl, globals, context));
        this.ws.on('error', (error: Error) => this.onError(error, globals));
      }
    } catch (error) {
      this.handleConnectionError(error, wsUrl, globals);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.wsReconnectInterval) {
      clearInterval(this.wsReconnectInterval);
      this.wsReconnectInterval = null;
    }
  }

  /**
   * Send a message to the WebSocket server
   */
  public sendMessage(message: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageObj = JSON.stringify({
        type: 'chat',
        content: message
      });
      this.ws.send(messageObj);
      return true;
    }
    return false;
  }
  
  /**
   * Send arbitrary data to the WebSocket server
   */
  public sendData(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }
  
  /**
   * Check if WebSocket is currently connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Handle WebSocket open event
   */
  private onOpen(wsUrl: string, globals: ExtensionGlobals): void {
    globals.statusBarItem.text = "$(check) PieVerse";
    globals.statusBarItem.tooltip = "PieVerse: Connected";
    vscode.window.setStatusBarMessage('Connected to PieVerse Desktop', 3000);
    console.log('Connected to PieVerse WebSocket server.');
    
    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;
    
    // Update tree view to show connected status
    globals.treeDataProvider.updateDiffItems([
      new DiffTreeItem(`Connected to ${wsUrl}`)
    ]);
    
    // Update sidebar status
    globals.sidebarProvider.updateConnectionStatus('connected');
    
    // Clear any existing reconnect interval
    if (this.wsReconnectInterval) {
      clearInterval(this.wsReconnectInterval);
      this.wsReconnectInterval = null;
    }
    
    // Send initial diagnostics when connection is established
    // Use a slight delay to ensure the connection is fully established
    if (globals.diagnosticsService) {
      // Allow a brief delay before sending diagnostics
      setTimeout(() => {
        // Double check that we're still connected
        if (this.isConnected()) {
          globals.diagnosticsService.sendAllDiagnostics();
        }
      }, 1000);
    }
  }

  /**
   * Handle WebSocket message event
   */
  private onMessage(data: WebSocket.Data, globals: ExtensionGlobals, context: vscode.ExtensionContext): void {
    console.log('Received data from PieVerse:', data);
    
    // Add these debug lines
    if (Buffer.isBuffer(data)) {
      console.log('Data is a Buffer, contents as string:', data.toString());
    }
    
    const dataStr = data.toString();
    console.log('Data as string:', dataStr);
    
    try {
      // Try to parse as JSON to determine message type
      const jsonData = JSON.parse(dataStr);
      console.log('Successfully parsed JSON data:', jsonData);
      
      if (jsonData.type === 'chat') {
        try {
          // Try to parse the content as JSON to see if it's a command
          const contentJson = JSON.parse(jsonData.content);
          console.log('Successfully parsed jsonData.content data:', contentJson);
          if (contentJson.type === 'requestDiagnostics') {
            console.log('Received diagnostics request via chat');
            if (globals.diagnosticsService) {
              globals.diagnosticsService.sendAllDiagnostics();
            }
            return;
          }
          else if (contentJson.type === 'showTerminal') {
            // Handle terminal commands
            if (globals.terminalService) {
              globals.terminalService.handleWebSocketMessage(contentJson);
            }
            return;
          }
          else if (contentJson.type === 'executeTerminalCommand') {
            console.log('Received execute terminal command via chat');
            if (globals.terminalService) {
              globals.terminalService.handleWebSocketMessage(contentJson);
            }
            return;
          }
          else if (contentJson.type === 'applyCodeAction') {
            console.log('Received code action request via chat');
            this.handleCodeAction(contentJson, globals);
            return;
          }
          else if (contentJson.type === 'openDiagnosticLink') {
            console.log('Received diagnostic link request via chat');
            this.handleDiagnosticLink(contentJson.target);
            return;
          }
        } catch (e) {
          // Not valid JSON, treat as normal chat message
        }

        this.handleChatMessage(jsonData, globals);
      } else if (jsonData.type === 'requestDiagnostics') {
        // Handle explicit diagnostics request
        if (globals.diagnosticsService) {
          globals.diagnosticsService.sendAllDiagnostics();
        }
      } else if (jsonData.type === 'executeTerminalCommand' || jsonData.type === 'showTerminal') {
        // Handle terminal commands
        if (globals.terminalService) {
          globals.terminalService.handleWebSocketMessage(jsonData);
        }
      } else if (jsonData.type === 'applyCodeAction') {
        // Handle code action request
        console.log('Received code action request');
        this.handleCodeAction(jsonData, globals);
      } else if (jsonData.type === 'openDiagnosticLink') {
        // Handle diagnostic link click
        console.log('Received diagnostic link request');
        this.handleDiagnosticLink(jsonData.target);
      } else if (jsonData.originalFile && jsonData.suggestedContent) {
        // Handle as diff suggestion
        console.log('Handling as diff suggestion with original file:', jsonData.originalFile);
        handleSuggestedUpdate(jsonData, globals, context);
      } else if (jsonData.type === 'openFile') {
        // Handle opening a file
        if (jsonData.file) {
          // Create a URI from the file path
          const fileUri = vscode.Uri.file(jsonData.file);
          
          // Position to move the cursor to
          const position = new vscode.Position(
            jsonData.line || 0, 
            jsonData.character || 0
          );
          
          // Open the document in the specified view column (1 = left, 2 = right)
          vscode.workspace.openTextDocument(fileUri).then(document => {
            vscode.window.showTextDocument(document, {
              selection: new vscode.Range(position, position),
              viewColumn: jsonData.viewColumn || vscode.ViewColumn.Active,
              preserveFocus: false
            });
          });
        }
      } else {
        console.log('Unknown message format:', jsonData);
      }
    } catch (e) {
      // If not valid JSON or doesn't have expected format,
      console.error('Error parsing JSON:', e);
      
      // Try handling as a direct diff suggestion
      try {
        const parsedData = JSON.parse(dataStr);
        console.log('Attempting to handle as raw diff data:', parsedData);
        handleSuggestedUpdate(parsedData, globals, context);
      } catch (parseError) {
        console.error('Error handling as raw diff data:', parseError);
      }
    }
  }

  /**
   * Handle code action application
   */
  private async handleCodeAction(data: any, globals: ExtensionGlobals): Promise<void> {
    try {
      if (!data.file || !data.codeAction) {
        console.error('Invalid code action request data:', data);
        this.sendCodeActionResult(false, 'Invalid code action request data');
        return;
      }

      const file = data.file;
      const codeAction = data.codeAction;
      
      console.log(`Applying code action "${codeAction.title}" to ${file}`);
      
      // Get the document and its URI
      const uri = vscode.Uri.file(file);
      
      // Make sure document is open
      let document;
      try {
        document = await vscode.workspace.openTextDocument(uri);
      } catch (e) {
        console.error('Failed to open document:', e);
        this.sendCodeActionResult(false, `Failed to open document: ${e}`);
        return;
      }
      
      // Find the matching code action in VS Code
      const diagnostics = vscode.languages.getDiagnostics(uri);
      
      // For each diagnostic, try to find and apply the matching code action
      let applied = false;
      
      for (const diagnostic of diagnostics) {
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          uri,
          diagnostic.range
        ) || [];
        
        // Find the matching action by title
        const matchingAction = actions.find(action => action.title === codeAction.title);
        
        if (matchingAction) {
          // Apply the code action
          if (matchingAction.edit) {
            const editResult = await vscode.workspace.applyEdit(matchingAction.edit);
            if (!editResult) {
              console.error('Failed to apply workspace edit');
              this.sendCodeActionResult(false, 'Failed to apply workspace edit');
              return;
            }
          }
          
          if (matchingAction.command) {
            await vscode.commands.executeCommand(
              matchingAction.command.command,
              ...(matchingAction.command.arguments || [])
            );
          }
          
          applied = true;
          break;
        }
      }
      
      if (applied) {
        console.log('Successfully applied code action');
        this.sendCodeActionResult(true, `Applied: ${codeAction.title}`);
        
        // Refresh diagnostics after applying a code action
        setTimeout(() => {
          if (globals.diagnosticsService) {
            globals.diagnosticsService.sendAllDiagnostics();
          }
        }, 500);
      } else {
        console.log('No matching code action found');
        this.sendCodeActionResult(false, `Could not find code action: ${codeAction.title}`);
      }
    } catch (error) {
      console.error('Error applying code action:', error);
      this.sendCodeActionResult(false, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Send code action result back to client
   */
  private sendCodeActionResult(success: boolean, message: string): void {
    this.sendData({
      type: 'codeActionResult',
      success,
      message
    });
  }
  
  /**
   * Handle diagnostic link clicks
   */
  private async handleDiagnosticLink(target: string): Promise<void> {
    try {
      if (!target) {
        console.error('No target provided for diagnostic link');
        return;
      }
      
      console.log(`Opening diagnostic link: ${target}`);
      
      // For diagnostic links that are URIs, try to open them
      if (target.startsWith('file:') || target.startsWith('vscode:')) {
        // For file URIs, convert to a path that VSCode can open
        if (target.startsWith('file:')) {
          const filePath = decodeURIComponent(target.replace(/^file:\/\//, ''));
          const uri = vscode.Uri.file(filePath);
          await vscode.commands.executeCommand('vscode.open', uri);
        } else {
          const uri = vscode.Uri.parse(target);
          await vscode.commands.executeCommand('vscode.open', uri);
        }
      } 
      // For Rust compiler diagnostics, show them in the problems panel
      else if (target.includes('rustc')) {
        await vscode.commands.executeCommand('workbench.actions.view.problems');
        
        // Try to expand the diagnostic (rust-analyzer specific)
        try {
          await vscode.commands.executeCommand('rust-analyzer.expandMacro');
        } catch (e) {
          // Command may not exist, ignore errors
          console.log('rust-analyzer.expandMacro command not available');
        }
      }
      // For other links, try to open in browser
      else {
        await vscode.env.openExternal(vscode.Uri.parse(target));
      }
    } catch (error) {
      console.error('Error handling diagnostic link:', error);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private onClose(wsUrl: string, globals: ExtensionGlobals, context: vscode.ExtensionContext): void {
    globals.statusBarItem.text = "$(warning) PieVerse";
    globals.statusBarItem.tooltip = "PieVerse: Disconnected";
    console.log('WebSocket connection closed.');
    
    // Update tree view to show disconnected status
    globals.treeDataProvider.updateDiffItems([
      new DiffTreeItem(`Disconnected from ${wsUrl}`)
    ]);
    
    // Update sidebar status
    globals.sidebarProvider.updateConnectionStatus('disconnected');
    
    // Try to reconnect if not at max attempts
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS && !this.wsReconnectInterval) {
      this.reconnectAttempts++;
      
      globals.statusBarItem.text = `$(sync~spin) PieVerse`;
      globals.statusBarItem.tooltip = `PieVerse: Reconnecting (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`;
      
      vscode.window.setStatusBarMessage(
        `Disconnected from PieVerse. Attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}...`, 
        3000
      );
      
      // Set up reconnect interval - try every 5 seconds
      this.wsReconnectInterval = setInterval(() => {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
          this.connect(wsUrl, globals, context);
        } else {
          if (this.wsReconnectInterval) {
            clearInterval(this.wsReconnectInterval);
            this.wsReconnectInterval = null;
          }
          
          globals.statusBarItem.text = "$(error) PieVerse";
          globals.statusBarItem.tooltip = "PieVerse: Failed to connect";
          
          // Update sidebar status
          globals.sidebarProvider.updateConnectionStatus('disconnected');
          
          vscode.window.showErrorMessage(
            `Failed to connect to PieVerse after ${this.MAX_RECONNECT_ATTEMPTS} attempts. Please check if the server is running.`
          );
        }
      }, 5000);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private onError(error: Error, globals: ExtensionGlobals): void {
    globals.statusBarItem.text = "$(error) PieVerse";
    globals.statusBarItem.tooltip = "PieVerse: Error";
    console.error('WebSocket error:', error);
    vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
    
    // Update sidebar status
    globals.sidebarProvider.updateConnectionStatus('disconnected');
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: unknown, wsUrl: string, globals: ExtensionGlobals): void {
    globals.statusBarItem.text = "$(error) PieVerse";
    globals.statusBarItem.tooltip = "PieVerse: Connection failed";
    console.error('Failed to create WebSocket connection:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to connect to PieVerse: ${errorMessage}`);
    
    // Update sidebar status
    globals.sidebarProvider.updateConnectionStatus('disconnected');
    
    // Update tree view to show connection error
    globals.treeDataProvider.updateDiffItems([
      new DiffTreeItem(`Connection error: ${errorMessage}`)
    ]);
  }

  /**
   * Handle chat messages
   */
  private handleChatMessage(jsonData: any, globals: ExtensionGlobals): void {
    // Add message to chat panel in sidebar
    globals.sidebarProvider.addChatMessage(jsonData.content, 'PieVerse');
  }
}