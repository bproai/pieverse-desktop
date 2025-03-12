import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';
import { createPieVersePanel } from '../webview/panelView';
import { fileExists } from '../utils/fileUtils';

/**
 * Register all commands for the extension
 */
export function registerCommands(context: vscode.ExtensionContext, globals: ExtensionGlobals): void {
  // Register command to open integrated panel
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.openPanel', () => {
      if (globals.pieVersePanel) {
        globals.pieVersePanel.reveal();
      } else {
        globals.pieVersePanel = createPieVersePanel(context, globals);
        globals.pieVersePanel.onDidDispose(
          () => { globals.pieVersePanel = undefined; },
          null,
          context.subscriptions
        );
      }
    })
  );

  // Register connect command
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.connect', () => {
      const config = vscode.workspace.getConfiguration('pieverse-diff');
      const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
      
      globals.webSocketService.connect(wsUrl, globals, context);
      vscode.window.showInformationMessage(`Connecting to PieVerse at ${wsUrl}...`);
      
      // If panel is open, update its status
      if (globals.pieVersePanel && globals.pieVersePanel.webview) {
        globals.pieVersePanel.webview.postMessage({
          command: 'connectionStatus',
          status: 'connecting'
        });
      }
    })
  );

  // Register show diff command
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
      const config = vscode.workspace.getConfiguration('pieverse-diff');
      const currentUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
      
      const url = await vscode.window.showInputBox({
        prompt: 'Enter PieVerse WebSocket URL',
        value: currentUrl,
        placeHolder: 'ws://localhost:3001'
      });
      
      if (url) {
        await config.update('websocketUrl', url, true);
        vscode.window.showInformationMessage(`WebSocket URL updated to ${url}`);
        
        // Update panel if open
        if (globals.pieVersePanel && globals.pieVersePanel.webview) {
          globals.pieVersePanel.webview.postMessage({
            command: 'connectionStatus',
            status: 'disconnected'
          });
        }
        
        // Reconnect with new URL
        globals.webSocketService.connect(url, globals, context);
      }
    })
  );

  // Make the original commands point to the new panel
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.openChat', () => {
      vscode.commands.executeCommand('pieverse-diff.openPanel');
    })
  );
}