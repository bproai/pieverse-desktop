/**
 * HTML content for the panel webview
 */

import { icons } from '../utils/icons';

/**
 * Get the complete HTML content for the integrated panel
 */
export function getSettingsPanelHtml(cssUri: string, wsUrl: string, createBackup: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PieVerse Settings</title>
  <link href="${cssUri}" rel="stylesheet" />
  <style>
    :root {
      --panel-width: 100%;
      --panel-height: 100vh;
    }
    
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }

    h2 {
      margin-top: 0;
      margin-bottom: 20px;
      font-size: 1.2rem;
      font-weight: normal;
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    
    .form-group {
      margin-bottom: 15px;
    }
    
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 0.9rem;
    }
    
    input[type="text"], 
    select {
      width: 100%;
      padding: 6px 8px;
      font-size: 0.9rem;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
    }
    
    input[type="checkbox"] {
      margin-right: 8px;
    }
    
    .checkbox-label {
      display: flex;
      align-items: center;
      font-size: 0.9rem;
    }
    
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 2px;
      margin-right: 10px;
    }
    
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    
    .button-container {
      margin-top: 20px;
      display: flex;
    }
    
    .success-message {
      color: var(--vscode-testing-iconPassed);
      font-size: 0.9rem;
      margin-top: 10px;
      visibility: hidden;
    }
    
    .description {
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 5px;
      margin-bottom: 15px;
    }
  </style>
</head>
<body>
  <h2>PieVerse Settings</h2>
  
  <div class="form-group">
    <label for="wsUrl">WebSocket URL</label>
    <input type="text" id="wsUrl" value="${wsUrl}" />
    <div class="description">
      The WebSocket URL to connect to the PieVerse server.
      Default is ws://localhost:3001
    </div>
  </div>
  
  <div class="form-group">
    <div class="checkbox-label">
      <input type="checkbox" id="createBackup" ${createBackup ? 'checked' : ''} />
      <label for="createBackup">Create backup files when accepting changes</label>
    </div>
    <div class="description">
      When checked, a backup of the original file will be created before applying suggested changes.
      Not needed if you use version control like Git.
    </div>
  </div>
  
  <div class="button-container">
    <button id="saveBtn">Save Settings</button>
    <button id="cancelBtn">Cancel</button>
  </div>
  
  <div id="successMessage" class="success-message">
    Settings saved successfully!
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const wsUrlInput = document.getElementById('wsUrl');
    const createBackupCheck = document.getElementById('createBackup');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const successMessage = document.getElementById('successMessage');
    
    // Save settings
    saveBtn.addEventListener('click', () => {
      vscode.postMessage({
        command: 'saveSettings',
        settings: {
          wsUrl: wsUrlInput.value,
          createBackup: createBackupCheck.checked
        }
      });
      
      // Show success message
      successMessage.style.visibility = 'visible';
      setTimeout(() => {
        successMessage.style.visibility = 'hidden';
      }, 3000);
    });
    
    // Cancel and close
    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({
        command: 'cancelSettings'
      });
    });
  </script>
