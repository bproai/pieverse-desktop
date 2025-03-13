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
  private _actionsShown = false;
  private _hasPendingDiff = false;
  private _processedDiffs = new Set<string>();

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
    // Generate a key to track this specific diff
    const diffKey = `${originalUri.toString()}:${tempUri.toString()}`;
    
    // Check if we've already processed this diff
    if (this._processedDiffs.has(diffKey)) {
      console.log('This diff has already been processed:', diffKey);
      return;
    }
    
    // Only update if we're viewing a pieverse diff
    if (!this.isDiffEditor() || !this.isPieverseTempFile(tempUri.fsPath)) {
      this._hasPendingDiff = true;
      this.currentDiff = { originalUri, tempUri, description };
      return;
    }
    
    this._hasPendingDiff = false;
    this.currentDiff = { originalUri, tempUri, description };
    
    // Show the actions only if we haven't shown them yet
    if (!this._actionsShown) {
      this._actionsShown = true;
      
      // Immediately show the actions widget
      this.showActionsWidget();
    }
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
          
          // Get config setting for creating backups
          const config = vscode.workspace.getConfiguration('pieverse-diff');
          const createBackup = config.get<boolean>('createBackupFiles', false);
          
          const originalPath = this.currentDiff.originalUri.fsPath;
          let backupPath = '';
          
          // Create a backup of the original file if enabled
          if (createBackup) {
            backupPath = path.join(
              path.dirname(originalPath),
              `${path.basename(originalPath)}.pieverse-backup.${Date.now()}`
            );
            
            // Copy original to backup
            fs.copyFileSync(originalPath, backupPath);
          }
          
          // Write temp content to original file
          fs.writeFileSync(originalPath, tempContent, 'utf8');
          
          if (createBackup) {
            vscode.window.showInformationMessage(
              `Changes accepted! Original file backed up to ${path.basename(backupPath)}`,
              'View Original'
            ).then(selection => {
              if (selection === 'View Original') {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(backupPath));
              }
            });
          } else {
            vscode.window.showInformationMessage('Changes accepted!');
          }
          
          // Mark this diff as processed
          this.markDiffAsProcessed();
          
          // Close diff editor
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          this._actionsShown = false;
          
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
          // Mark this diff as processed
          this.markDiffAsProcessed();
          
          // Close diff editor
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          this._actionsShown = false;
          
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
          // Mark this diff as processed - user will handle changes manually
          this.markDiffAsProcessed();
          
          // Open the original file and the suggested file in a split view for manual editing
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          this._actionsShown = false;
          
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
        if (this.isDiffEditor() && this.isPieverseDiff() && !this.isCurrentDiffProcessed()) {
          this.showActionsWidget();
        }
      })
    );
  }

  /**
   * Mark the current diff as processed to prevent showing actions again
   */
  private markDiffAsProcessed(): void {
    if (this.currentDiff.originalUri && this.currentDiff.tempUri) {
      const diffKey = `${this.currentDiff.originalUri.toString()}:${this.currentDiff.tempUri.toString()}`;
      this._processedDiffs.add(diffKey);
      
      // Also store the processed diffs in extension context to persist between sessions
      const processedDiffs = this.context.globalState.get<string[]>('pieverseDiffProcessed') || [];
      if (!processedDiffs.includes(diffKey)) {
        processedDiffs.push(diffKey);
        this.context.globalState.update('pieverseDiffProcessed', processedDiffs);
      }
    }
  }

  /**
   * Check if the current diff has already been processed
   */
  private isCurrentDiffProcessed(): boolean {
    if (!this.currentDiff.originalUri || !this.currentDiff.tempUri) {
      return false;
    }
    
    const diffKey = `${this.currentDiff.originalUri.toString()}:${this.currentDiff.tempUri.toString()}`;
    
    // Check in-memory set first
    if (this._processedDiffs.has(diffKey)) {
      return true;
    }
    
    // Then check global state
    const processedDiffs = this.context.globalState.get<string[]>('pieverseDiffProcessed') || [];
    if (processedDiffs.includes(diffKey)) {
      // Add to in-memory set for faster lookups
      this._processedDiffs.add(diffKey);
      return true;
    }
    
    return false;
  }

  /**
   * Register editor listener to detect when diff editor opens
   */
  private registerEditorListener(): void {
    // Load processed diffs from global state
    const processedDiffs = this.context.globalState.get<string[]>('pieverseDiffProcessed') || [];
    processedDiffs.forEach(diffKey => this._processedDiffs.add(diffKey));
    
    // Listen for active editor changes to detect diff editor
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        // Reset the actions shown flag when editor changes
        this._actionsShown = false;
        
        // Check if this is a diff editor with our temp files
        if (editor && this.isDiffEditor() && this.isPieverseDiff()) {
          if (this._hasPendingDiff) {
            // We have pending diff info, use it
            if (!this.isCurrentDiffProcessed()) {
              this.setCurrentDiff(
                this.currentDiff.originalUri!,
                this.currentDiff.tempUri!,
                this.currentDiff.description || 'Suggested Changes'
              );
            }
          } else {
            // Try to get diff info from global state
            setTimeout(() => {
              const originalUriString = this.context.globalState.get<string>('pieverseDiffOriginalUri');
              const tempUriString = this.context.globalState.get<string>('pieverseDiffTempUri');
              
              if (originalUriString && tempUriString) {
                const originalUri = vscode.Uri.parse(originalUriString);
                const tempUri = vscode.Uri.parse(tempUriString);
                const description = this.context.globalState.get<string>('pieverseDiffDescription') || 'Suggested Changes';
                
                // Check if this diff has already been processed
                const diffKey = `${originalUri.toString()}:${tempUri.toString()}`;
                if (!this._processedDiffs.has(diffKey)) {
                  this.setCurrentDiff(originalUri, tempUri, description);
                }
              }
            }, 300);
          }
        }
      })
    );
  }

  /**
   * Check if the current editor is a diff editor
   */
  private isDiffEditor(): boolean {
    // This is a best-effort attempt to detect a diff editor
    return !!vscode.window.activeTextEditor && 
           vscode.window.visibleTextEditors.length > 1;
  }

  /**
   * Check if this is a PieVerse diff by looking for our temp files
   */
  private isPieverseDiff(): boolean {
    return vscode.window.visibleTextEditors.some(e => 
      this.isPieverseTempFile(e.document.uri.fsPath)
    );
  }

  /**
   * Check if a file is a PieVerse temp file
   */
  private isPieverseTempFile(filePath: string): boolean {
    return filePath.includes('pieverse-diff') && 
           filePath.includes('pieverse-') && 
           !filePath.endsWith('.pieverse-backup');
  }

  /**
   * Show actions widget above diff editor
   */
  private showActionsWidget(): void {
    if (!this.currentDiff.originalUri || !this.currentDiff.tempUri || 
        !this.isPieverseDiff() || this.isCurrentDiffProcessed()) {
      console.log('No current actionable PieVerse diff to show actions for');
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