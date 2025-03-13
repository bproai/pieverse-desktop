# PieVerse Diff Extension

A Visual Studio Code extension to help you view and merge code differences inspired by Roo Code/Roo Cline. This extension connects via WebSocket to your Tauri app to receive suggested code updates, then displays a side‑by‑side diff using VS Code's built‑in diff viewer.

## Features

- **Real-Time Updates:**  
  Receives suggested code changes from your Tauri app using WebSocket.
  
- **Side‑by‑Side Diff View:**  
  Automatically opens a diff view between your current file and the suggested update.

- **Custom Commands:**  
  Provides commands to trigger the diff view manually.

## Installation

1. Clone or download this repository.
2. Open the extension folder (`pieverse-diff-extension`) in VS Code.
3. Run `npm install` to install dependencies.
4. Press `F5` to open a new Extension Development Host window and test the extension.
5. To package the extension for distribution, run:
   ```bash
   vsce package

## Future Work

1. 
2. 
3. 