// src/systemMenu.ts
import { Menu, PredefinedMenuItem, MenuItem } from '@tauri-apps/api/menu';

export async function setupNativeMenu() {
  try {
    // Create predefined menu items for Edit menu using standard macOS naming
    const undo = await PredefinedMenuItem.new({
      item: 'Undo',
    });
    
    const redo = await PredefinedMenuItem.new({
      item: 'Redo',
    });
    
    const separator = await PredefinedMenuItem.new({
      item: 'Separator',
    });
    
    const cut = await PredefinedMenuItem.new({
      item: 'Cut',
    });
    
    const copy = await PredefinedMenuItem.new({
      item: 'Copy',
    });
    
    const paste = await PredefinedMenuItem.new({
      item: 'Paste',
    });
    
    const selectAll = await PredefinedMenuItem.new({
      item: 'SelectAll',
    });
    
    // Create app menu items for the PieVerse menu
    const aboutItem = await MenuItem.new({
      id: 'about',
      text: 'About PieVerse',
      action: () => alert(`PieVerse Desktop\nv1.0.0\n\nby Brian Pan\nReason ONE LLC\nMountain View, California`)
    });
    
    // const prefsItem = await MenuItem.new({
    //   id: 'preferences',
    //   text: 'Preferences...',
    //   action: () => alert('Preferences not implemented yet')
    // });
    
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
          // items: [aboutItem, separator, prefsItem, separator, quitItem]
          items: [aboutItem, separator, quitItem]
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