// src/systemMenu.ts
import { Menu, PredefinedMenuItem, MenuItem } from '@tauri-apps/api/menu';

export async function setupNativeMenu() {
  try {
    // Create predefined menu items for Edit menu
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
    
    // Create app menu items for the πeVerse menu
    const aboutItem = await MenuItem.new({
      id: 'about',
      text: 'About PieVerse',
      action: () => alert(`PieVerse Desktop\nv1.0.0\nby Brian Pan\nReason ONE LLC`)
    });
    
    const prefsItem = await MenuItem.new({
      id: 'preferences',
      text: 'Preferences...',
      action: () => alert('Preferences not implemented yet')
    });
    
    const quitItem = await MenuItem.new({
      id: 'quit',
      text: 'Quit PieVerse',
      action: () => window.close()
    });

    // Create help menu items
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
    
    // Create main application menu with App, Edit, and Help menus
    const appMenu = await Menu.new({
      items: [
        {
          id: 'app', // This will become the app name on macOS
          text: 'App', // This text isn't used on macOS (it becomes the app name)
          items: [aboutItem, separator, prefsItem, separator, quitItem]
        },
        {
          id: 'edit',
          text: 'Edit',
          items: [undo, redo, separator, cut, copy, paste, selectAll]
        },
        {
          id: 'help',
          text: 'Help',
          items: [docsItem, updatesItem]
        }
      ]
    });
    
    // Set as app menu
    await appMenu.setAsAppMenu();
    
    console.log('Native menu setup complete using Tauri 2.0 API');
  } catch (error) {
    console.error('Failed to setup native menu:', error);
  }
}