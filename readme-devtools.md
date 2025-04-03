## React DevTools Setup

PieVerse Desktop includes integration with React DevTools to enable efficient debugging of React components. This section explains how to set up and use the standalone React DevTools with your Tauri application.

### Installation

First, install the standalone React DevTools globally:

```bash
# Install React DevTools globally
npm install -g react-devtools
```

### Starting React DevTools

Before launching your PieVerse Desktop application, start the React DevTools server in a separate terminal:

```bash
# Start the React DevTools server
react-devtools
```

This will launch the React DevTools application, which listens on port 8097 by default.

### Connecting to Your Application

PieVerse Desktop automatically connects to React DevTools when running in development mode thanks to a custom Vite plugin that injects the necessary connection script. The plugin is already configured in the project's `vite.config.ts`.

### Workflow

1. Start the React DevTools server: `react-devtools`
2. Launch PieVerse in development mode: `npm run tauri dev`
3. The application will automatically connect to the React DevTools server
4. Use the React DevTools interface to inspect and debug your React component tree

### Troubleshooting

If the connection fails:

- Ensure React DevTools is running before starting the application
- Verify port 8097 is not blocked by your firewall
- Check the browser console for any connection errors
- Restart both the React DevTools server and your application

The configuration uses a Vite plugin that only injects the connection script during development, so there's no need to worry about it affecting production builds.
