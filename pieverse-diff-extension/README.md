# PieVerse Diff Extension

A Visual Studio Code extension to help you view and merge code differences inspired by Roo Code/Roo Cline. This extension connects via WebSocket to your Tauri app to receive suggested code updates, then displays a side-by-side diff using VS Code's built-in diff viewer.

## Features

- **Real-Time Updates:**  
  Receives suggested code changes from your Tauri app using WebSocket.
  
- **Side-by-Side Diff View:**  
  Opens a diff view between your current file and the suggested update.
  
- **Workspace-Aware Notifications:**  
  Only shows notifications for files that exist in your current workspace.

- **Configurable Diff Behavior:**  
  Choose whether diffs open automatically or wait for you to review them.

- **Action Buttons:**  
  Easily accept, reject, or selectively apply changes with a single click.

- **Multiple Workspace Support:**  
  Works correctly with multiple VS Code windows open for different projects.

## Settings

- **WebSocket URL:**  
  Configure the WebSocket URL to connect to your Tauri app (default: `ws://localhost:3001`).

- **Create Backup Files:**  
  Option to create backup files before applying changes (useful if you don't use Git).

- **Auto-Open Diff View:**  
  Control whether diff views open automatically when receiving suggestions (default: enabled).

## Commands

- `pieverse-diff.connect`: Connect to the PieVerse server
- `pieverse-diff.showDiff`: Show the diff view for a file
- `pieverse-diff.acceptChanges`: Accept all suggested changes
- `pieverse-diff.rejectChanges`: Reject suggested changes
- `pieverse-diff.selectivelyApplyChanges`: Open files side by side for selective editing

## Installation

1. Clone or download this repository.
2. Open the extension folder (`pieverse-diff-extension`) in VS Code.
3. Run `npm install` to install dependencies.
4. Press `F5` to open a new Extension Development Host window and test the extension.
5. To package the extension for distribution, run:
   ```bash
   yes | vsce package
   ```
6. To install the packaged extension, run:
   ```bash
   code --install-extension pieverse-diff-extension-0.0.1.vsix
   ```
7. If you need to uninstall the extension, run:
   ```bash
   code --uninstall-extension reason-one-ai.pieverse-diff-extension
   ```

## Usage

1. Install the extension in VS Code.
2. Open your project folder.
3. Click the PieVerse icon in the activity bar or use the Command Palette to connect.
4. When you receive suggested changes, they will appear in the PieVerse sidebar.
5. Click "View Diff" to see a side-by-side comparison and choose how to apply the changes.

## Requirements

- Visual Studio Code v1.80.0 or higher

## Future Work

- Enhanced conflict resolution tools
- Integration with popular version control systems
- Support for additional language-specific features
