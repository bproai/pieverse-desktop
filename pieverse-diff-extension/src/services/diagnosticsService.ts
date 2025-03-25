// pieverse-diff-extension/src/services/diagnosticsService.ts
import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';

/**
 * Interface for diagnostic data structure
 */
interface DiagnosticItem {
  severity: vscode.DiagnosticSeverity;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string | number | { value: string | number; target: vscode.Uri };
  source?: string;
}

/**
 * Interface for file diagnostics
 */
interface FileDiagnostics {
  file: string;
  diagnostics: DiagnosticItem[];
}

/**
 * Interface for the simplified diagnostic that we send over the wire
 */
interface SimplifiedDiagnosticItem {
  severity: number;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string | { value: string; target: string };
  source?: string;
  // Added fields for enhanced functionality
  tags?: number[];
  relatedInformation?: {
    message: string;
    location: {
      uri: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
  }[];
  codeActions?: {
    title: string;
    kind?: string;
    isPreferred?: boolean;
    command?: {
      title: string;
      command: string;
      arguments?: any[];
    };
  }[];
}

/**
 * Interface for simplified file diagnostics
 */
interface SimplifiedFileDiagnostics {
  file: string;
  diagnostics: SimplifiedDiagnosticItem[];
}

/**
 * Interface for queued diagnostics data
 */
interface QueuedDiagnostics {
  type: string;
  data: SimplifiedFileDiagnostics[];
}

/**
 * Service to handle VSCode diagnostics
 */
export class DiagnosticsService {
  private context: vscode.ExtensionContext;
  private globals: ExtensionGlobals;
  private queuedDiagnostics: QueuedDiagnostics | null = null;
  private sendAttemptTimeout: NodeJS.Timeout | null = null;
  private collectingDiagnostics: boolean = false;

  constructor(context: vscode.ExtensionContext, globals: ExtensionGlobals) {
    this.context = context;
    this.globals = globals;
    this.setupDiagnosticsListener();
  }

  /**
   * Set up listener for diagnostics changes
   */
  private setupDiagnosticsListener(): void {
    // Register the diagnostics change event listener
    const diagnosticsListener = vscode.languages.onDidChangeDiagnostics((event) => {
      // Don't block the main thread, collect diagnostics asynchronously
      setTimeout(() => this.collectAndQueueDiagnostics(), 0);
    });

    // Add to subscriptions for proper cleanup
    this.context.subscriptions.push(diagnosticsListener);

    // Register command to manually refresh diagnostics
    const refreshCommand = vscode.commands.registerCommand('pieverse-diff.refreshDiagnostics', () => {
      this.collectAndQueueDiagnostics();
      vscode.window.showInformationMessage('PieVerse: Diagnostics collected');
    });

    this.context.subscriptions.push(refreshCommand);
  }

  /**
   * Simplify code property to make it serializable
   */
  private simplifyCodeProperty(code: string | number | { value: string | number; target: vscode.Uri } | undefined): 
    string | { value: string; target: string } | undefined {
    if (code === undefined) {
      return undefined;
    }
    
    if (typeof code === 'string') {
      return code;
    }
    
    if (typeof code === 'number') {
      return code.toString();
    }
    
    // Handle object with value and target
    return {
      value: code.value.toString(),
      target: code.target.toString()
    };
  }

