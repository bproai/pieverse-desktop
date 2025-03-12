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
    
    // Update panel if open
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'connectionStatus',
        status: 'connecting'
      });
    }
    
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
      new DiffTreeItem(`Connected to ${wsUrl}`)  // Change "Disconnected" to "Connected"
    ]);
    
    // Update panel if open
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'connectionStatus',
        status: 'connected'
      });
    }
    
    // Clear any existing reconnect interval
    if (this.wsReconnectInterval) {
      clearInterval(this.wsReconnectInterval);
      this.wsReconnectInterval = null;
    }
  }

  /**
   * Handle WebSocket message event
   */
  private onMessage(data: WebSocket.Data, globals: ExtensionGlobals, context: vscode.ExtensionContext): void {
    console.log('Received data from PieVerse:', data);
    const dataStr = data.toString();
    
    try {
      // Try to parse as JSON to determine message type
      const jsonData = JSON.parse(dataStr);
      
      if (jsonData.type === 'chat') {
        this.handleChatMessage(jsonData, globals);
      } else if (jsonData.originalFile && jsonData.suggestedContent) {
        // Handle as diff suggestion
        handleSuggestedUpdate(jsonData, globals, context);
      }
    } catch (e) {
      // If not valid JSON or doesn't have expected format,
      // try handling as a diff suggestion
      try {
        handleSuggestedUpdate(JSON.parse(dataStr), globals, context);
      } catch (parseError) {
        console.error('Error parsing message:', parseError);
      }
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
      new DiffTreeItem(`Disconnected from ${wsUrl}`)  // Remove undefined parameter
    ]);
    
    // Update panel if open
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'connectionStatus',
        status: 'disconnected'
      });
    }
    
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
          
          // Update panel if open
          if (globals.pieVersePanel && globals.pieVersePanel.webview) {
            globals.pieVersePanel.webview.postMessage({
              command: 'connectionStatus',
              status: 'disconnected'
            });
          }
          
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
    
    // Update panel if open
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'connectionStatus',
        status: 'disconnected'
      });
    }
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
    
    // Update panel if open
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'connectionStatus',
        status: 'disconnected'
      });
    }
    
    // Update tree view to show connection error
    globals.treeDataProvider.updateDiffItems([
      new DiffTreeItem(`Connection error: ${errorMessage}`)  // Remove undefined parameter
    ]);
  }

  /**
   * Handle chat messages
   */
  private handleChatMessage(jsonData: any, globals: ExtensionGlobals): void {
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({ 
        command: 'receiveMessage', 
        text: jsonData.content,
        sender: 'PieVerse'
      });
      
      // If panel isn't open, show notification with option to open it
      if (!globals.pieVersePanel.visible) {
        vscode.window.showInformationMessage(
          `New message from PieVerse: ${jsonData.content}`, 
          'Open Panel'
        ).then(selection => {
          if (selection === 'Open Panel') {
            vscode.commands.executeCommand('pieverse-diff.openPanel');
          }
        });
      }
    } else {
      // If panel doesn't exist, show notification with option to open it
      vscode.window.showInformationMessage(
        `New message from PieVerse: ${jsonData.content}`, 
        'Open Panel'
      ).then(selection => {
        if (selection === 'Open Panel') {
          vscode.commands.executeCommand('pieverse-diff.openPanel');
        }
      });
    }
  }
}