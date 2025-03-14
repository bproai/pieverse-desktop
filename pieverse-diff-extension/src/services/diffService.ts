import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileExists } from '../utils/fileUtils';
import { ExtensionGlobals } from '../extension';
import { DiffTreeItem } from '../tree/diffTreeProvider';

/**
 * Check if a file path is within any of the open workspace folders
 */
function isFileInWorkspace(filePath: string): boolean {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    console.log("No workspace folders open, returning false");
    return false;
  }

  // Try to make filePath absolute if it's not already
  let absoluteFilePath = filePath;
  try {
    if (!path.isAbsolute(filePath)) {
      absoluteFilePath = path.resolve(filePath);
    }
    absoluteFilePath = path.normalize(absoluteFilePath);
  } catch (error) {
    console.log(`Error normalizing path: ${error}`);
    // Continue with original path if there's an error
    absoluteFilePath = filePath;
  }
  
  console.log(`Checking if file ${absoluteFilePath} is in any workspace folder`);
  
  // Check each workspace folder
  for (const folder of vscode.workspace.workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    
    try {
      // Get absolute normalized path of workspace folder
      const normalizedFolderPath = path.normalize(folderPath);
      console.log(`Checking workspace folder: ${normalizedFolderPath}`);
      
      // Check if file path starts with workspace folder path (direct child)
      if (absoluteFilePath.startsWith(normalizedFolderPath + path.sep) || 
          absoluteFilePath === normalizedFolderPath) {
        console.log(`File ${absoluteFilePath} is in workspace folder ${normalizedFolderPath}`);
        return true;
      }
      
      // Also try to find it as a relative path within the workspace
      const relativePossiblePath = path.join(normalizedFolderPath, filePath);
      if (fs.existsSync(relativePossiblePath)) {
        console.log(`File found as relative path: ${relativePossiblePath}`);
        return true;
      }
    } catch (error) {
      console.log(`Error checking workspace folder ${folderPath}: ${error}`);
      // Continue with next folder
    }
  }

  console.log(`File ${absoluteFilePath} is NOT in any workspace folder`);
  return false;
}

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
    
    // Check if the file is within the current workspace - with extra logging
    console.log(`Current workspace folders: ${JSON.stringify(vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath))}`);
    const isInWorkspace = isFileInWorkspace(suggestion.originalFile);
    console.log(`File ${fileName} is ${isInWorkspace ? '' : 'NOT '}in current workspace`);
    
    // Add to tree view whether in workspace or not
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
    if (vscode.workspace.workspaceFolders && isInWorkspace) {
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
          // Continue looking
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

    // Only display notification if the file is within the current workspace
    if (isInWorkspace) {
      // Get auto-open diff setting
      const config = vscode.workspace.getConfiguration('pieverse-diff');
      const autoOpenDiff = config.get<boolean>('autoOpenDiff', true);
      console.log(`autoOpenDiff setting is ${autoOpenDiff}`);

      if (autoOpenDiff) {
        // Automatically open the diff view
        console.log(`Auto-opening diff for ${fileName}`);
        vscode.commands.executeCommand('pieverse-diff.showSingleDiff', suggestion.originalFile);
        
        // Show a notification that diff was automatically opened
        vscode.window.showInformationMessage(
          `Automatically opened diff for ${fileName}`
        );
      } else {
        // Show the notification with View Diff button
        console.log(`Showing notification for ${fileName} as it's in the current workspace`);
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
      }
    } else {
      console.log(`Skipping notification for ${fileName} as it's NOT in the current workspace`);
      
      // Add a system message to the sidebar instead
      globals.sidebarProvider.addSystemMessage(
        `Received diff for ${fileName} (not in current workspace)`,
        'info'
      );
    }
    
  } catch (error) {
    console.error('Error processing suggested update:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error processing suggested update: ${errorMessage}`);
  }
}