import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
// Import WebSocket as a default import
import WebSocket from 'ws';

let ws: WebSocket | null = null;
let wsReconnectInterval: NodeJS.Timeout | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;
let statusBarItem: vscode.StatusBarItem;

// Define a simple TreeItem for your Diff Dashboard
class DiffTreeItem extends vscode.TreeItem {
  constructor(public readonly label: string, public readonly filePath?: string) {
    super(label);
    
    if (filePath) {
      this.tooltip = filePath;
      this.command = {
        command: 'pieverse-diff.showDiff',
        title: 'Show Diff',
        arguments: [filePath]
      };
    }
  }
}

// Create a basic TreeDataProvider for the diff view
class DiffTreeDataProvider implements vscode.TreeDataProvider<DiffTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DiffTreeItem | undefined | void> =
    new vscode.EventEmitter<DiffTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<DiffTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private diffItems: DiffTreeItem[] = [
    new DiffTreeItem("Connect to PieVerse Desktop")
  ];

  getTreeItem(element: DiffTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DiffTreeItem): Thenable<DiffTreeItem[]> {
    if (!element) {
      // Return top-level items
      return Promise.resolve(this.diffItems);
    }
    // No child elements for now
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateDiffItems(items: DiffTreeItem[]): void {
    this.diffItems = items;
    this.refresh();
  }

  addDiffItem(item: DiffTreeItem): void {
    // Only add if not a duplicate
    if (!this.diffItems.some(existing => existing.label === item.label)) {
      this.diffItems = [item, ...this.diffItems];
      this.refresh();
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('PieVerse Diff Extension activated.');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "PieVerse: Disconnected";
  statusBarItem.command = 'pieverse-diff.connect';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register a TreeDataProvider for the view with id "pieverseDiffView"
  const treeDataProvider = new DiffTreeDataProvider();
  const treeView = vscode.window.registerTreeDataProvider("pieverseDiffView", treeDataProvider);
  context.subscriptions.push(treeView);

  // Get config
  const config = vscode.workspace.getConfiguration('pieverse-diff');
  const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.connect', () => {
      connectWebSocket(wsUrl, treeDataProvider, context);
      vscode.window.showInformationMessage(`Connecting to PieVerse at ${wsUrl}...`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.showDiff', async (filePath) => {
      if (!filePath) return;
      
      try {
        // First try to open the file relative to workspace
        let fileUri: vscode.Uri | undefined;
        
        if (vscode.workspace.workspaceFolders) {
          for (const folder of vscode.workspace.workspaceFolders) {
            const possibleUri = vscode.Uri.joinPath(folder.uri, filePath);
            if (await fileExists(possibleUri)) {
              fileUri = possibleUri;
              break;
            }
          }
        }
        
        // If not found, try as absolute path
        if (!fileUri) {
          fileUri = vscode.Uri.file(filePath);
          if (!await fileExists(fileUri)) {
            vscode.window.showErrorMessage(`File not found: ${filePath}`);
            return;
          }
        }
        
        // Check if we have a temporary file for this path
        const tempUris = context.workspaceState.get<{[key: string]: string}>('pieverseTempUris') || {};
        const tempUri = tempUris[filePath] ? vscode.Uri.parse(tempUris[filePath]) : undefined;
        
        if (tempUri) {
          vscode.commands.executeCommand('vscode.diff', fileUri, tempUri, 'PieVerse: Suggested Changes');
        } else {
          vscode.window.showWarningMessage('No suggested changes available for this file');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error showing diff: ${errorMessage}`);
      }
    })
  );

  // Command to set WebSocket URL
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.setWebSocketUrl', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter PieVerse WebSocket URL',
        value: wsUrl,
        placeHolder: 'ws://localhost:3001'
      });
      
      if (url) {
        await config.update('websocketUrl', url, true);
        vscode.window.showInformationMessage(`WebSocket URL updated to ${url}`);
        
        // Reconnect with new URL
        connectWebSocket(url, treeDataProvider, context);
      }
    })
  );

  // Automatically try to connect on extension activation
  connectWebSocket(wsUrl, treeDataProvider, context);
}

// Check if a file exists
async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

// Generate a random WebSocket key for proper handshake
function generateWebSocketKey(): string {
  const random = crypto.randomBytes(16);
  return random.toString('base64');
}

// Function to create WebSocket connection
function connectWebSocket(wsUrl: string, treeDataProvider: DiffTreeDataProvider, context: vscode.ExtensionContext) {
  if (ws) {
    ws.close();
    ws = null;
  }

  statusBarItem.text = "PieVerse: Connecting...";
  
  try {
    // Create new WebSocket connection
    ws = new WebSocket(wsUrl);

    // Only setup event handlers if ws is not null
    if (ws) {
      ws.on('open', () => {
        statusBarItem.text = "PieVerse: Connected";
        vscode.window.setStatusBarMessage('Connected to PieVerse Desktop', 3000);
        console.log('Connected to PieVerse WebSocket server.');
        
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        
        // Update tree view to show connected status
        treeDataProvider.updateDiffItems([
          new DiffTreeItem(`Connected to ${wsUrl}`, undefined)
        ]);
        
        // Clear any existing reconnect interval
        if (wsReconnectInterval) {
          clearInterval(wsReconnectInterval);
          wsReconnectInterval = null;
        }
      });

      ws.on('message', (data: WebSocket.Data) => {
        console.log('Received data from PieVerse:', data);
        handleSuggestedUpdate(data.toString(), treeDataProvider, context);
      });

      ws.on('close', () => {
        statusBarItem.text = "PieVerse: Disconnected";
        console.log('WebSocket connection closed.');
        
        // Update tree view to show disconnected status
        treeDataProvider.updateDiffItems([
          new DiffTreeItem(`Disconnected from ${wsUrl}`, undefined)
        ]);
        
        // Try to reconnect if not at max attempts
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !wsReconnectInterval) {
          reconnectAttempts++;
          
          statusBarItem.text = `PieVerse: Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;
          
          vscode.window.setStatusBarMessage(
            `Disconnected from PieVerse. Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`, 
            3000
          );
          
          // Set up reconnect interval - try every 5 seconds
          wsReconnectInterval = setInterval(() => {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
              connectWebSocket(wsUrl, treeDataProvider, context);
            } else {
              if (wsReconnectInterval) {
                clearInterval(wsReconnectInterval);
                wsReconnectInterval = null;
              }
              
              statusBarItem.text = "PieVerse: Failed to connect";
              
              vscode.window.showErrorMessage(
                `Failed to connect to PieVerse after ${MAX_RECONNECT_ATTEMPTS} attempts. Please check if the server is running.`
              );
            }
          }, 5000);
        }
      });

      ws.on('error', (error: Error) => {
        statusBarItem.text = "PieVerse: Error";
        console.error('WebSocket error:', error);
        vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
      });
    }
  } catch (error) {
    statusBarItem.text = "PieVerse: Connection failed";
    console.error('Failed to create WebSocket connection:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to connect to PieVerse: ${errorMessage}`);
    
    // Update tree view to show connection error
    treeDataProvider.updateDiffItems([
      new DiffTreeItem(`Connection error: ${errorMessage}`, undefined)
    ]);
  }
}