</body>
</html>`;
}

/**
 * Get the CSS styles for the panel
 */
function getPanelStyles(): string {
  return `
    :root {
      --panel-width: 100%;
      --panel-height: 100vh;
      --header-height: 40px;
      --chat-height: 120px;
      --chat-input-height: 40px;
      --system-height: calc(var(--panel-height) - var(--header-height) - var(--chat-height));
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    
    /* Main container for the whole interface */
    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    
    /* Header styles */
    #header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--header-height);
      min-height: var(--header-height);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 0 8px;
      background-color: var(--vscode-editor-background);
    }
    
    .header-title {
      font-weight: bold;
      font-size: 14px;
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
      gap: 8px;
    }
    
    .icon-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: transparent;
      border: none;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
    }
    
    .icon-button:hover {
      background-color: var(--vscode-toolbar-hoverBackground);
    }
    
    /* Content area */
    .content-area {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    
    /* System messages area */
    #system-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
    }
    
    .system-message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 4px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-editor-foreground);
      border-left: 3px solid var(--vscode-activityBarBadge-background);
    }
    
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .diff-suggestion {
      border-left-color: var(--vscode-gitDecoration-addedResourceForeground);
    }
    
    .diff-suggestion .view-button {
      margin-top: 8px;
      font-size: 12px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      padding: 4px 8px;
      cursor: pointer;
    }
    
    /* Chat section styles */
    #chat-section {
      height: var(--chat-height);
      min-height: var(--chat-height);
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      background-color: var(--vscode-editor-background);
    }
    
    #chat-history {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      max-height: calc(var(--chat-height) - var(--chat-input-height));
    }
    
    .chat-bubble {
      margin-bottom: 4px;
      padding: 4px 8px;
      border-radius: 12px;
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
      padding: 8px;
      height: var(--chat-input-height);
      min-height: var(--chat-input-height);
      box-sizing: border-box;
      border-top: 1px solid var(--vscode-panel-border);
    }
    
    #message-input {
      flex-grow: 1;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 12px;
    }
    
    #send-button {
      margin-left: 4px;
      padding: 0;
      width: 24px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
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
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    
    /* Resizer handle for chat section */
    .chat-resizer {
      height: 5px;
      background-color: var(--vscode-panel-border);
      cursor: ns-resize;
      position: relative;
    }
    
    .chat-resizer:hover {
      background-color: var(--vscode-focusBorder);
    }
    
    /* Responsive adjustments */
    @media (max-height: 400px) {
      :root {
        --chat-height: 90px;
      }
    }
  `;
}

/**
 * Generate the HTML for the panel body
 */
function getPanelBodyHtml(): string {
  return `
    <div class="container">
      <div id="header">
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
      
      <div class="content-area">
        <div id="system-container">
          <!-- System messages will be inserted here -->
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
        
        <div class="chat-resizer" id="chat-resizer"></div>
        
        <div id="chat-section">
          <div id="chat-history">
            <!-- Chat messages will be inserted here -->
          </div>
          <div id="input-container">
            <input type="text" id="message-input" placeholder="Type a message..." />
            <button id="send-button" title="Send Message">
              ${icons.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get the JavaScript code for the panel
 */
function getPanelScript(): string {
  return `
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
      const connectionStatus = document.getElementById('connection-status');
      
      // Set up chat resizer
      setupChatResizer();
      
      // Function to set up the chat section resizer
      function setupChatResizer() {
        let startY;
        let startHeight;
        
        chatResizer.addEventListener('mousedown', function(e) {
          startY = e.clientY;
          startHeight = parseInt(document.defaultView.getComputedStyle(chatSection).height, 10);
          
          document.documentElement.style.cursor = 'ns-resize';
          document.addEventListener('mousemove', onResize);
          document.addEventListener('mouseup', stopResize);
          
          e.preventDefault();
        });
        
        function onResize(e) {
          // Calculate new height (reverse the direction since we're resizing from bottom)
          const newHeight = startHeight - (e.clientY - startY);
          
          // Limit minimum and maximum height
          if (newHeight >= 80 && newHeight <= window.innerHeight * 0.6) {
            chatSection.style.height = newHeight + 'px';
            document.documentElement.style.setProperty('--chat-height', newHeight + 'px');
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
      
      // Handle messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
          case 'receiveMessage':
            addChatMessage(message.text, false);
            break;
            
          case 'connectionStatus':
            updateConnectionStatus(message.status);
            addSystemMessage(\`Connection \${message.status}\`);
            break;
            
          case 'connectionAttempt':
            updateConnectionStatus(message.status);
            break;
            
          case 'receiveDiffSuggestion':
            const diffText = \`File: \${message.fileName}
Description: \${message.description || 'No description provided'}\`;
            addSystemMessage(diffText, 'diff-suggestion');
            break;
        }
      });
      
      // Initialize with disconnected status
      updateConnectionStatus('disconnected');
    }());
  `;
}