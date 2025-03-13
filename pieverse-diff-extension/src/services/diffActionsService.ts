import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionGlobals } from '../extension';

/**
 * Service to handle diff actions like accepting or rejecting changes
 */
export class DiffActionsService {
  private context: vscode.ExtensionContext;
  private globals: ExtensionGlobals;
  private currentDiff: {
    originalUri?: vscode.Uri,
    tempUri?: vscode.Uri,
    description?: string
  } = {};

  constructor(context: vscode.ExtensionContext, globals: ExtensionGlobals) {
    this.context = context;
    this.globals = globals;
    this.registerCommands();
    this.registerEditorListener();
  }

  /**
   * Set current diff being viewed
   */
  public setCurrentDiff(originalUri: vscode.Uri, tempUri: vscode.Uri, description: string): void {
    this.currentDiff = { originalUri, tempUri, description };
    
    // Immediately show the actions widget
    this.showActionsWidget();
    
    // Also show it again after a slight delay to ensure it appears
    setTimeout(() => {
      this.showActionsWidget();
    }, 700);
  }

  /**
   * Register commands for diff actions
   */
  private registerCommands(): void {
    // Command to accept all changes
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.acceptChanges', async () => {
        if (!this.currentDiff.originalUri || !this.currentDiff.tempUri) {
          vscode.window.showErrorMessage('No active diff to accept changes from');
          return;
        }

        try {
          // Read content from the suggested temp file
          const tempContent = fs.readFileSync(this.currentDiff.tempUri.fsPath, 'utf8');
          
          // Create a backup of the original file first
          const originalPath = this.currentDiff.originalUri.fsPath;
          const backupPath = path.join(
            path.dirname(originalPath),
            `${path.basename(originalPath)}.pieverse-backup.${Date.now()}`
          );
          
          // Copy original to backup
          fs.copyFileSync(originalPath, backupPath);
          
          // Write temp content to original file
          fs.writeFileSync(originalPath, tempContent, 'utf8');
          
          vscode.window.showInformationMessage(
            `Changes accepted! Original file backed up to ${path.basename(backupPath)}`,
            'View Original'
          ).then(selection => {
            if (selection === 'View Original') {
              vscode.commands.executeCommand('vscode.open', vscode.Uri.file(backupPath));
            }
          });
          
          // Close diff editor
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          
          // Notify sidebar
          this.globals.sidebarProvider.addSystemMessage(
            `Changes accepted for ${path.basename(originalPath)}`, 
            'changes-accepted'
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error accepting changes: ${errorMessage}`);
        }
      })
    );

    // Command to reject changes
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.rejectChanges', async () => {
        if (!this.currentDiff.originalUri || !this.currentDiff.tempUri) {
          vscode.window.showErrorMessage('No active diff to reject');
          return;
        }

        try {
          // Close diff editor
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          
          // Notify sidebar
          this.globals.sidebarProvider.addSystemMessage(
            `Changes rejected for ${path.basename(this.currentDiff.originalUri.fsPath)}`, 
            'changes-rejected'
          );
          
          vscode.window.showInformationMessage('Changes rejected');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error rejecting changes: ${errorMessage}`);
        }
      })
    );

    // Command to selectively apply changes
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.selectivelyApplyChanges', async () => {
        if (!this.currentDiff.originalUri || !this.currentDiff.tempUri) {
          vscode.window.showErrorMessage('No active diff to apply changes from');
          return;
        }

        try {
          // Open the original file and the suggested file in a split view for manual editing
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          await vscode.commands.executeCommand('vscode.open', this.currentDiff.originalUri);
          await vscode.commands.executeCommand('workbench.action.splitEditorRight');
          await vscode.commands.executeCommand('vscode.open', this.currentDiff.tempUri);
          
          vscode.window.showInformationMessage(
            'Files opened side by side. Copy the changes you want to keep from right to left.'
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error opening files for selective changes: ${errorMessage}`);
        }
      })
    );
    
    // Command to show actions widget
    this.context.subscriptions.push(
      vscode.commands.registerCommand('pieverse-diff.showDiffActions', () => {
        this.showActionsWidget();
      })
    );
  }

  /**
   * Register editor listener to detect when diff editor opens
   */
  private registerEditorListener(): void {
    // Listen for active editor changes to detect diff editor
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        // Check if any editor is active
        if (editor) {
          // Try to detect if we're in a diff view
          setTimeout(() => {
            const originalUriString = this.context.globalState.get<string>('pieverseDiffOriginalUri');
            const tempUriString = this.context.globalState.get<string>('pieverseDiffTempUri');
            const description = this.context.globalState.get<string>('pieverseDiffDescription');
            
            if (originalUriString && tempUriString) {
              this.setCurrentDiff(
                vscode.Uri.parse(originalUriString),
                vscode.Uri.parse(tempUriString),
                description || 'Suggested Changes'
              );
            }
          }, 300);
        }
      })
    );
  }

  /**
   * Show actions widget above diff editor
   */
  private showActionsWidget(): void {
    if (!this.currentDiff.originalUri || !this.currentDiff.tempUri) {
      console.log('No current diff to show actions for');
      return;
    }
    
    console.log('Showing diff actions widget');
    
    // Use the simpler form of showInformationMessage for better compatibility
    vscode.window.showInformationMessage(
      `PieVerse Diff Actions for ${path.basename(this.currentDiff.originalUri.fsPath)}`,
      'Accept All Changes',
      'Reject Changes',
      'Apply Selectively'
    ).then(selection => {
      if (selection === 'Accept All Changes') {
        vscode.commands.executeCommand('pieverse-diff.acceptChanges');
      } else if (selection === 'Reject Changes') {
        vscode.commands.executeCommand('pieverse-diff.rejectChanges');
      } else if (selection === 'Apply Selectively') {
        vscode.commands.executeCommand('pieverse-diff.selectivelyApplyChanges');
      }
    });
  }
}