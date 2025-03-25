// src/components/MCPClient/MCPClientPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Text, 
  Badge, 
  Card, 
  Group, 
  Button, 
  TextInput,
  Switch,
  ScrollArea,
  Stack,
  Alert,
  Code,
  Accordion,
  ActionIcon,
  Tooltip,
  Select,
  JsonInput
} from '@mantine/core';
import { 
  Bot, 
  RefreshCw, 
  AlertCircle, 
  Terminal,
  Folder,
  Globe,
  ChevronDown,
  ChevronUp,
  Send,
  Trash,
  Plus,
  Copy,
  Settings,
  Upload,
  Download 
} from 'lucide-react';
import { notifications } from '@mantine/notifications';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { listen, Event } from '@tauri-apps/api/event';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

interface MCPConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPServersConfig {
  mcpServers: Record<string, MCPConfig>;
}

interface DirectoryConfig {
  path: string;
  name: string;
  enabled: boolean;
}

interface ToolResult {
  success: boolean;
  result: any;
  error: string | null;
}

const MCPClientPanel: React.FC = () => {
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverOutput, setServerOutput] = useState<string[]>([]);
  const [allowedDirectories, setAllowedDirectories] = useState<DirectoryConfig[]>([]);
  const [dockerCommand, setDockerCommand] = useState('docker');
  const [dockerArgs, setDockerArgs] = useState('run -i --rm --init -e DOCKER_CONTAINER=true mcp/puppeteer');
  
  // MCP server configuration state
  const [mcpServers, setMcpServers] = useState<Record<string, MCPConfig>>({
    "puppeteer": {
      command: "docker",
      args: ["run", "-i", "--rm", "--init", "-e", "DOCKER_CONTAINER=true", "mcp/puppeteer"]
    }
  });
  const [selectedServerType, setSelectedServerType] = useState<string>("puppeteer");
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [configJson, setConfigJson] = useState('');
  
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolArgs, setToolArgs] = useState('{}');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [screenshotData, setScreenshotData] = useState<{ data: string, mimeType: string } | null>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serverOutput]);

  // Get initial MCP server status and load configuration
  useEffect(() => {
    checkServerStatus();
    loadMcpServersConfig();
    
    // Listen for MCP server output
    const unlistenOutput = listen('mcp-server-output', (event: Event<string>) => {
      const output = event.payload;
      setServerOutput(prev => [...prev, output]);
      
      // Check if this is a tools list
      if (output.startsWith('Available tools:')) {
        try {
          const toolsStr = output.substring('Available tools:'.length).trim();
          const tools = toolsStr.split(',').map(t => t.trim()).filter(t => t);
          setAvailableTools(tools);
          
          if (tools.length > 0 && !selectedTool) {
            setSelectedTool(tools[0]);
          }
        } catch (err) {
          console.error('Error parsing tools:', err);
        }
      }
    });
    
    // Listen for MCP server stopped event
    const unlistenStopped = listen('mcp-server-stopped', () => {
      setIsServerRunning(false);
      setAvailableTools([]);
      setSelectedTool(null);
      notifications.show({
        title: 'MCP Server Stopped',
        message: 'The MCP server has stopped',
        color: 'yellow'
      });
    });
    
    // Listen for tool results
    const unlistenResults = listen('mcp-tool-result', (event: Event<ToolResult>) => {
      const result = event.payload;
    
      // Check if the result is an array and extract the image data
      if (Array.isArray(result.result)) {
        const imageResult = result.result.find((item: any) => item.type === 'image' && item.data);
        if (imageResult) {
          setScreenshotData({
            data: imageResult.data,
            mimeType: imageResult.mimeType || 'image/png' // Default if not provided
          });
          console.log("Received image data:", imageResult.data);          
        }
      } else if (result.result && result.result.type === 'image' && result.result.data) {
        setScreenshotData({
          data: result.result.data,
          mimeType: result.result.mimeType || 'image/png'
        });
      }
    
      if (!result.success && result.error) {
        notifications.show({
          title: 'Tool Execution Failed',
          message: result.error,
          color: 'red'
        });
      } else {
        notifications.show({
          title: 'Tool Execution Succeeded',
          message: 'The tool was executed successfully',
          color: 'green'
        });
      }
    });
    
    // Cleanup event listeners
    return () => {
      unlistenOutput.then(fn => fn());
      unlistenStopped.then(fn => fn());
      unlistenResults.then(fn => fn());
    };
  }, [selectedTool]);

  // Load MCP servers configuration from local state or create a default config
  const loadMcpServersConfig = () => {
    try {
      // This is a mock function since we're not modifying the backend
      // In a real implementation, this would call the backend API
      const defaultConfig: MCPServersConfig = {
        mcpServers: {
          "filesystem": {
            command: "docker",
            args: [
              "run",
              "-i",
              "--rm",
              "--mount", "type=bind,src=/Users/brian.pan/Desktop,dst=/projects/Desktop",
              "--mount", "type=bind,src=/Users/brian.pan/Downloads,dst=/projects/Downloads",
              "mcp/filesystem",
              "/projects"
            ]
          },
          "brave-search": {
            command: "docker",
            args: [
              "run",
              "-i",
              "--rm",
              "-e",
              "BRAVE_API_KEY=BSAhxxZOTsSPVAi4c-5Jye3ZNTxiCpO",
              "mcp/brave-search"
            ],
            env: {
              "BRAVE_API_KEY": "BSAhxxZOTsSPVAi4c-5Jye3ZNTxiCpO"
            }
          },
          "puppeteer": {
            command: "docker",
            args: ["run", "-i", "--rm", "--init", "-e", "DOCKER_CONTAINER=true", "mcp/puppeteer"]
          },
          "memory": {
            command: "docker",
            args: ["run", "-i", "-v", "claude-memory:/app/dist", "--rm", "mcp/memory"]
          },
          "google-maps": {
            command: "docker",
            args: [
              "run",
              "-i",
              "--rm",
              "-e",
              "GOOGLE_MAPS_API_KEY=AIzaSyBxyXz9rCZdUAU3e1Gqp69rfUAAhayNlc4s",
              "mcp/google-maps"
            ],
            env: {
              "GOOGLE_MAPS_API_KEY": "AIzaSyBxyXz9rCZdUAU3e1Gqp69rfUAAhayNlc4"
            }
          }
        }
      };
      
      setMcpServers(defaultConfig.mcpServers);
      setConfigJson(JSON.stringify(defaultConfig, null, 2));
      
      // Update the UI with the current server configuration
      if (selectedServerType && defaultConfig.mcpServers[selectedServerType]) {
        const currentConfig = defaultConfig.mcpServers[selectedServerType];
        setDockerCommand(currentConfig.command);
        setDockerArgs(currentConfig.args.join(' '));
      }
    } catch (err: any) {
      console.error('Error loading MCP servers config:', err);
      setError(`Failed to load MCP servers configuration: ${err.toString()}`);
    }
  };

  // Save the MCP servers configuration
  const saveMcpServersConfig = () => {
    try {
      let parsedConfig: MCPServersConfig;
      try {
        parsedConfig = JSON.parse(configJson);
        setMcpServers(parsedConfig.mcpServers);
        
        // Update the UI with the current server configuration if it exists
        if (selectedServerType && parsedConfig.mcpServers[selectedServerType]) {
          const currentConfig = parsedConfig.mcpServers[selectedServerType];
          setDockerCommand(currentConfig.command);
          setDockerArgs(currentConfig.args.join(' '));
        }
        
        notifications.show({
          title: 'Success',
          message: 'MCP servers configuration saved successfully',
          color: 'green'
        });
        
        setShowConfigEditor(false);
      } catch (parseErr) {
        notifications.show({
          title: 'Invalid JSON',
          message: 'Please enter valid JSON configuration',
          color: 'red'
        });
      }
    } catch (err: any) {
      console.error('Error saving MCP servers config:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to save configuration: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  // Handle server type selection change
  const handleServerTypeChange = (value: string | null) => {
    if (value && mcpServers[value]) {
      setSelectedServerType(value);
      
      // Update the UI with the selected server configuration
      const config = mcpServers[value];
      setDockerCommand(config.command);
      setDockerArgs(config.args.join(' '));
    }
  };

  const checkServerStatus = async () => {
    try {
      const isRunning = await core.invoke<boolean>('get_puppeteer_mcp_status');
      setIsServerRunning(isRunning);
      
      // Get allowed directories
      const dirs = await core.invoke<DirectoryConfig[]>('get_puppeteer_mcp_directories');
      setAllowedDirectories(dirs);
      
      // Get MCP configuration
      const config = await core.invoke<MCPConfig>('get_puppeteer_mcp_config');
      setDockerCommand(config.command);
      setDockerArgs(config.args.join(' '));
      
      // If server is running, get available tools
      if (isRunning) {
        const tools = await core.invoke<string[]>('get_puppeteer_mcp_tools');
        setAvailableTools(tools);
        
        if (tools.length > 0 && !selectedTool) {
          setSelectedTool(tools[0]);
        }
      }
    } catch (err: any) {
      console.error('Error checking MCP server status:', err);
      setError(`Failed to check server status: ${err.toString()}`);
    }
  };

  const startMCPServer = async () => {
    setLoading(true);
    setError(null);
    try {
      // Split docker args into array
      const argsArray = dockerArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      
      // Update config first based on the selected server type
      const configToUse = {
        command: dockerCommand,
        args: argsArray
      };
      
      // Save the current config
      await core.invoke('update_puppeteer_mcp_config', { config: configToUse });
      
      // Start the server
      await core.invoke('start_puppeteer_mcp_server');
      
      setIsServerRunning(true);
      notifications.show({
        title: 'Success',
        message: `${selectedServerType} MCP server started successfully`,
        color: 'green'
      });
    } catch (err: any) {
      console.error('Error starting MCP server:', err);
      setError(`Failed to start server: ${err.toString()}`);
      notifications.show({
        title: 'Error',
        message: `Failed to start MCP server: ${err.toString()}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const stopMCPServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('stop_puppeteer_mcp_server');
      setIsServerRunning(false);
      setAvailableTools([]);
      setSelectedTool(null);
      notifications.show({
        title: 'Success',
        message: 'MCP server stopped successfully',
        color: 'blue'
      });
    } catch (err: any) {
      console.error('Error stopping MCP server:', err);
      setError(`Failed to stop server: ${err.toString()}`);
      notifications.show({
        title: 'Error',
        message: `Failed to stop MCP server: ${err.toString()}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const executeTool = async () => {
    if (!selectedTool) {
      notifications.show({
        title: 'Error',
        message: 'Please select a tool to execute',
        color: 'red'
      });
      return;
    }
    
    try {
      // Parse JSON arguments
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(toolArgs || '{}');
      } catch (parseErr) {
        notifications.show({
          title: 'Invalid JSON',
          message: 'Please enter valid JSON arguments',
          color: 'red'
        });
        return;
      }
      
      // Call the tool
      await core.invoke('send_to_puppeteer_mcp', { 
        tool: selectedTool,
        args: parsedArgs
      });
      
      // Set a loading message in the server output
      setServerOutput(prev => [...prev, `Executing tool: ${selectedTool}...`]);
      
    } catch (err: any) {
      console.error('Error executing tool:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to execute tool: ${err.toString()}`,
        color: 'red'
      });
      
      // Add error to server output
      setServerOutput(prev => [...prev, `Error executing tool: ${err.toString()}`]);
    }
  };

  const clearOutput = () => {
    setServerOutput([]);
  };

  const browseDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Directory for MCP Access'
      });
      
      if (selected && typeof selected === 'string') {
        const dirName = selected.split(/[/\\]/).pop() || 'Unknown';
        
        await core.invoke('add_puppeteer_mcp_directory', { 
          directory: selected, 
          name: dirName 
        });
        
        // Refresh directories after adding
        const dirs = await core.invoke<DirectoryConfig[]>('get_puppeteer_mcp_directories');
        setAllowedDirectories(dirs);
        
        notifications.show({
          title: 'Directory Added',
          message: `Added directory: ${dirName}`,
          color: 'green'
        });
      }
    } catch (err: any) {
      console.error('Error browsing for directory:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to browse for directory: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  const toggleDirectory = async (index: number) => {
    const updatedDirs = [...allowedDirectories];
    updatedDirs[index].enabled = !updatedDirs[index].enabled;
    
    try {
      await core.invoke('update_puppeteer_mcp_directory', { 
        directory: updatedDirs[index].path,
        enabled: updatedDirs[index].enabled
      });
      
      // Refresh directories after toggling
      const dirs = await core.invoke<DirectoryConfig[]>('get_puppeteer_mcp_directories');
      setAllowedDirectories(dirs);
    } catch (err: any) {
      console.error('Error toggling directory:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to update directory: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  const removeDirectory = async (index: number) => {
    const dirToRemove = allowedDirectories[index];
    
    try {
      await core.invoke('remove_puppeteer_mcp_directory', { 
        directory: dirToRemove.path 
      });
      
      // Refresh directories after removing
      const dirs = await core.invoke<DirectoryConfig[]>('get_puppeteer_mcp_directories');
      setAllowedDirectories(dirs);
      
      notifications.show({
        title: 'Directory Removed',
        message: `Removed directory: ${dirToRemove.name}`,
        color: 'blue'
      });
    } catch (err: any) {
      console.error('Error removing directory:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to remove directory: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  const saveDockerConfig = async () => {
    try {
      // Split docker args into array
      const argsArray = dockerArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      
      // Update the current server type in the mcpServers object
      const updatedServers = { ...mcpServers };
      updatedServers[selectedServerType] = {
        ...updatedServers[selectedServerType],
        command: dockerCommand,
        args: argsArray
      };
      
      setMcpServers(updatedServers);
      
      // Update the puppeteer config for backward compatibility
      await core.invoke('update_puppeteer_mcp_config', { 
        config: {
          command: dockerCommand,
          args: argsArray 
        }
      });
      
      // Update the config JSON
      setConfigJson(JSON.stringify({ mcpServers: updatedServers }, null, 2));
      
      notifications.show({
        title: 'Success',
        message: 'Docker configuration saved successfully',
        color: 'green'
      });
    } catch (err: any) {
      console.error('Error saving docker configuration:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to save configuration: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(serverOutput.join('\n')).then(() => {
      notifications.show({
        title: 'Copied',
        message: 'Server output copied to clipboard',
        color: 'green'
      });
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const importConfiguration = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Configuration Files',
          extensions: ['json']
        }],
        title: 'Import MCP Configuration'
      });
      
      if (selected && typeof selected === 'string') {
        const fileContent = await readTextFile(selected);
        
        try {
          const parsedConfig = JSON.parse(fileContent);
          
          // Validate the config has the expected structure
          if (!parsedConfig.mcpServers || typeof parsedConfig.mcpServers !== 'object') {
            throw new Error('Invalid configuration format: missing mcpServers object');
          }
          
          // Update the configuration
          setConfigJson(JSON.stringify(parsedConfig, null, 2));
          setMcpServers(parsedConfig.mcpServers);
          
          // If the currently selected server exists in the new config, update the UI
          if (parsedConfig.mcpServers[selectedServerType]) {
            const config = parsedConfig.mcpServers[selectedServerType];
            setDockerCommand(config.command);
            setDockerArgs(config.args.join(' '));
          }
          // Otherwise, select the first server in the config
          else if (Object.keys(parsedConfig.mcpServers).length > 0) {
            const firstServer = Object.keys(parsedConfig.mcpServers)[0];
            setSelectedServerType(firstServer);
            const config = parsedConfig.mcpServers[firstServer];
            setDockerCommand(config.command);
            setDockerArgs(config.args.join(' '));
          }
          
          notifications.show({
            title: 'Success',
            message: 'Configuration imported successfully',
            color: 'green'
          });
        } catch (parseErr: any) {
          console.error('Error parsing config file:', parseErr);
          notifications.show({
            title: 'Invalid Configuration',
            message: `Failed to parse configuration file: ${parseErr.toString()}`,
            color: 'red'
          });
        }
      }
    } catch (err: any) {
      console.error('Error importing configuration:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to import configuration: ${err.toString()}`,
        color: 'red'
      });
    }
  };
  
  const exportConfiguration = async () => {
    try {
      // Make sure we have a valid configuration to export
      let configToExport: MCPServersConfig;
      try {
        configToExport = JSON.parse(configJson);
      } catch (parseErr: any) {
        notifications.show({
          title: 'Invalid Configuration',
          message: 'Current configuration has invalid JSON syntax. Please fix before exporting.',
          color: 'red'
        });
        return;
      }
      
      const savePath = await saveDialog({
        filters: [{
          name: 'Configuration Files',
          extensions: ['json']
        }],
        defaultPath: 'pieverse_desktop_config.json',
        title: 'Save MCP Configuration'
      });
      
      if (savePath) {
        await writeTextFile(savePath, configJson);
        
        notifications.show({
          title: 'Success',
          message: 'Configuration exported successfully',
          color: 'green'
        });
      }
    } catch (err: any) {
      console.error('Error exporting configuration:', err);
      notifications.show({
        title: 'Error',
        message: `Failed to export configuration: ${err.toString()}`,
        color: 'red'
      });
    }
  };

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card.Section p="md" className="border-b">
        <Group justify="space-between">
          <Group>
            <Bot size={20} />
            <Text size="xl" fw={700}>MCP Server</Text>
          </Group>
          <Group>
            <Badge 
              color={isServerRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {isServerRunning ? 'Running' : 'Stopped'}
            </Badge>
            <Tooltip label="Edit Configuration">
              <ActionIcon onClick={() => setShowConfigEditor(!showConfigEditor)}>
                <Settings size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card.Section>
      
      <Stack spacing="md" mt="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Alert color="red" title="Error" icon={<AlertCircle size={16} />} withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        {showConfigEditor ? (
          <Card withBorder p="xs">
            <Text size="sm" fw={600} mb="xs">MCP Servers Configuration</Text>
            <JsonInput
              value={configJson}
              onChange={(value) => {
                // Replace any smart quotes with straight quotes
                const sanitized = value
                  .replace(/[""]/g, '"')
                  .replace(/['']/g, "'");
                setConfigJson(sanitized);
              }}
              autosize
              minRows={10}
              mb="sm"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <Group>
              <Button 
                onClick={() => setShowConfigEditor(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button 
                onClick={saveMcpServersConfig}
                color="green"
              >
                Save Configuration
              </Button>
              <Button
                onClick={importConfiguration}
                variant="outline"
                color="blue"
                leftSection={<Upload size={14} />}
              >
                Import From File
              </Button>
              <Button
                onClick={exportConfiguration}
                variant="outline"
                color="blue"
                leftSection={<Download size={14} />}
              >
    Export To File
  </Button>
</Group>
          </Card>
        ) : (
          <>
            <Group justify="space-between">
              <Select
                label="MCP Server Type"
                description="Select the MCP server to run"
                data={Object.keys(mcpServers).map(server => ({ 
                  value: server, 
                  label: server.charAt(0).toUpperCase() + server.slice(1) 
                }))}
                value={selectedServerType}
                onChange={(value) => value && handleServerTypeChange(value)}
                style={{ minWidth: '200px' }}
              />
              
              {!isServerRunning ? (
                <Button 
                  onClick={startMCPServer}
                  loading={loading}
                  leftSection={<Terminal size={14} />}
                >
                  Start MCP Server
                </Button>
              ) : (
                <Button 
                  onClick={stopMCPServer}
                  loading={loading}
                  color="red"
                  leftSection={<Terminal size={14} />}
                >
                  Stop MCP Server
                </Button>
              )}
              
              <Button 
                variant="outline"
                onClick={checkServerStatus}
                leftSection={<RefreshCw size={14} />}
              >
                Refresh Status
              </Button>
            </Group>
            
            {isServerRunning && availableTools.length > 0 && (
              <Card withBorder p="xs" style={{ background: '#f9f9f9' }}>
                <Text size="sm" fw={600} mb="xs">Execute Tool</Text>
                <Stack spacing="sm">
                  <Select
                    label="Select Tool"
                    data={availableTools}
                    value={selectedTool}
                    onChange={setSelectedTool}
                  />
                  <JsonInput
                    label="Arguments (JSON)"
                    placeholder='{
  "url": "https://example.com",
  "selector": ".main-content"
}'
                    value={toolArgs}
                    onChange={(value) => {
                      // Replace any smart quotes with straight quotes
                      const sanitized = value
                        .replace(/[""]/g, '"')
                        .replace(/['']/g, "'");
                      setToolArgs(sanitized);
                    }}
                    autosize
                    minRows={3}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                  <Button onClick={executeTool} leftSection={<Send size={14} />}>
                    Execute Tool
                  </Button>
                </Stack>
              </Card>
            )}
          </>
        )}
        
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Group position="apart" mb="xs">
            <Text size="sm" fw={600}>Server Output</Text>
            <Group spacing="xs">
              <Tooltip label="Copy Output">
                <ActionIcon size="sm" onClick={copyOutput}>
                  <Copy size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Clear Output">
                <ActionIcon size="sm" color="red" onClick={clearOutput}>
                  <Trash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          
          <ScrollArea 
            style={{ flex: 1, minHeight: '200px', border: '1px solid #eee', borderRadius: '4px' }}
            viewportRef={scrollRef}
            offsetScrollbars
          >
            <Code block style={{ whiteSpace: 'pre-wrap', padding: '10px' }}>
              {serverOutput.length > 0 
                ? serverOutput.join('\n') 
                : 'No output yet. Start the server to see output here.'}
            </Code>
          </ScrollArea>
          { screenshotData && (
            <Card shadow="sm" p="md" radius="md" withBorder style={{ marginTop: '1rem' }}>
              <Text size="sm" fw={600}>Screenshot Preview</Text>
              <img 
                src={`data:${screenshotData.mimeType};base64,${screenshotData.data}`} 
                alt="Screenshot" 
                style={{ maxWidth: '100%' }} 
              />
            </Card>
          )}
        </div>
        
        <Group position="apart" style={{ cursor: 'pointer' }} onClick={() => setAdvancedVisible(!advancedVisible)}>
          <Text size="sm" fw={600}>Advanced Configuration</Text>
          <ActionIcon variant="transparent">
            {advancedVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </ActionIcon>
        </Group>
        
        {advancedVisible && (
          <Accordion defaultValue="directories">
            <Accordion.Item value="directories">
              <Accordion.Control icon={<Folder size={16} />}>
                Allowed Directories
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="xs">
                  <Text size="xs" color="dimmed">
                    These directories will be accessible to the MCP client:
                  </Text>
                  
                  {allowedDirectories.length === 0 ? (
                    <Alert color="blue" title="No Directories">
                      No directories have been added yet. Click 'Add Directory' to allow MCP access to a directory.
                    </Alert>
                  ) : (
                    allowedDirectories.map((dir, index) => (
                      <Group key={dir.path} position="apart">
                        <Group>
                          <Switch
                            checked={dir.enabled}
                            onChange={() => toggleDirectory(index)}
                          />
                          <Text size="sm" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {dir.name}: {dir.path}
                          </Text>
                        </Group>
                        <ActionIcon color="red" onClick={() => removeDirectory(index)}>
                          <Trash size={16} />
                        </ActionIcon>
                      </Group>
                    ))
                  )}
                  
                  <Button
                    leftSection={<Plus size={16} />}
                    onClick={browseDirectory}
                    fullWidth
                  >
                    Add Directory
                  </Button>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            
            <Accordion.Item value="docker">
              <Accordion.Control icon={<Globe size={16} />}>
                Docker Configuration
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="xs">
                  <TextInput
                    label="Docker Command"
                    placeholder="docker"
                    value={dockerCommand}
                    onChange={(e) => setDockerCommand(e.currentTarget.value)}
                  />
                  
                  <TextInput
                    label="Docker Arguments"
                    placeholder="run -i --rm --init -e DOCKER_CONTAINER=true mcp/puppeteer"
                    value={dockerArgs}
                    onChange={(e) => setDockerArgs(e.currentTarget.value)}
                  />
                  
                  <Button
                    onClick={saveDockerConfig}
                    leftSection={<RefreshCw size={14} />}
                  >
                    Save Docker Config
                  </Button>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
      </Stack>
    </Card>
  );
};

export default MCPClientPanel;