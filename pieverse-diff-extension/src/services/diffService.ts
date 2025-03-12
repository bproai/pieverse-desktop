import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileExists } from '../utils/fileUtils';
import { ExtensionGlobals } from '../extension';
import { DiffTreeItem } from '../tree/diffTreeProvider';
/**
 * Handle suggested updates from the PieVerse server
 */
export function handleSuggestedUpdate(suggestion: any, globals: ExtensionGlobals, context: vscode.ExtensionContext) {
  try {
    // Check if this is a proper diff suggestion
    if (!suggestion.originalFile || !suggestion.suggestedContent) {
      console.log("Received non-diff message:", JSON.stringify(suggestion));
      return;
    }
    
    // Create a descriptive name for the tree item
    const fileName = suggestion.originalFile.split('/').pop() || suggestion.originalFile.split('\\').pop();
    const shortDesc = suggestion.description && suggestion.description.length > 30 ? 
      `${suggestion.description.substring(0, 30)}...` : 
      (suggestion.description || "No description");
    
    // Extract file extension for proper language identification
    const fileExtension = fileName?.split('.').pop() || 'js';
    
    // Add to tree view
    globals.treeDataProvider.addDiffItem(
      new DiffTreeItem(`${fileName}: ${shortDesc}`, suggestion.originalFile)
    );
    
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
    
    // Update the panel with the suggestion
    if (globals.pieVersePanel && globals.pieVersePanel.webview) {
      globals.pieVersePanel.webview.postMessage({
        command: 'receiveDiffSuggestion',
        fileName,
        filePath: suggestion.originalFile,
        description: suggestion.description || 'Suggested code changes'
      });
    }
    
    // Show notification only if panel is not visible
    if (!globals.pieVersePanel || !globals.pieVersePanel.visible) {
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
    }
  } catch (error) {
    console.error('Error processing suggested update:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error processing suggested update: ${errorMessage}`);
  }
}