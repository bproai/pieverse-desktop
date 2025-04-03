## WebView2 DevTools

PieVerse Desktop includes integrated support for WebView2 DevTools, providing comprehensive debugging capabilities for the application's web layer.

### Accessing WebView2 DevTools

There are multiple ways to access the built-in WebView2 DevTools:

1. Press `F12` while the application is in focus
2. Right-click anywhere in the application and select "Inspect Element"
3. Programmatically through Rust code with `window.webview.open_devtools()`

### Available Tools

WebView2 DevTools provides a full suite of browser developer tools:

- **Elements Panel**: Inspect and modify the DOM and CSS
- **Console Panel**: View logs, errors, and interact with JavaScript
- **Sources Panel**: Debug JavaScript with breakpoints and step-through execution
- **Network Panel**: Monitor HTTP requests and responses
- **Application Panel**: Manage storage, service workers, and cache
- **Performance Panel**: Analyze runtime performance
- **Memory Panel**: Identify memory leaks and optimize memory usage

### Debugging Tips

- Use `console.log()`, `console.warn()`, and `console.error()` in your code to output debug information
- Set breakpoints in your JavaScript code to step through execution
- Inspect React component rendering performance with the Performance panel
- Examine network requests to debug API interactions
- Use the Application panel to inspect localStorage, sessionStorage, and other web storage

### Production Builds

WebView2 DevTools is configured to be available in both development and production builds of PieVerse Desktop. This allows for debugging issues that only occur in production environments.

### Using with React DevTools

For React-specific debugging, use WebView2 DevTools in conjunction with the standalone React DevTools:

1. Use React DevTools for React component inspection, props, and state
2. Use WebView2 DevTools for general web debugging, network analysis, and performance profiling

This combination provides a complete debugging environment for the entire application stack.
