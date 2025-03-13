import * as vscode from 'vscode';
import { ExtensionGlobals } from '../extension';
import { icons } from '../utils/icons';

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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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

  /**
   * Generate HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get path to style sheet
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'style.css')
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <style>
          :root {
            --header-height: 38px;
            --chat-input-height: 36px;
            --system-section-height: 60%;
            --chat-section-height: calc(40% - var(--header-height) - var(--chat-input-height));
          }
          
          body {
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          
          /* Header styles */
          .header {
            height: var(--header-height);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          
          .header-title {
            font-weight: bold;
            font-size: 13px;
            display: flex;
            align-items: center;
          }
          
          .connection-status {
            margin-left: 8px;
            font-size: 12px;
            color: var(--vscode-disabledForeground);
          }
          
          .connection-status.connected {
            color: var(--vscode-testing-iconPassed);
          }
          
          .connection-status.disconnected {
            color: var(--vscode-testing-iconFailed);
          }
          
          .connection-status.connecting {
            color: var(--vscode-testing-iconQueued);
          }
          
          .toolbar {
            display: flex;
            gap: 4px;
          }
          
          .icon-button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 3px;
            background: transparent;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
          }
          
          .icon-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
          }
          
          /* System messages section */
          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            color: var(--vscode-disabledForeground);
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          
          .section-header-actions {
            display: flex;
            gap: 4px;
          }
          
          #system-container {
            height: var(--system-section-height);
            overflow-y: auto;
            display: flex;
            flex-direction: column;
          }
          
          .system-message {
            margin: 4px 8px;
            padding: 6px 8px;
            border-radius: 3px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-editor-foreground);
            border-left: 2px solid var(--vscode-activityBarBadge-background);
            font-size: 12px;
          }
          
          .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
          }
          
          .message-content {
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 12px;
          }
          
          .diff-suggestion {
            border-left-color: var(--vscode-gitDecoration-addedResourceForeground);
          }
          
          .changes-accepted {
            border-left-color: var(--vscode-testing-iconPassed);
          }
          
          .changes-rejected {
            border-left-color: var(--vscode-testing-iconFailed);
          }
          
          .diff-suggestion .view-button {
            margin-top: 6px;
            font-size: 11px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            padding: 2px 6px;
            cursor: pointer;
          }
          
          /* Divider */
          .resizer {
            height: 3px;
            background-color: var(--vscode-panel-border);
            cursor: ns-resize;
            position: relative;
          }
          
          .resizer:hover {
            background-color: var(--vscode-focusBorder);
          }
          
          /* Chat section */
          #chat-section {
            height: var(--chat-section-height);
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            overflow: hidden;
          }
          
          #chat-history {
            flex: 1;
            overflow-y: auto;
            padding: 4px;
          }
          
          .chat-bubble {
            margin-bottom: 4px;
            padding: 4px 6px;
            border-radius: 10px;
            max-width: 80%;
            font-size: 12px;
          }
          
          .user-message {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            margin-left: auto;
          }
          
          .bot-message {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-editor-foreground);
          }
          
          #input-container {
            display: flex;
            padding: 6px;
            height: var(--chat-input-height);
            box-sizing: border-box;
            border-top: 1px solid var(--vscode-panel-border);
          }
          
          #message-input {
            flex-grow: 1;
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-size: 12px;
          }
          
          #send-button {
            margin-left: 4px;
            padding: 0;
            width: 24px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          #send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          /* SVG Icons */
          .icon-svg {
            width: 14px;
            height: 14px;
            fill: currentColor;
          }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-title">
                <span>PieVerse</span>
                <span class="connection-status disconnected" id="connection-status">Disconnected</span>
            </div>
            <div class="toolbar">
                <button class="icon-button" id="connect-button" title="Connect to PieVerse">
                    ${icons.connect}
                </button>
                <button class="icon-button" id="settings-button" title="PieVerse Settings">
                    ${icons.settings}
                </button>
                <button class="icon-button" id="refresh-button" title="Refresh Connection">
                    ${icons.refresh}
                </button>
            </div>
        </div>
        
        <div class="section-header">
            <span>System Messages</span>
            <div class="section-header-actions">
                <button class="icon-button" id="clear-system" title="Clear Messages">
                    <svg class="icon-svg" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                </button>
            </div>
        </div>
        
        <div id="system-container">
            <div class="system-message">
                <div class="message-header">
                    <span>System</span>
                    <span>Just now</span>
                </div>
                <div class="message-content">
                    Welcome to PieVerse! Connect to start receiving suggestions and messages.
                </div>
            </div>
        </div>
        
        <div class="resizer" id="chat-resizer"></div>
        
        <div class="section-header">
            <span>Chat</span>
            <div class="section-header-actions">
                <button class="icon-button" id="clear-chat" title="Clear Chat">
                    <svg class="icon-svg" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                </button>
            </div>
        </div>
        
        <div id="chat-section">
            <div id="chat-history"></div>
            <div id="input-container">
                <input type="text" id="message-input" placeholder="Type a message..." />
                <button id="send-button" title="Send Message">
                    ${icons.send}
                </button>
            </div>
        </div>

        <script>
            (function() {
                const vscode = acquireVsCodeApi();
                const systemContainer = document.getElementById('system-container');
                const chatHistory = document.getElementById('chat-history');
                const chatSection = document.getElementById('chat-section');
                const chatResizer = document.getElementById('chat-resizer');
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-button');
                const connectButton = document.getElementById('connect-button');
                const settingsButton = document.getElementById('settings-button');
                const refreshButton = document.getElementById('refresh-button');
                const clearSystemBtn = document.getElementById('clear-system');
                const clearChatBtn = document.getElementById('clear-chat');
                const connectionStatus = document.getElementById('connection-status');
                
                // Set up chat section resizer
                setupResizer();
                
                // Function to set up the chat section resizer
                function setupResizer() {
                    let startY;
                    let startHeight;
                    
                    chatResizer.addEventListener('mousedown', function(e) {
                        startY = e.clientY;
                        startHeight = parseInt(document.defaultView.getComputedStyle(systemContainer).height, 10);
                        
                        document.documentElement.style.cursor = 'ns-resize';
                        document.addEventListener('mousemove', onResize);
                        document.addEventListener('mouseup', stopResize);
                        
                        e.preventDefault();
                    });
                    
                    function onResize(e) {
                        // Calculate new height
                        const newHeight = startHeight + (e.clientY - startY);
                        const totalHeight = window.innerHeight - 
                                          document.querySelector('.header').offsetHeight - 
                                          document.querySelectorAll('.section-header')[0].offsetHeight - 
                                          document.querySelectorAll('.section-header')[1].offsetHeight -
                                          document.getElementById('input-container').offsetHeight -
                                          chatResizer.offsetHeight;
                        
                        // Limit between 25% and 75% of available space
                        const minHeight = totalHeight * 0.25;
                        const maxHeight = totalHeight * 0.75;
                        
                        if (newHeight >= minHeight && newHeight <= maxHeight) {
                            systemContainer.style.height = newHeight + 'px';
                            document.documentElement.style.setProperty('--system-section-height', newHeight + 'px');
                            chatSection.style.height = (totalHeight - newHeight) + 'px';
                            document.documentElement.style.setProperty('--chat-section-height', (totalHeight - newHeight) + 'px');
                        }
                    }
                    
                    function stopResize() {
                        document.documentElement.style.cursor = '';
                        document.removeEventListener('mousemove', onResize);
                        document.removeEventListener('mouseup', stopResize);
                    }
                }
                
                // Function to update connection status display
                function updateConnectionStatus(status) {
                    connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                    connectionStatus.className = 'connection-status ' + status;
                }
                
                // Function to add a message to the chat
                function addChatMessage(text, isSelf) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('chat-bubble');
                    messageElement.classList.add(isSelf ? 'user-message' : 'bot-message');
                    messageElement.textContent = text;
                    chatHistory.appendChild(messageElement);
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                }
                
                // Function to add a system message
                function addSystemMessage(text, type = 'info', timestamp = new Date()) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('system-message');
                    
                    if (type === 'diff-suggestion') {
                        messageElement.classList.add('diff-suggestion');
                    }
                    
                    const header = document.createElement('div');
                    header.classList.add('message-header');
                    
                    const typeSpan = document.createElement('span');
                    typeSpan.textContent = type === 'diff-suggestion' ? 'Diff Suggestion' : 'System';
                    
                    const timeSpan = document.createElement('span');
                    timeSpan.textContent = formatTime(timestamp);
                    
                    header.appendChild(typeSpan);
                    header.appendChild(timeSpan);
                    
                    const content = document.createElement('div');
                    content.classList.add('message-content');
                    content.textContent = text;
                    
                    messageElement.appendChild(header);
                    messageElement.appendChild(content);
                    
                    if (type === 'diff-suggestion') {
                        const viewButton = document.createElement('button');
                        viewButton.classList.add('view-button');
                        viewButton.textContent = 'View Diff';
                        viewButton.addEventListener('click', () => {
                            // Extract file path from message text (assuming format)
                            const regex = /File: (.*?)(?:\\n|$)/;
                            const match = text.match(regex);
                            if (match && match[1]) {
                                // Use the filePath in the message directly, not an extracted one
                                vscode.postMessage({
                                    command: 'showDiff',
                                    filePath: match[1].trim()
                                });
                            }
                        });
                        messageElement.appendChild(viewButton);
                    }
                    
                    systemContainer.appendChild(messageElement);
                    systemContainer.scrollTop = systemContainer.scrollHeight;
                }
                
                // Format time helper
                function formatTime(date) {
                    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
                }
                
                // Function to send a message
                function sendMessage() {
                    const text = messageInput.value.trim();
                    if (text) {
                        // Add message to chat
                        addChatMessage(text, true);
                        
                        // Send message to extension
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: text
                        });
                        
                        // Clear input
                        messageInput.value = '';
                    }
                }
                
                // Clear system messages
                clearSystemBtn.addEventListener('click', () => {
                    systemContainer.innerHTML = '';
                    addSystemMessage('System messages cleared.');
                });
                
                // Clear chat messages
                clearChatBtn.addEventListener('click', () => {
                    chatHistory.innerHTML = '';
                });
                
                // Send button click event
                sendButton.addEventListener('click', sendMessage);
                
                // Connect button click event
                connectButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'connectToPieVerse'
                    });
                    
                    addSystemMessage('Attempting to connect to PieVerse...');
                });
                
                // Settings button click event
                settingsButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'setWebSocketUrl'
                    });
                });
                
                // Refresh button click event
                refreshButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'connectToPieVerse'
                    });
                    
                    addSystemMessage('Refreshing connection to PieVerse...');
                });
                
                // Enter key event
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
                
                // Function to add a system message directly
                function addSystemMessageDirect(text, type = 'info', timestamp = new Date()) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('system-message');
                    
                    if (type !== 'info') {
                        messageElement.classList.add(type);
                    }
                    
                    const header = document.createElement('div');
                    header.classList.add('message-header');
                    
                    const typeSpan = document.createElement('span');
                    if (type === 'diff-suggestion') {
                        typeSpan.textContent = 'Diff Suggestion';
                    } else if (type === 'changes-accepted') {
                        typeSpan.textContent = 'Changes Accepted';
                    } else if (type === 'changes-rejected') {
                        typeSpan.textContent = 'Changes Rejected';
                    } else {
                        typeSpan.textContent = 'System';
                    }
                    
                    const timeSpan = document.createElement('span');
                    timeSpan.textContent = formatTime(timestamp);
                    
                    header.appendChild(typeSpan);
                    header.appendChild(timeSpan);
                    
                    const content = document.createElement('div');
                    content.classList.add('message-content');
                    content.textContent = text;
                    
                    messageElement.appendChild(header);
                    messageElement.appendChild(content);
                    
                    systemContainer.appendChild(messageElement);
                    systemContainer.scrollTop = systemContainer.scrollHeight;
                }
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'receiveMessage':
                            addChatMessage(message.text, false);
                            break;
                        
                        case 'connectionStatus':
                            updateConnectionStatus(message.status);
                            addSystemMessage("Connection " + message.status);
                            break;
                        
                        case 'connectionAttempt':
                            updateConnectionStatus(message.status);
                            break;
                        
                        case 'receiveDiffSuggestion':
                            const diffText = "File: " + message.filePath + 
                                "\\nDescription: " + (message.description || 'No description provided');
                            addSystemMessage(diffText, 'diff-suggestion');
                            break;
                            
                        case 'addSystemMessage':
                            addSystemMessageDirect(message.text, message.type);
                            break;
                    }
                });
                
                // Initialize with disconnected status
                updateConnectionStatus('disconnected');
            }());
        </script>
    </body>
    </html>`;
  }
}