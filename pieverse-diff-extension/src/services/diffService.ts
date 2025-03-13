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
    console.log("Handling suggested update, raw data:", JSON.stringify(suggestion));
    
    // Check if this is a proper diff suggestion
    if (!suggestion.originalFile || !suggestion.suggestedContent) {
      console.log("Received non-diff message or missing required fields:", JSON.stringify(suggestion));
      
      // Check for snake_case fields (Rust style)
      if (suggestion.original_file && suggestion.suggested_content) {
        console.log("Converting from snake_case to camelCase");
        suggestion = {
          originalFile: suggestion.original_file,
          suggestedContent: suggestion.suggested_content,
          description: suggestion.description
        };
      } else {
        return;
      }
    }
    
    // Create a descriptive name for the tree item
    const fileName = suggestion.originalFile.split('/').pop() || suggestion.originalFile.split('\\').pop();
    const shortDesc = suggestion.description && suggestion.description.length > 30 ? 
      `${suggestion.description.substring(0, 30)}...` : 
      (suggestion.description || "No description");
    
    console.log(`Processing suggestion for file: ${fileName}, description: ${shortDesc}`);
    
    // Extract file extension for proper language identification
    const fileExtension = fileName?.split('.').pop() || 'js';
    
    // Add to tree view
    globals.treeDataProvider.addDiffItem(
      new DiffTreeItem(`${fileName}: ${shortDesc}`, suggestion.originalFile)
    );
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'pieverse-diff');
    console.log(`Temp directory: ${tempDir}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log("Created temp directory");
    }
    
    // Generate a unique temp file name based on the original file and timestamp
    const tempFileName = `pieverse-${fileName}-${Date.now()}.${fileExtension}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    console.log(`Temp file path: ${tempFilePath}`);
    
    // Write content to temp file
    fs.writeFileSync(tempFilePath, suggestion.suggestedContent, 'utf8');
    console.log(`Wrote ${suggestion.suggestedContent.length} bytes to temp file`);
    const tempUri = vscode.Uri.file(tempFilePath);
    console.log(`Temp URI: ${tempUri.toString()}`);
    
    // Store the temp file URI for later use
    const tempUris = context.workspaceState.get<{[key: string]: string}>('pieverseTempUris') || {};
    console.log("Current tempUris in workspaceState:", JSON.stringify(tempUris));
    tempUris[suggestion.originalFile] = tempUri.toString();
    context.workspaceState.update('pieverseTempUris', tempUris);
    console.log("Updated tempUris in workspaceState");
    
    // Determine the original file URI
    let originalUri: vscode.Uri | undefined;
    
    // First try to find the file in the workspace
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const possibleUri = vscode.Uri.joinPath(folder.uri, suggestion.originalFile);
        console.log(`Trying workspace path: ${possibleUri.fsPath}`);
        try {
          fs.accessSync(possibleUri.fsPath);
          originalUri = possibleUri;
          console.log(`Found file in workspace: ${originalUri.toString()}`);
          break;
        } catch (e) {
          console.log(`File not found in workspace folder: ${possibleUri.fsPath}`);
          // File not found in this workspace folder, continue searching
        }
      }
    }
    
    // If not found in workspace, try as absolute path
    if (!originalUri) {
      originalUri = vscode.Uri.file(suggestion.originalFile);
      console.log(`Using absolute path: ${originalUri.toString()}`);
    }

    // For direct access, store the info in global variables
    console.log("Storing current diff information in globalState");
    context.globalState.update('pieverseDiffOriginalUri', originalUri.toString());
    context.globalState.update('pieverseDiffTempUri', tempUri.toString());
    context.globalState.update('pieverseDiffDescription', suggestion.description || 'Suggested Update');
    console.log(`Global variables set - original: ${originalUri.toString()}, temp: ${tempUri.toString()}`);
    
    // Also store in a simple object for the specific file
    const diffPairs = context.globalState.get<{[key: string]: {original: string, temp: string, desc: string}}>('pieverseDiffPairs') || {};
    diffPairs[suggestion.originalFile] = {
      original: originalUri.toString(),
      temp: tempUri.toString(),
      desc: suggestion.description || 'Suggested Update'
    };
    context.globalState.update('pieverseDiffPairs', diffPairs);
    console.log(`Updated diffPairs in globalState for file: ${suggestion.originalFile}`);
    
    // Add to the sidebar
    globals.sidebarProvider.addDiffSuggestion(
      fileName,
      suggestion.originalFile,
      suggestion.description || 'Suggested code changes'
    );

    // Display notification instead of automatically opening diff
    vscode.window.showInformationMessage(
      `Received suggested changes for ${fileName}`, 
      'View Diff'
    ).then(selection => {
      if (selection === 'View Diff') {
        console.log("View Diff button clicked");
        // Only open the diff view when the user clicks "View Diff"
        vscode.commands.executeCommand('pieverse-diff.showSingleDiff', suggestion.originalFile);
      }
    });
    
  } catch (error) {
    console.error('Error processing suggested update:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error processing suggested update: ${errorMessage}`);
  }
}