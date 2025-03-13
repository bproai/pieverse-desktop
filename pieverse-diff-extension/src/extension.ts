import * as vscode from 'vscode';
import { DiffTreeDataProvider } from './tree/diffTreeProvider';
import { registerCommands } from './commands/registerCommands';
import { WebSocketService } from './services/webSocketService';
import { DiffActionsService } from './services/diffActionsService';
import { ensureResourcesExist } from './utils/fileUtils';
import { PieVerseSidebarProvider } from './webview/sidebarPanel';

// Global variables accessible throughout the extension
export interface ExtensionGlobals {
  statusBarItem: vscode.StatusBarItem;
  webSocketService: WebSocketService;
  treeDataProvider: DiffTreeDataProvider;
  sidebarProvider: PieVerseSidebarProvider;
  diffActionsService: DiffActionsService;
}

// Create and initialize the extension globals
export function activate(context: vscode.ExtensionContext) {
  console.log('PieVerse Diff Extension activated.');
  
  // Ensure resources exist
  ensureResourcesExist(context);

  // Initialize sidebar provider
  const sidebarProvider = new PieVerseSidebarProvider(context.extensionUri, {} as ExtensionGlobals, context);

  // Create and initialize the extension globals
  const globals: ExtensionGlobals = {
    statusBarItem: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
    webSocketService: new WebSocketService(),
    treeDataProvider: new DiffTreeDataProvider(),
    sidebarProvider: sidebarProvider,
    diffActionsService: {} as DiffActionsService
  };
  
  // Update the sidebarProvider with the globals reference
  (sidebarProvider as any)._globals = globals;

  // Initialize status bar item
  globals.statusBarItem.text = "$(radio-tower) PieVerse";
  globals.statusBarItem.command = 'pieverse-diff.focus';
  globals.statusBarItem.tooltip = "Show PieVerse Panel";
  globals.statusBarItem.show();
  context.subscriptions.push(globals.statusBarItem);

  // Initialize diff actions service
  globals.diffActionsService = new DiffActionsService(context, globals);

  // Register the sidebar provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('pieverseDiffView', sidebarProvider)
  );

  // Register all commands
  registerCommands(context, globals);

  // Get the WebSocket URL from configuration
  const config = vscode.workspace.getConfiguration('pieverse-diff');
  const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';

  // Automatically try to connect on extension activation
  globals.webSocketService.connect(wsUrl, globals, context);
}

export function deactivate() {
  // Nothing to clean up that wouldn't be cleaned up automatically
}