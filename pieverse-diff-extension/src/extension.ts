import * as vscode from 'vscode';
import WebSocket from 'ws';

let ws: WebSocket | null = null;

// Define a simple TreeItem for your Diff Dashboard
class DiffTreeItem extends vscode.TreeItem {
  constructor(public readonly label: string) {
    super(label);
  }
}

// Create a basic TreeDataProvider that supplies some sample items
class DiffTreeDataProvider implements vscode.TreeDataProvider<DiffTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DiffTreeItem | undefined | void> =
    new vscode.EventEmitter<DiffTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<DiffTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: DiffTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DiffTreeItem): Thenable<DiffTreeItem[]> {
    if (!element) {
      // Return top-level items
      return Promise.resolve([
        new DiffTreeItem("Sample diff item 1"),
        new DiffTreeItem("Sample diff item 2")
      ]);
    }
    // No child elements for now
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('PieVerse Diff Extension activated.');

  // Register a TreeDataProvider for the view with id "pieverseDiffView"
  const treeDataProvider = new DiffTreeDataProvider();
  vscode.window.registerTreeDataProvider("pieverseDiffView", treeDataProvider);

  // Connect to the WebSocket server (adjust the URL as needed)
  const wsUrl = 'ws://localhost:PORT'; // Replace PORT with your Tauri server port
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('Connected to Tauri WebSocket server.');
  });

  ws.on('message', (data: WebSocket.Data) => {
    console.log('Received data from Tauri:', data);
    handleSuggestedUpdate(data.toString());
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed.');
  });

  ws.on('error', (error: any) => {
    console.error('WebSocket error:', error);
  });

  // Register a command to manually trigger a diff view (for testing)
  let disposable = vscode.commands.registerCommand('pieverse-diff.showDiff', async () => {
    const leftUri = vscode.Uri.file('/path/to/originalFile.js');  // Adjust these paths
    const rightUri = vscode.Uri.file('/path/to/suggestedFile.js');
    vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, 'Code Diff');
  });
  context.subscriptions.push(disposable);
}

function handleSuggestedUpdate(suggestedData: string) {
  try {
    const suggestion = JSON.parse(suggestedData);
    const leftUri = vscode.Uri.file(suggestion.originalFile);
    // Write the suggested content to a temporary file
    const tempFile = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'temp-suggested.js');
    vscode.workspace.fs.writeFile(tempFile, Buffer.from(suggestion.suggestedContent, 'utf8')).then(() => {
      vscode.commands.executeCommand('vscode.diff', leftUri, tempFile, 'Suggested Update Diff');
    });
  } catch (error) {
    console.error('Error parsing suggested update:', error);
  }
}

export function deactivate() {
  if (ws) {
    ws.close();
  }
}