function handleSuggestedUpdate(suggestedData: string, treeDataProvider: DiffTreeDataProvider, context: vscode.ExtensionContext) {
  try {
    const suggestion = JSON.parse(suggestedData);
    
    // Create a descriptive name for the tree item
    const fileName = suggestion.originalFile.split('/').pop() || suggestion.originalFile.split('\\').pop();
    const shortDesc = suggestion.description && suggestion.description.length > 30 ? 
      `${suggestion.description.substring(0, 30)}...` : 
      (suggestion.description || "No description");
    
    // Extract file extension for proper language identification
    const fileExtension = fileName?.split('.').pop() || 'js';
    
    // Add to tree view
    treeDataProvider.addDiffItem(new DiffTreeItem(
      `${fileName}: ${shortDesc}`,
      suggestion.originalFile
    ));
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'pieverse-diff');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate a unique temp file name based on the original file and timestamp
    const tempFileName = `pieverse-${fileName}-${Date.now()}.${fileExtension}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // Write content to temp file
    fs.writeFileSync(tempFilePath, suggestion.suggestedContent, 'utf8');
    const tempUri = vscode.Uri.file(tempFilePath);
    
    // Store the temp file URI for later use
    const tempUris = context.workspaceState.get<{[key: string]: string}>('pieverseTempUris') || {};
    tempUris[suggestion.originalFile] = tempUri.toString();
    context.workspaceState.update('pieverseTempUris', tempUris);
    
    // Determine the original file URI
    let originalUri: vscode.Uri | undefined;
    
    // First try to find the file in the workspace
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const possibleUri = vscode.Uri.joinPath(folder.uri, suggestion.originalFile);
        try {
          fs.accessSync(possibleUri.fsPath);
          originalUri = possibleUri;
          break;
        } catch (e) {
          // File not found in this workspace folder, continue searching
        }
      }
    }
    
    // If not found in workspace, try as absolute path
    if (!originalUri) {
      originalUri = vscode.Uri.file(suggestion.originalFile);
    }
    
    // Open diff view
    vscode.commands.executeCommand(
      'vscode.diff', 
      originalUri, 
      tempUri, 
      `PieVerse: ${suggestion.description || 'Suggested Update'}`
    );
    
    // Show notification
    vscode.window.showInformationMessage(
      `Received suggested changes for ${fileName}`,
      'View Diff'
    ).then(selection => {
      if (selection === 'View Diff') {
        vscode.commands.executeCommand(
          'vscode.diff', 
          originalUri, 
          tempUri, 
          `PieVerse: ${suggestion.description || 'Suggested Update'}`
        );
      }
    });
  } catch (error) {
    console.error('Error processing suggested update:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error processing suggested update: ${errorMessage}`);
  }
}

export function deactivate() {
  if (ws) {
    ws.close();
  }
  
  if (wsReconnectInterval) {
    clearInterval(wsReconnectInterval);
    wsReconnectInterval = null;
  }
  
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  
  console.log('PieVerse Diff Extension deactivated.');
}