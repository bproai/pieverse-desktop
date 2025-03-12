import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';
import { getCompletePanelHtml } from './htmlContent';

/**
 * Create and show integrated panel with chat and system messages
 */
export function createPieVersePanel(context: vscode.ExtensionContext, globals: ExtensionGlobals): vscode.WebviewPanel {
  // Create and show panel
  const panel = vscode.window.createWebviewPanel(
    'pieversePanel',
    'PieVerse',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'resources')]
    }
  );

  // Get path to resource on disk
  const cssUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'resources', 'style.css')
  );

  // Set the HTML content
  panel.webview.html = getCompletePanelHtml(cssUri.toString());

  // Set up message handling
  setupMessageHandlers(panel, context, globals);

  return panel;
}

/**
 * Set up message handlers for the webview panel
 */
function setupMessageHandlers(
  panel: vscode.WebviewPanel, 
  context: vscode.ExtensionContext, 
  globals: ExtensionGlobals
): void {
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'sendMessage':
          handleSendMessage(message.text, panel, globals);
          return;
        case 'connectToPieVerse':
          handleConnect(panel, context, globals);
          return;
        case 'setWebSocketUrl':
          vscode.commands.executeCommand('pieverse-diff.setWebSocketUrl');
          return;
        case 'showDiff':
          if (message.filePath) {
            vscode.commands.executeCommand('pieverse-diff.showDiff', message.filePath);
          }
          return;
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Handle send message request from webview
 */
function handleSendMessage(text: string, panel: vscode.WebviewPanel, globals: ExtensionGlobals): void {
  if (globals.webSocketService.sendMessage(text)) {
    // Message sent successfully
  } else {
    vscode.window.showErrorMessage('WebSocket is not connected. Please connect to PieVerse first.');
    
    // Update the UI to show disconnected status
    panel.webview.postMessage({ 
      command: 'connectionStatus', 
      status: 'disconnected'
    });
  }
}

/**
 * Handle connect request from webview
 */
function handleConnect(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, globals: ExtensionGlobals): void {
  const config = vscode.workspace.getConfiguration('pieverse-diff');
  const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
  globals.webSocketService.connect(wsUrl, globals, context);
  panel.webview.postMessage({ command: 'connectionAttempt', status: 'connecting' });
}