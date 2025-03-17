import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';
import { fileExists } from '../utils/fileUtils';
import { getSettingsPanelHtml } from '../webview/htmlContent';

/**
 * Register all commands for the extension
 */
export function registerCommands(context: vscode.ExtensionContext, globals: ExtensionGlobals): void {
  // Register focus command
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.focus', () => {
      vscode.commands.executeCommand('pieverseDiffView.focus');
    })
  );

  // Register connect command
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.connect', () => {
      const config = vscode.workspace.getConfiguration('pieverse-diff');
      const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
      
      globals.webSocketService.connect(wsUrl, globals, context);
      vscode.window.showInformationMessage(`Connecting to PieVerse at ${wsUrl}...`);
    })
  );

  // Register a command to show the most recently received diff
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.showSingleDiff', async (filePath?: string) => {
      try {
        console.log("showSingleDiff command called with filePath:", filePath);
        
        let originalUriString: string | undefined;
        let tempUriString: string | undefined;
        let description: string | undefined;
        
        // First try to get specific file diff if filePath is provided
        if (filePath) {
          console.log(`Looking for diff pairs for specific file: ${filePath}`);
          const diffPairs = context.globalState.get<{[key: string]: {original: string, temp: string, desc: string}}>('pieverseDiffPairs');
          console.log("Current diffPairs in globalState:", JSON.stringify(diffPairs));
          
          if (diffPairs && diffPairs[filePath]) {
            originalUriString = diffPairs[filePath].original;
            tempUriString = diffPairs[filePath].temp;
            description = diffPairs[filePath].desc;
            console.log(`Found diff pair for ${filePath}`);
          } else {
            console.log(`No diff pair found for ${filePath}, checking workspaceState`);
            
            // If not found in diffPairs, try the old method
            const tempUris = context.workspaceState.get<{[key: string]: string}>('pieverseTempUris');
            console.log("tempUris from workspaceState:", JSON.stringify(tempUris));
            
            if (tempUris && tempUris[filePath]) {
              // Find original URI for the file
              let originalUri: vscode.Uri | undefined;
              if (vscode.workspace.workspaceFolders) {
                for (const folder of vscode.workspace.workspaceFolders) {
                  const possibleUri = vscode.Uri.joinPath(folder.uri, filePath);
                  console.log(`Trying workspace path: ${possibleUri.fsPath}`);
                  if (await fileExists(possibleUri)) {
                    originalUri = possibleUri;
                    console.log(`Found file in workspace: ${originalUri.toString()}`);
                    break;
                  }
                }
              }
              
              if (!originalUri) {
                originalUri = vscode.Uri.file(filePath);
                console.log(`Using absolute path: ${originalUri.toString()}`);
              }
              
              originalUriString = originalUri.toString();
              tempUriString = tempUris[filePath];
              description = 'Suggested Changes';
              console.log(`Constructed diff pair from workspaceState - original: ${originalUriString}, temp: ${tempUriString}`);
            }
          }
        }
        
        // If we still don't have URIs, try the global values
        if (!originalUriString || !tempUriString) {
          console.log("No specific file diff found, trying global diff values");
          originalUriString = context.globalState.get<string>('pieverseDiffOriginalUri');
          tempUriString = context.globalState.get<string>('pieverseDiffTempUri');
          description = context.globalState.get<string>('pieverseDiffDescription') || 'Suggested Changes';
          console.log(`Global values - original: ${originalUriString}, temp: ${tempUriString}`);
        }
        
        if (!originalUriString || !tempUriString) {
          console.log("No diff information available in any storage");
          vscode.window.showErrorMessage('No diff information available');
          return;
        }
        
        const originalUri = vscode.Uri.parse(originalUriString);
        const tempUri = vscode.Uri.parse(tempUriString);
        
        console.log(`Showing diff between ${originalUri.toString()} and ${tempUri.toString()}`);
        console.log(`Description: ${description}`);
        
        // First, save the current diff URIs so diffActionsService can access them
        globals.diffActionsService.setCurrentDiff(originalUri, tempUri, description || 'Suggested Changes');
        
        // Use executeCommand with correct parameters and title
        await vscode.commands.executeCommand(
          'vscode.diff',
          originalUri,
          tempUri,
          `PieVerse: ${description}`
        );

        // Explicitly show the diff actions after a short delay to ensure the diff view is fully loaded
        setTimeout(() => {
          vscode.commands.executeCommand('pieverse-diff.showDiffActions');
        }, 500);
      } catch (error) {
        console.error('Error in showSingleDiff:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error showing diff: ${errorMessage}`);
      }
    })
  );

  // Register show diff command (for tree view and sidebar clicks)
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.showDiff', async (filePath) => {
      if (!filePath) {
        console.log("pieverse-diff.showDiff called without filePath");
        return;
      }
      
      console.log(`pieverse-diff.showDiff called with filePath: ${filePath}`);
      
      try {
        // First try to open the file relative to workspace
        let fileUri: vscode.Uri | undefined;
        
        if (vscode.workspace.workspaceFolders) {
          for (const folder of vscode.workspace.workspaceFolders) {
            const possibleUri = vscode.Uri.joinPath(folder.uri, filePath);
            console.log(`Trying workspace path: ${possibleUri.fsPath}`);
            if (await fileExists(possibleUri)) {
              fileUri = possibleUri;
              console.log(`Found file in workspace: ${fileUri.toString()}`);
              break;
            }
          }
        }
        
        // If not found, try as absolute path
        if (!fileUri) {
          fileUri = vscode.Uri.file(filePath);
          console.log(`Using absolute path: ${fileUri.toString()}`);
          
          if (!await fileExists(fileUri)) {
            console.log(`File not found: ${filePath}`);
            vscode.window.showErrorMessage(`File not found: ${filePath}`);
            return;
          }
        }
        
        // Try the newer method first
        const diffPairs = context.globalState.get<{[key: string]: {original: string, temp: string, desc: string}}>('pieverseDiffPairs');
        console.log("Looking in diffPairs:", JSON.stringify(diffPairs));
        
        if (diffPairs && diffPairs[filePath]) {
          const tempUri = vscode.Uri.parse(diffPairs[filePath].temp);
          console.log(`Found in diffPairs. Original: ${fileUri.toString()}, Temp: ${tempUri.toString()}`);
          
          // Set the URIs in diffActionsService before showing diff
          globals.diffActionsService.setCurrentDiff(fileUri, tempUri, diffPairs[filePath].desc);
          
          await vscode.commands.executeCommand(
            'vscode.diff',
            fileUri,
            tempUri,
            `PieVerse: ${diffPairs[filePath].desc}`
          );
          
          // Explicitly show the diff actions
          setTimeout(() => {
            vscode.commands.executeCommand('pieverse-diff.showDiffActions');
          }, 500);
          
          return;
        }
        
        // Fall back to the old method
        const tempUris = context.workspaceState.get<{[key: string]: string}>('pieverseTempUris') || {};
        console.log("Looking in tempUris:", JSON.stringify(tempUris));
        
        const tempUri = tempUris[filePath] ? vscode.Uri.parse(tempUris[filePath]) : undefined;
        console.log(`Temp URI from workspaceState: ${tempUri?.toString()}`);
        
        if (tempUri) {
          // Set the URIs in diffActionsService before showing diff
          globals.diffActionsService.setCurrentDiff(fileUri, tempUri, 'Suggested Changes');
          
          await vscode.commands.executeCommand(
            'vscode.diff',
            fileUri, 
            tempUri, 
            'PieVerse: Suggested Changes'
          );
          
          // Explicitly show the diff actions
          setTimeout(() => {
            vscode.commands.executeCommand('pieverse-diff.showDiffActions');
          }, 500);
        } else {
          console.log('No suggested changes found for this file');
          vscode.window.showWarningMessage('No suggested changes available for this file');
        }
      } catch (error) {
        console.error('Error in showDiff:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error showing diff: ${errorMessage}`);
      }
    })
  );

  // Command to clear messages
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.clearMessages', () => {
      if (globals.sidebarProvider.view?.webview) {
        globals.sidebarProvider.view.webview.postMessage({
          command: 'clearMessages'
        });
      }
    })
  );

  // Command to set WebSocket URL
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.setWebSocketUrl', async () => {
      // Create and show the settings panel
      const panel = vscode.window.createWebviewPanel(
        'pieverse-settings',
        'PieVerse Settings',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      // Get current settings
      const config = vscode.workspace.getConfiguration('pieverse-diff');
      const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
      const createBackup = config.get<boolean>('createBackupFiles', false);
      const autoOpenDiff = config.get<boolean>('autoOpenDiff', true);      

      // Get style sheet path
      const cssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'resources', 'style.css')
      );

      // Set the HTML content
      panel.webview.html = getSettingsPanelHtml(cssUri.toString(), wsUrl, createBackup, autoOpenDiff);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'saveSettings':
              if (message.settings) {
                await config.update('websocketUrl', message.settings.wsUrl, true);
                await config.update('createBackupFiles', message.settings.createBackup, true);
                await config.update('autoOpenDiff', message.settings.autoOpenDiff, true);
                vscode.window.showInformationMessage('PieVerse settings saved');
                
                // Reconnect with new URL
                globals.webSocketService.connect(message.settings.wsUrl, globals, context);
                
                // Update connection status
                globals.sidebarProvider.updateConnectionStatus('connecting');
                
                setTimeout(() => panel.dispose(), 1000);
              }
              break;
            case 'cancelSettings':
              panel.dispose();
              break;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );

  // Register specific command to show diff actions
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.showDiffActions', () => {
      globals.diffActionsService.setCurrentDiff(
        vscode.Uri.parse(context.globalState.get<string>('pieverseDiffOriginalUri') || ''),
        vscode.Uri.parse(context.globalState.get<string>('pieverseDiffTempUri') || ''),
        context.globalState.get<string>('pieverseDiffDescription') || 'Suggested Changes'
      );
    })
  );

  // Register command to refresh diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.refreshDiagnostics', () => {
      if (globals.diagnosticsService) {
        globals.diagnosticsService.sendAllDiagnostics();
        vscode.window.showInformationMessage('PieVerse: Diagnostics refreshed');
      }
    })
  );

  // Register terminal commands (terminal integration)
  context.subscriptions.push(
    vscode.commands.registerCommand('pieverse-diff.openTerminal', () => {
      vscode.commands.executeCommand('pieverse-diff.showTerminal');
      vscode.window.showInformationMessage('PieVerse Terminal opened');
    })
  );
}