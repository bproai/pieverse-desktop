import * as vscode from 'vscode';
import { DiffTreeDataProvider } from './tree/diffTreeProvider';
import { registerCommands } from './commands/registerCommands';
import { WebSocketService } from './services/webSocketService';
import { ensureResourcesExist } from './utils/fileUtils';

// Global variables accessible throughout the extension
export interface ExtensionGlobals {
  statusBarItem: vscode.StatusBarItem;
  pieVersePanel: vscode.WebviewPanel | undefined;
  webSocketService: WebSocketService;
  treeDataProvider: DiffTreeDataProvider;
}

// Create and initialize the extension globals
const globals: ExtensionGlobals = {
  statusBarItem: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
  pieVersePanel: undefined,
  webSocketService: new WebSocketService(),
  treeDataProvider: new DiffTreeDataProvider()
};

export function activate(context: vscode.ExtensionContext) {
  console.log('PieVerse Diff Extension activated.');
  
  // Ensure resources exist
  ensureResourcesExist(context);

  // Initialize status bar item
  globals.statusBarItem.text = "$(radio-tower) PieVerse";
  globals.statusBarItem.command = 'pieverse-diff.openPanel';
  globals.statusBarItem.tooltip = "Open PieVerse Panel";
  globals.statusBarItem.show();
  context.subscriptions.push(globals.statusBarItem);

  // Register the tree data provider
  const treeView = vscode.window.registerTreeDataProvider(
    "pieverseDiffView", 
    globals.treeDataProvider
  );
  context.subscriptions.push(treeView);

  // Register all commands
  registerCommands(context, globals);

  // Get the WebSocket URL from configuration
  const config = vscode.workspace.getConfiguration('pieverse-diff');
  const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';

  // Automatically try to connect on extension activation
  globals.webSocketService.connect(wsUrl, globals, context);
}

export function deactivate() {
  // Close the WebSocket connection if active
  globals.webSocketService.disconnect();
  
  // Dispose of the status bar item
  if (globals.statusBarItem) {
    globals.statusBarItem.dispose();
  }
  
  // Dispose of the panel if it exists
  if (globals.pieVersePanel) {
    globals.pieVersePanel.dispose();
  }
  
  console.log('PieVerse Diff Extension deactivated.');
}