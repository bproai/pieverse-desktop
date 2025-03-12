import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Check if a file exists
 */
export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a copy of file in resources directory
 */
export async function ensureResourcesExist(context: vscode.ExtensionContext) {
  const resourcesDir = vscode.Uri.joinPath(context.extensionUri, 'resources');
  
  try {
    await vscode.workspace.fs.createDirectory(resourcesDir);
  } catch (error) {
    // Directory might already exist, that's fine
  }
  
  // Create CSS file if it doesn't exist
  const cssPath = vscode.Uri.joinPath(resourcesDir, 'style.css');
  try {
    await vscode.workspace.fs.stat(cssPath);
  } catch {
    // File doesn't exist, create it
    const cssContent = `/* PieVerse Panel styles */
/* Additional custom styles can be added here */
`;
    await vscode.workspace.fs.writeFile(cssPath, Buffer.from(cssContent, 'utf8'));
  }
}