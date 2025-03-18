import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';

interface MCPStatus {
  running: boolean;
  port: number;
  url: string;
  allowed_directories: string[];
}

const ClaudeMCPPanel: React.FC = () => {
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [newDirectory, setNewDirectory] = useState('');
  const [customPort, setCustomPort] = useState<number>(3500);
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch server status on load
  useEffect(() => {
    fetchStatus();
  }, []);

  // HTTP-based port availability check
  const checkPortAvailability = async (port: number): Promise<boolean> => {
    try {
      await fetch(`http://localhost:${port}`, { method: 'GET' });
      // If fetch succeeds (even with an error response), something is listening.
      return false;
    } catch (error) {
      // If fetch fails, the port is likely available.
      return true;
    }
  };

  const fetchStatus = async () => {
    try {
      console.log("Fetching MCP server status...");
      const response = await core.invoke<MCPStatus>('get_claude_mcp_status');
      console.log("MCP Status response:", response);
      setStatus(response);
    } catch (error) {
      console.error('Failed to fetch MCP status:', error);
      setStatusMessage(`Error: ${error}`);
    }
  };

  const startServer = async () => {
    setLoading(true);
    setStatusMessage('Starting server...');
    try {
      console.log("About to start server with port:", customPort);
      
      // Use the HTTP check for port availability
      const portAvailable = await checkPortAvailability(customPort);
      console.log(`Port ${customPort} availability:`, portAvailable);
      
      if (!portAvailable) {
        setStatusMessage(`Error: Port ${customPort} is already in use`);
        setLoading(false);
        return;
      }
      
      // Get current status to check allowed directories
      const currentStatus = await core.invoke<MCPStatus>('get_claude_mcp_status');
      console.log("Current status before starting:", currentStatus);
      
      if (currentStatus.allowed_directories.length === 0) {
        setStatusMessage('Error: Add at least one allowed directory before starting the server');
        setLoading(false);
        return;
      }
      
      console.log("Starting server with directories:", currentStatus.allowed_directories);
      
      // Set a timeout to avoid hanging indefinitely
      const serverStartPromise = core.invoke<string>('start_claude_mcp_server', { 
        port: customPort,
        directories: currentStatus.allowed_directories
      });
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Server start timed out after 10 seconds")), 10000);
      });
      
      // Race the server start with the timeout
      const result = await Promise.race([serverStartPromise, timeoutPromise]);
      console.log("Server started successfully:", result);
      setStatusMessage(result);
      await fetchStatus();
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      setStatusMessage(`Failed to start server: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const stopServer = async () => {
    setLoading(true);
    setStatusMessage('Stopping server...');
    try {
      await core.invoke('stop_claude_mcp_server');
      setStatusMessage('Server stopped successfully');
      fetchStatus();
    } catch (error) {
      console.error('Failed to stop MCP server:', error);
      setStatusMessage(`Failed to stop server: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const selectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Directory for Claude MCP'
      });
      console.log("Selected directory:", selected);
      if (selected && typeof selected === 'string') {
        setNewDirectory(selected);
        try {
          await core.invoke('add_claude_mcp_directory', { directory: selected });
          fetchStatus();
          setStatusMessage(`Added directory: ${selected}`);
        } catch (error) {
          console.error('Failed to add directory:', error);
          setStatusMessage(`Failed to add directory: ${error}`);
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
      setStatusMessage(`Error selecting directory: ${error}`);
    }
  };

  const addDirectory = async () => {
    console.log("Add button clicked", newDirectory);
    if (!newDirectory) return;
    try {
      console.log("Calling Rust function with directory:", newDirectory);
      await core.invoke('add_claude_mcp_directory', { directory: newDirectory });
      setNewDirectory('');
      await fetchStatus();
      setStatusMessage(`Added directory: ${newDirectory}`);
    } catch (error) {
      console.error('Failed to add directory - DETAILED ERROR:', error);
      setStatusMessage(`Failed to add directory: ${error}`);
    }
  };

  const removeDirectory = async (directory: string) => {
    try {
      await core.invoke('remove_claude_mcp_directory', { directory });
      fetchStatus();
      setStatusMessage(`Removed directory: ${directory}`);
    } catch (error) {
      console.error('Failed to remove directory:', error);
      setStatusMessage(`Failed to remove directory: ${error}`);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Claude MCP Server</h2>
      
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <div className="font-medium">
          Status: {status?.running ? 
            <span className="text-green-600">Running</span> : 
            <span className="text-red-600">Stopped</span>}
        </div>
        {status?.running && (
          <div className="mt-2">
            <div>URL: <span className="font-mono">{status.url}</span></div>
            <div>Port: {status.port}</div>
          </div>
        )}
        {statusMessage && (
          <div className="mt-2 text-sm text-gray-700">{statusMessage}</div>
        )}
      </div>
      
      <div className="flex space-x-2 mb-6">
        <button
          onClick={startServer}
          disabled={loading || status?.running}
          className={`px-4 py-2 rounded ${status?.running ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
        >
          Start Server
        </button>
        <button
          onClick={stopServer}
          disabled={loading || !status?.running}
          className={`px-4 py-2 rounded ${!status?.running ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}
        >
          Stop Server
        </button>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Allowed Directories</h3>
        <div className="flex mb-2">
          <input
            type="text"
            value={newDirectory}
            onChange={(e) => setNewDirectory(e.target.value)}
            placeholder="Directory path"
            className="flex-1 px-3 py-2 border rounded-l"
          />
          <button
            onClick={selectDirectory}
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300"
          >
            Browse
          </button>
          <button
            onClick={addDirectory}
            disabled={!newDirectory}
            className={`px-3 py-2 rounded-r ${!newDirectory ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
          >
            Add
          </button>
        </div>
        <div className="border rounded overflow-hidden">
          {status?.allowed_directories.length === 0 ? (
            <div className="p-3 text-gray-500">No directories added yet</div>
          ) : (
            <ul>
              {status?.allowed_directories.map((dir, index) => (
                <li key={index} className="flex justify-between items-center p-2 border-b last:border-b-0">
                  <span className="font-mono text-sm truncate">{dir}</span>
                  <button
                    onClick={() => removeDirectory(dir)}
                    className="ml-2 px-2 py-1 text-sm text-red-600 hover:bg-red-100 rounded"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Server Configuration</h3>
        <div className="flex items-center mb-2">
          <label className="mr-2">Port:</label>
          <input
            type="number"
            value={customPort}
            onChange={(e) => setCustomPort(parseInt(e.target.value))}
            className="w-24 px-3 py-2 border rounded"
            min="1025"
            max="65535"
          />
        </div>
      </div>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <h3 className="text-lg font-medium mb-2">How to Use with Claude</h3>
        <p className="mb-2">
          Once the server is running, Claude can access files in the allowed directories through the MCP protocol.
        </p>
        <p>
          Example: Ask Claude to "List files in [directory]" or "Read the content of [file]".
        </p>
      </div>
    </div>
  );
};

export default ClaudeMCPPanel;
