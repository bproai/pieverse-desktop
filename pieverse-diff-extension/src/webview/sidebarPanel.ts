import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';
import { getSidebarHtml } from './sidebarHtmlProvider';

/**
 * WebviewViewProvider for the PieVerse sidebar
 */
export class PieVerseSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _globals: ExtensionGlobals;
  private readonly _extensionUri: vscode.Uri;
  private readonly _extensionContext: vscode.ExtensionContext;

  constructor(extensionUri: vscode.Uri, globals: ExtensionGlobals, context: vscode.ExtensionContext) {
    this._extensionUri = extensionUri;
    this._globals = globals;
    this._extensionContext = context;
  }

  /**
   * Called when a view first becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Get path to style sheet
    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'style.css')
    );

    webviewView.webview.html = getSidebarHtml(styleUri);

    this._setWebviewMessageListener(webviewView);
  }

  /**
   * Get a reference to the current view
   */
  public get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  /**
   * Update the connection status in the view
   */
  public updateConnectionStatus(status: string): void {
    if (this._view) {
      this._view.webview.postMessage({ 
        command: 'connectionStatus', 
        status: status 
      });
    }
  }

  /**
   * Add a message to the chat
   */
  public addChatMessage(text: string, sender: string): void {
    if (this._view) {
      this._view.webview.postMessage({ 
        command: 'receiveMessage', 
        text: text,
        sender: sender
      });

      // If view isn't focused, show notification
      if (!this._view.visible) {
        vscode.window.showInformationMessage(
          `New message from ${sender}: ${text}`, 
          'Show Chat'
        ).then(selection => {
          if (selection === 'Show Chat') {
            vscode.commands.executeCommand('pieverse-diff.focus');
          }
        });
      }
    }
  }

  /**
   * Add a system message to the view
   */
  public addSystemMessage(text: string, type: string = 'info'): void {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'addSystemMessage',
        text: text,
        type: type
      });
    }
  }

  /**
   * Add a diff suggestion to the view
   */
  public addDiffSuggestion(fileName: string, filePath: string, description: string): void {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'receiveDiffSuggestion',
        fileName,
        filePath,
        description: description || 'Suggested code changes'
      });
    }
  }

  /**
   * Set up message listeners for the webview
   */
  private _setWebviewMessageListener(webviewView: vscode.WebviewView) {
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'sendMessage':
            if (this._globals.webSocketService.sendMessage(message.text)) {
              // Message sent successfully
            } else {
              vscode.window.showErrorMessage('WebSocket is not connected. Please connect to PieVerse first.');
              
              this.updateConnectionStatus('disconnected');
            }
            return;
          case 'connectToPieVerse':
            const config = vscode.workspace.getConfiguration('pieverse-diff');
            const wsUrl = config.get<string>('websocketUrl') || 'ws://localhost:3001';
            this._globals.webSocketService.connect(wsUrl, this._globals, this._extensionContext);
            this.updateConnectionStatus('connecting');
            return;
          case 'setWebSocketUrl':
            vscode.commands.executeCommand('pieverse-diff.setWebSocketUrl');
            return;
          case 'showDiff':
            if (message.filePath) {
              // Use the better command that has debug info
              vscode.commands.executeCommand('pieverse-diff.showSingleDiff', message.filePath);
            }
            return;
        }
      },
      undefined
    );
  }
}