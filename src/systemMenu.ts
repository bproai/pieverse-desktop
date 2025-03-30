// src/systemMenu.ts
import { Menu, PredefinedMenuItem, MenuItem } from '@tauri-apps/api/menu';

export async function setupNativeMenu() {
  try {
    // Create predefined menu items
    const undo = await PredefinedMenuItem.new({
      text: 'undo-text',
      item: 'Undo',
    });
    
    const redo = await PredefinedMenuItem.new({
      text: 'redo-text',
      item: 'Redo',
    });
    
    const separator = await PredefinedMenuItem.new({
      text: 'separator-text',
      item: 'Separator',
    });
    
    const cut = await PredefinedMenuItem.new({
      text: 'cut-text',
      item: 'Cut',
    });
    
    const copy = await PredefinedMenuItem.new({
      text: 'copy-text',
      item: 'Copy',
    });
    
    const paste = await PredefinedMenuItem.new({
      text: 'paste-text',
      item: 'Paste',
    });
    
    const selectAll = await PredefinedMenuItem.new({
      text: 'selectAll-text',
      item: 'SelectAll',
    });
    
    // Create custom menu items
    const aboutItem = await MenuItem.new({
      id: 'about',
      text: 'About PieVerse',
      action: () => alert(`PieVerse Desktop\nv1.0.0\nby Brian Pan\nReason ONE LLC`)
    });
    
    const docsItem = await MenuItem.new({
      id: 'docs',
      text: 'Documentation',
      action: () => window.open('https://docs.pieverse.com', '_blank')
    });
    
    const updatesItem = await MenuItem.new({
      id: 'updates',
      text: 'Check for Updates',
      action: () => alert('Checking for updates...')
    });
    
    // Create Help menu with items
    const helpMenu = await Menu.new({
      items: [
        {
          id: 'help',
          text: 'Help',
          items: [aboutItem, docsItem, updatesItem]
        }
      ]
    });
    
    // Create Edit menu with predefined items
    const editMenu = await Menu.new({
      items: [undo, redo, separator, cut, copy, paste, selectAll]
    });
    
    // Set as app menu
    await helpMenu.setAsAppMenu();
    
    console.log('Native menu setup complete using Tauri 2.0 API');
  } catch (error) {
    console.error('Failed to setup native menu:', error);
  }
}