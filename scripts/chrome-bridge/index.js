const CDP = require("chrome-remote-interface");
const WebSocket = require("ws");
const http = require("http");

// Create a WebSocket server on port 8943
const server = http.createServer();
const wss = new WebSocket.Server({ server });
const PORT = 8943;

console.log(`Chrome Logger Bridge starting on ws://localhost:${PORT}`);

// Keep track of connected clients
let clients = [];
// Keep track of Chrome target connections
let targetConnections = {};

// Handle WebSocket connections from your Tauri app
wss.on("connection", (ws) => {
  console.log("Tauri app connected");
  clients.push(ws);

  // Send connection status message
  ws.send(JSON.stringify({
    type: "system",
    level: "info",
    text: "Connected to Chrome Logger Bridge",
    timestamp: Date.now()
  }));

  // Send initial list of connections
  Object.entries(targetConnections).forEach(([targetId, { target }]) => {
    ws.send(JSON.stringify({
      type: "system",
      level: "info",
      text: `Already connected to: ${target.title || target.url}`,
      targetId,
      targetTitle: target.title || target.url,
      timestamp: Date.now()
    }));
  });

  // Handle messages from the Tauri app
  ws.on("message", async (message) => {
    try {
      const command = JSON.parse(message.toString());
      
      if (command.type === "connect" && command.targetUrl) {
        await connectToWebSocket(command.targetUrl);
      } else if (command.type === "disconnect" && command.targetUrl) {
        disconnectFromTarget(command.targetUrl);
      } else if (command.type === "listTargets") {
        const targets = await listChromeTargets();
        ws.send(JSON.stringify({
          type: "targetList",
          targets
        }));
      }
    } catch (err) {
      console.error("Error handling message:", err);
      ws.send(JSON.stringify({
        type: "system",
        level: "error",
        text: `Error: ${err.message}`,
        timestamp: Date.now()
      }));
    }
  });

  ws.on("close", () => {
    console.log("Tauri app disconnected");
    clients = clients.filter(client => client !== ws);
    
    // If no clients are connected, disconnect from all targets
    if (clients.length === 0) {
      Object.keys(targetConnections).forEach(targetUrl => {
        disconnectFromTarget(targetUrl);
      });
    }
  });
});

// Fetch list of Chrome targets
async function listChromeTargets() {
  try {
    const targets = await CDP.List();
    return targets;
  } catch (err) {
    console.error("Error listing targets:", err);
    return [];
  }
}

// Connect to a Chrome DevTools WebSocket
async function connectToWebSocket(targetUrl) {
  // Skip if already connected
  if (targetConnections[targetUrl]) {
    return;
  }
  
  try {
    console.log(`Connecting to: ${targetUrl}`);
    
    // Extract target ID from the WebSocket URL
    const targetId = targetUrl.split('/').pop();
    
    // Get target information
    const targets = await CDP.List();
    const targetInfo = targets.find(t => t.webSocketDebuggerUrl === targetUrl);
    
    if (!targetInfo) {
      throw new Error(`Target not found: ${targetUrl}`);
    }
    
    // Connect using CDP
    const client = await CDP({ target: targetUrl });
    
    // Enable console events
    await client.Console.enable();
    
    console.log(`Connected to ${targetInfo.title || targetInfo.url}`);
    
    // Store connection
    targetConnections[targetUrl] = {
      client,
      target: targetInfo
    };
    
    // Send success message to all clients
    broadcast({
      type: "system",
      level: "info",
      text: `Connected to ${targetInfo.title || targetInfo.url}`,
      targetId: targetInfo.id,
      targetTitle: targetInfo.title || targetInfo.url,
      timestamp: Date.now()
    });
    
    // Listen for console messages
    client.Console.messageAdded(({ message }) => {
      broadcast({
        type: "log",
        level: message.level || "info",
        text: message.text || JSON.stringify(message),
        source: message.source || "console",
        targetId: targetInfo.id,
        targetTitle: targetInfo.title || targetInfo.url,
        timestamp: Date.now()
      });
    });
    
    // Handle disconnection
    client.on("disconnect", () => {
      console.log(`Disconnected from ${targetInfo.title || targetInfo.url}`);
      delete targetConnections[targetUrl];
      
      broadcast({
        type: "system",
        level: "info",
        text: `Disconnected from ${targetInfo.title || targetInfo.url}`,
        targetId: targetInfo.id,
        targetTitle: targetInfo.title || targetInfo.url,
        timestamp: Date.now()
      });
    });
    
  } catch (err) {
    console.error(`Error connecting to ${targetUrl}:`, err);
    broadcast({
      type: "system",
      level: "error",
      text: `Failed to connect to ${targetUrl}: ${err.message}`,
      timestamp: Date.now()
    });
  }
}

// Disconnect from a target
function disconnectFromTarget(targetUrl) {
  const connection = targetConnections[targetUrl];
  if (connection) {
    try {
      console.log(`Disconnecting from ${connection.target.title || connection.target.url}`);
      connection.client.close();
      delete targetConnections[targetUrl];
      
      broadcast({
        type: "system",
        level: "info",
        text: `Disconnected from ${connection.target.title || connection.target.url}`,
        targetId: connection.target.id,
        targetTitle: connection.target.title || connection.target.url,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error(`Error disconnecting from ${targetUrl}:`, err);
    }
  }
}

// Broadcast message to all connected clients
function broadcast(message) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Start the server
server.listen(PORT, () => {
  console.log(`Chrome Logger Bridge running on ws://localhost:${PORT}`);
});

// Handle server errors
server.on("error", (err) => {
  console.error("Server error:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  
  // Disconnect from all targets
  Object.keys(targetConnections).forEach(targetUrl => {
    disconnectFromTarget(targetUrl);
  });
  
  // Close all WebSocket connections
  wss.clients.forEach(client => {
    client.close();
  });
  
  // Close the server
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});