  /**
   * Collect diagnostics and queue them for sending, including code actions
   */
  private async collectAndQueueDiagnostics(): Promise<void> {
    // Prevent multiple concurrent collections
    if (this.collectingDiagnostics) {
      console.log('Already collecting diagnostics, skipping');
      return;
    }
    
    this.collectingDiagnostics = true;
    
    try {
      // Show collecting status if WebSocket is connected
      if (this.globals.webSocketService.isConnected()) {
        this.globals.statusBarItem.text = "$(search) PieVerse";
        this.globals.statusBarItem.tooltip = "PieVerse: Collecting diagnostics...";
      }
      
      const allDiagnostics = vscode.languages.getDiagnostics();
      
      // Map VSCode diagnostics to our simplified format
      const diagnosticData: SimplifiedFileDiagnostics[] = [];
      
      for (const [uri, diagnostics] of allDiagnostics) {
        if (diagnostics.length === 0) {
          continue;
        }
        
        const filePath = uri.fsPath;
        const diagnosticItems: SimplifiedDiagnosticItem[] = [];
        
        // Process each diagnostic, collect code actions for each one
        for (const diag of diagnostics) {
          // Try to get code actions for this diagnostic
          let codeActions: any[] = [];
          try {
            // Get code actions for this specific diagnostic
            const vsCodeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
              'vscode.executeCodeActionProvider',
              uri,
              diag.range,
              vscode.CodeActionKind.QuickFix
            ) || [];
            
            // Transform code actions to our format
            codeActions = vsCodeActions.map(action => ({
              title: action.title,
              kind: action.kind?.value,
              isPreferred: action.isPreferred,
              command: action.command ? {
                title: action.command.title,
                command: action.command.command,
                arguments: action.command.arguments
              } : undefined
            }));
          } catch (error) {
            console.error('Error getting code actions:', error);
          }
          
          // Create a simplified diagnostic with code actions
          const diagnosticItem: SimplifiedDiagnosticItem = {
            severity: diag.severity,
            message: diag.message,
            range: {
              start: {
                line: diag.range.start.line,
                character: diag.range.start.character
              },
              end: {
                line: diag.range.end.line,
                character: diag.range.end.character
              }
            },
            code: this.simplifyCodeProperty(diag.code),
            source: diag.source,
            tags: diag.tags,
            codeActions: codeActions.length > 0 ? codeActions : undefined,
            relatedInformation: diag.relatedInformation?.map(info => ({
              message: info.message,
              location: {
                uri: info.location.uri.toString(),
                range: {
                  start: {
                    line: info.location.range.start.line,
                    character: info.location.range.start.character
                  },
                  end: {
                    line: info.location.range.end.line,
                    character: info.location.range.end.character
                  }
                }
              }
            }))
          };
          
          diagnosticItems.push(diagnosticItem);
        }
        
        // Filter out files with no diagnostics to reduce payload size
        if (diagnosticItems.length > 0) {
          diagnosticData.push({
            file: filePath,
            diagnostics: diagnosticItems
          });
        }
      }
      
      // Process collected diagnostics
      if (diagnosticData.length > 0) {
        // Store the diagnostics data
        this.queuedDiagnostics = {
          type: 'diagnostics',
          data: diagnosticData
        };
        
        // Try to send immediately if connected
        this.trySendQueuedDiagnostics();
        
        // Set up retry mechanism if not connected
        if (!this.globals.webSocketService.isConnected() && !this.sendAttemptTimeout) {
          // Restore normal status bar icon if not connected
          this.globals.statusBarItem.text = "$(warning) PieVerse";
          this.globals.statusBarItem.tooltip = "PieVerse: Disconnected (diagnostics pending)";
          
          this.setupRetrySendingDiagnostics();
        }
      } else {
        // No diagnostics to send, restore normal status icon
        if (this.globals.webSocketService.isConnected()) {
          this.globals.statusBarItem.text = "$(check) PieVerse";
          this.globals.statusBarItem.tooltip = "PieVerse: Connected (no diagnostics found)";
          
          // Show brief status message
          vscode.window.setStatusBarMessage('PieVerse: No diagnostics found in workspace', 3000);
        }
      }
    } catch (error) {
      console.error('Error collecting diagnostics:', error);
    } finally {
      this.collectingDiagnostics = false;
    }
  }

