I'll help you fix your readme to include instructions for running the `npm run bridge` command. Here's a clear, concise explanation you can add to your readme:

```markdown
## Chrome Extension Debugging

This project includes a Chrome DevTools Protocol bridge for debugging Chrome extensions. To use this feature:

1. Close all Chrome instances

2. Start Chrome with remote debugging enabled:
   ```bash
   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   
   # Linux
   google-chrome --remote-debugging-port=9222
   ```

3. In a separate terminal window, start the Chrome Logger Bridge:
   ```bash
   npm run bridge
   ```

4. Launch the app in another terminal window:
   ```bash
   npm run tauri dev
   ```

5. Navigate to the Chrome DevTools Protocol Debugger in the app and click "Refresh Targets" to see available Chrome targets.

6. Select the extension or other Chrome target you want to monitor, then click "Connect" to start capturing logs.

The bridge creates a WebSocket server that facilitates communication between Chrome's DevTools Protocol and the application, allowing you to monitor console logs from Chrome extensions and other Chrome targets in real-time.
```

Feel free to adjust the wording or add more details specific to your application if needed. This explanation covers the essential steps for users to get started with the Chrome extension debugging feature.