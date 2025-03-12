import * as vscode from 'vscode';

/**
 * Tree item representing a diff item in the tree view
 */
export class DiffTreeItem extends vscode.TreeItem {
  constructor(public readonly label: string, public readonly filePath?: string) {
    super(label);
    
    if (filePath) {
      this.tooltip = filePath;
      this.command = {
        command: 'pieverse-diff.showDiff',
        title: 'Show Diff',
        arguments: [filePath]
      };
    }
  }
}

/**
 * Tree data provider for the diff view
 */
export class DiffTreeDataProvider implements vscode.TreeDataProvider<DiffTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DiffTreeItem | undefined | void> =
    new vscode.EventEmitter<DiffTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<DiffTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private diffItems: DiffTreeItem[] = [
    new DiffTreeItem("Connect to PieVerse Desktop")
  ];

  /**
   * Get the tree item for the given element
   */
  getTreeItem(element: DiffTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get the children of the given element
   */
  getChildren(element?: DiffTreeItem): Thenable<DiffTreeItem[]> {
    if (!element) {
      // Return top-level items
      return Promise.resolve(this.diffItems);
    }
    // No child elements for now
    return Promise.resolve([]);
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Update the diff items in the tree view
   */
  updateDiffItems(items: DiffTreeItem[]): void {
    this.diffItems = items;
    this.refresh();
  }

  /**
   * Add a diff item to the tree view
   */
  addDiffItem(item: DiffTreeItem): void {
    // Only add if not a duplicate
    if (!this.diffItems.some(existing => existing.label === item.label)) {
      this.diffItems = [item, ...this.diffItems];
      this.refresh();
    }
  }
}