  /**
   * Try to send queued diagnostics if WebSocket is connected
   */
  private trySendQueuedDiagnostics(): boolean {
    if (this.queuedDiagnostics && this.globals.webSocketService.isConnected()) {
      // Update status bar to indicate sending in progress
      this.globals.statusBarItem.text = "$(sync~spin) PieVerse";
      this.globals.statusBarItem.tooltip = "PieVerse: Sending diagnostics...";
      
      // Send to WebSocket
      const success = this.globals.webSocketService.sendData(this.queuedDiagnostics);
      
      if (success) {
        // Add system message on successful send
        const totalErrors = this.queuedDiagnostics.data.reduce((count: number, file: SimplifiedFileDiagnostics) => {
          return count + file.diagnostics.filter((d: SimplifiedDiagnosticItem) => d.severity === vscode.DiagnosticSeverity.Error).length;
        }, 0);
        
        const totalWarnings = this.queuedDiagnostics.data.reduce((count: number, file: SimplifiedFileDiagnostics) => {
          return count + file.diagnostics.filter((d: SimplifiedDiagnosticItem) => d.severity === vscode.DiagnosticSeverity.Warning).length;
        }, 0);
        
        // Count total code actions
        const totalCodeActions = this.queuedDiagnostics.data.reduce((count: number, file: SimplifiedFileDiagnostics) => {
          return count + file.diagnostics.reduce((actionCount: number, diag: SimplifiedDiagnosticItem) => {
            return actionCount + (diag.codeActions?.length || 0);
          }, 0);
        }, 0);
        
        console.log(`Sent diagnostics: ${totalErrors} errors, ${totalWarnings} warnings with ${totalCodeActions} code actions across ${this.queuedDiagnostics.data.length} files`);
        
        // Show brief status message
        vscode.window.setStatusBarMessage(
          `PieVerse: Sent diagnostics (${totalErrors} errors, ${totalWarnings} warnings, ${totalCodeActions} quick fixes)`, 
          3000
        );
        
        this.globals.sidebarProvider.addSystemMessage(
          `Sent diagnostics: ${totalErrors} errors, ${totalWarnings} warnings with ${totalCodeActions} quick fixes across ${this.queuedDiagnostics.data.length} files`,
          'info'
        );
        
        // Restore normal status bar icon after sending
        setTimeout(() => {
          if (this.globals.webSocketService.isConnected()) {
            this.globals.statusBarItem.text = "$(check) PieVerse";
            this.globals.statusBarItem.tooltip = "PieVerse: Connected";
          }
        }, 1000);
        
        // Clear the queued diagnostics
        this.queuedDiagnostics = null;
        
        // Clear any retry timeout
        if (this.sendAttemptTimeout) {
          clearTimeout(this.sendAttemptTimeout);
          this.sendAttemptTimeout = null;
        }
        
        return true;
      } else {
        // Restore normal status bar icon if sending failed
        this.globals.statusBarItem.text = "$(check) PieVerse";
        this.globals.statusBarItem.tooltip = "PieVerse: Connected";
      }
    }
    
    return false;
  }

  /**
   * Set up retry mechanism for sending diagnostics
   */
  private setupRetrySendingDiagnostics(): void {
    // Clear any existing timeout
    if (this.sendAttemptTimeout) {
      clearTimeout(this.sendAttemptTimeout);
    }
    
    // Set up a timeout to attempt resending
    this.sendAttemptTimeout = setTimeout(() => {
      // Try to send
      const sent = this.trySendQueuedDiagnostics();
      
      // If not sent and we still have diagnostics queued, retry
      if (!sent && this.queuedDiagnostics) {
        console.log('WebSocket not connected, will retry sending diagnostics later');
        this.setupRetrySendingDiagnostics();
      } else {
        this.sendAttemptTimeout = null;
      }
    }, 5000); // Try every 5 seconds
  }

  /**
   * Public method to manually send all diagnostics
   * This is called when the user requests diagnostics refresh
   * or when the WebSocket connection is established
   */
  public sendAllDiagnostics(): void {
    this.collectAndQueueDiagnostics();
  }

  /**
   * Check if there are any diagnostics waiting to be sent
   */
  public hasPendingDiagnostics(): boolean {
    return this.queuedDiagnostics !== null;
  }
}