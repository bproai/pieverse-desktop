// src/components/WebView2DevTools/WebView2DevToolsPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  Stack, 
  Alert, 
  Badge, 
  ScrollArea,
  ActionIcon,
  Tooltip,
  Code,
  Box,
  Tabs,
} from '@mantine/core';

import { 
  AlertCircle, 
  RefreshCw, 
  TerminalSquare, 
  Download, 
  Trash, 
  Copy,
  Check,
  Terminal,
  Play,
  Info,
} from 'lucide-react';

// Import Tauri API
import { core } from '@tauri-apps/api';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

// Interfaces
interface ConsoleMessage {
  id: string;
  timestamp: number;
  level: string;
  text: string;
  source: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface RawConsoleMessage {
  level: string;
  args: string[];
  source?: string;
  line_number?: number;
  column_number?: number;
  timestamp: number;
}

const WebView2DevToolsPanel: React.FC = () => {
  const [devToolsOpen, setDevToolsOpen] = useState<boolean>(false);
  const [consoleLoggerActive, setConsoleLoggerActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [command, setCommand] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string | null>('console');
  
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  // Check if DevTools are open
  const checkDevToolsStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const isOpen = await core.invoke('is_webview_devtools_open');
      setDevToolsOpen(isOpen as boolean);
      
      // Also check console logger status
      const isInjected = await core.invoke('is_console_logger_injected');
      setConsoleLoggerActive(isInjected as boolean);
      
      if (isInjected && messages.length === 0) {
        // Add an informational message
        addSystemMessage('info', 'Console logger is active and capturing messages');
      }
      
      return isOpen as boolean;
    } catch (err) {
      console.error('Failed to check DevTools status:', err);
      setError(`${err}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Open DevTools
  const openDevTools = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await core.invoke('open_webview_devtools');
      setDevToolsOpen(true);
      
      // Add a message indicating DevTools were opened
      addSystemMessage('info', 'DevTools opened successfully');
    } catch (err) {
      console.error('Failed to open DevTools:', err);
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Close DevTools
  const closeDevTools = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await core.invoke('close_webview_devtools');
      setDevToolsOpen(false);
      
      // Add a message indicating DevTools were closed
      addSystemMessage('info', 'DevTools closed');
    } catch (err) {
      console.error('Failed to close DevTools:', err);
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to add system messages
  const addSystemMessage = (level: string, text: string) => {
    const newMessage: ConsoleMessage = {
      id: `system-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      level,
      text,
      source: 'system'
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  // Inject console logger
  const injectConsoleLogger = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await core.invoke('inject_console_logger');
      setConsoleLoggerActive(true);
      
      // Add a message indicating logger was injected
      addSystemMessage('info', 'Console logger injected successfully');
    } catch (err) {
      console.error('Failed to inject console logger:', err);
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Set up event listeners
  useEffect(() => {
    const setupListeners = async () => {
      try {
        // Clean up any existing listeners
        unlistenRefs.current.forEach(unlisten => unlisten());
        unlistenRefs.current = [];
        
        // Listen for console messages
        const unlisten1 = await listen<RawConsoleMessage>('webview-console', (event) => {
          const rawMessage = event.payload;
          
          const newMessage: ConsoleMessage = {
            id: `console-${rawMessage.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: rawMessage.timestamp,
            level: rawMessage.level,
            text: rawMessage.args.join(' '),
            source: rawMessage.source || 'console',
            lineNumber: rawMessage.line_number,
            columnNumber: rawMessage.column_number
          };
          
          setMessages(prev => [...prev, newMessage]);
        });
        
        // Listen for ready event
        const unlisten2 = await listen('webview-console-logger-ready', () => {
          addSystemMessage('info', 'Console logger connected successfully');
        });
        
        // Store unlisteners for cleanup
        unlistenRefs.current = [unlisten1, unlisten2];
      } catch (err) {
        console.error('Failed to setup event listeners:', err);
        setError(`Failed to setup event listeners: ${err}`);
      }
    };
    
    // Set up listeners
    setupListeners();
    
    // Check initial status
    checkDevToolsStatus();
    
    // Cleanup function
    return () => {
      unlistenRefs.current.forEach(unlisten => unlisten());
    };
  }, []);

  // Clear console messages
  const clearMessages = () => {
    setMessages([]);
  };

  // Copy message to clipboard
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text:', err);
      });
  };

  // Export console messages as JSON
  const exportMessages = async () => {
    try {
      const dataStr = JSON.stringify(messages, null, 2);
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const exportFileDefaultName = `webview-logs-${timestamp}.json`;
      
      const savePath = await saveDialog({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        defaultPath: exportFileDefaultName,
        title: 'Save WebView Console Logs'
      });
      
      if (savePath) {
        await writeTextFile(savePath, dataStr);
        
        addSystemMessage('info', `Logs exported successfully to ${savePath}`);
      }
    } catch (err) {
      console.error('Failed to export logs:', err);
      setError(`Failed to export logs: ${err}`);
    }
  };

  // Execute JavaScript in the WebView
  const executeJavaScript = async (code: string) => {
    try {
      setLoading(true);
      
      addSystemMessage('command', `Executing: ${code}`);
      
      await core.invoke('execute_javascript', { javascript: code });
    } catch (err) {
      console.error('Failed to execute JavaScript:', err);
      setError(`Failed to execute JavaScript: ${err}`);
      
      addSystemMessage('error', `Failed to execute: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-scroll to bottom of console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Filter messages based on text filter and level filter
  const filteredMessages = messages.filter(message => {
    const matchesText = !filter || 
      message.text.toLowerCase().includes(filter.toLowerCase()) ||
      message.source.toLowerCase().includes(filter.toLowerCase());
      
    const matchesLevel = !filterLevel || message.level === filterLevel;
    
    return matchesText && matchesLevel;
  });

  // Get message style based on log level
  const getMessageStyle = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-500';
      case 'warning':
      case 'warn':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
      case 'command':
        return 'text-indigo-500 font-bold';
      default:
        return '';
    }
  };

  // Handle command submission
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      executeJavaScript(command);
      setCommand('');
    }
  };

  // Run a test log to verify console capturing is working
  const runTestLog = () => {
    executeJavaScript(`
      console.log('Test log message from WebView DevTools');
      console.info('This is an info message');
      console.warn('This is a warning message');
      console.error('This is an error message');
      
      // Test an error
      try {
        throw new Error('Test error thrown');
      } catch (e) {
        console.error('Caught error:', e);
      }
    `);
  };

  return (
    <div className="webview-devtools-panel">
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Card.Section p="md" className="border-b">
          <Group justify="space-between">
            <Group>
              <TerminalSquare size={20} />
              <Text size="xl" fw={700}>WebView2 DevTools</Text>
            </Group>
            <Group>
              <Button 
                variant="light" 
                size="sm" 
                leftSection={<RefreshCw size={14} />}
                onClick={checkDevToolsStatus}
                loading={loading}
              >
                Refresh Status
              </Button>
            </Group>
          </Group>
        </Card.Section>

        {error && (
          <Alert color="red" title="Error" icon={<AlertCircle size={16} />} mt="md" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack mt="md">
          <Group position="apart" spacing="md">
            <Text>DevTools Status: <Badge color={devToolsOpen ? 'green' : 'gray'}>{devToolsOpen ? 'Open' : 'Closed'}</Badge></Text>
            <Group>
              {devToolsOpen ? (
                <Button 
                  color="red" 
                  variant="outline" 
                  onClick={closeDevTools}
                  loading={loading}
                >
                  Close DevTools
                </Button>
              ) : (
                <Button 
                  onClick={openDevTools}
                  loading={loading}
                >
                  Open DevTools
                </Button>
              )}
              
              <Button
                variant={consoleLoggerActive ? 'filled' : 'outline'}
                color={consoleLoggerActive ? 'green' : 'blue'}
                onClick={injectConsoleLogger}
                loading={loading}
                disabled={consoleLoggerActive}
              >
                {consoleLoggerActive ? 'Logger Active' : 'Inject Console Logger'}
              </Button>
              
              {consoleLoggerActive && (
                <Button
                  variant="light"
                  color="blue"
                  onClick={runTestLog}
                  leftSection={<Play size={14} />}
                >
                  Run Test Logs
                </Button>
              )}
            </Group>
          </Group>

          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="console" leftSection={<Terminal size={14} />}>
                Console
              </Tabs.Tab>
              <Tabs.Tab value="execute" leftSection={<Play size={14} />}>
                Execute JavaScript
              </Tabs.Tab>
              <Tabs.Tab value="help" leftSection={<Info size={14} />}>
                Help
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="console" pt="xs">
              <Card shadow="xs" mt="md" withBorder>
                <Card.Section p="md" className="border-b">
                  <Group justify="space-between">
                    <Text weight={600}>Console Logs</Text>
                    <Group>
                      <TextInput
                        placeholder="Filter messages..."
                        value={filter}
                        onChange={(e) => setFilter(e.currentTarget.value)}
                        size="xs"
                        style={{ width: '200px' }}
                      />
                      <Button 
                        variant="light" 
                        color="gray" 
                        size="xs"
                        leftSection={<Trash size={14} />}
                        onClick={clearMessages}
                      >
                        Clear
                      </Button>
                      <Button 
                        variant="light" 
                        size="xs"
                        leftSection={<Download size={14} />}
                        onClick={exportMessages}
                        disabled={messages.length === 0}
                      >
                        Export
                      </Button>
                    </Group>
                  </Group>
                </Card.Section>
                
                <Group position="center" mt="xs" mb="xs">
                  <Badge 
                    color="gray" 
                    variant={filterLevel === null ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    All
                  </Badge>
                  <Badge 
                    color="blue" 
                    variant={filterLevel === 'log' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('log')}
                    style={{ cursor: 'pointer' }}
                  >
                    Log
                  </Badge>
                  <Badge 
                    color="blue" 
                    variant={filterLevel === 'info' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('info')}
                    style={{ cursor: 'pointer' }}
                  >
                    Info
                  </Badge>
                  <Badge 
                    color="yellow" 
                    variant={filterLevel === 'warn' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('warn')}
                    style={{ cursor: 'pointer' }}
                  >
                    Warning
                  </Badge>
                  <Badge 
                    color="red" 
                    variant={filterLevel === 'error' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('error')}
                    style={{ cursor: 'pointer' }}
                  >
                    Error
                  </Badge>
                  <Badge 
                    color="indigo" 
                    variant={filterLevel === 'command' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('command')}
                    style={{ cursor: 'pointer' }}
                  >
                    Command
                  </Badge>
                  <Badge 
                    color="green" 
                    variant={filterLevel === 'system' ? 'filled' : 'outline'}
                    onClick={() => setFilterLevel('system')}
                    style={{ cursor: 'pointer' }}
                  >
                    System
                  </Badge>
                </Group>
                
                <ScrollArea h={400} type="auto" p="md">
                  {filteredMessages.length === 0 ? (
                    <Text color="dimmed" align="center" mt="md">
                      {consoleLoggerActive 
                        ? filter || filterLevel
                          ? "No messages match the current filter"
                          : "Waiting for console messages..." 
                        : "Click 'Inject Console Logger' to start capturing console logs"}
                    </Text>
                  ) : (
                    <div className="font-mono text-sm">
                      {filteredMessages.map((msg) => (
                        <div 
                          key={msg.id} 
                          className={`py-1 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 relative ${copiedId === msg.id ? 'bg-blue-50' : ''}`}
                        >
                          <Group justify="space-between">
                            <Group spacing="xs">
                              <Badge 
                                size="xs" 
                                color={
                                  msg.level === 'error' ? 'red' : 
                                  msg.level === 'warning' || msg.level === 'warn' ? 'yellow' : 
                                  msg.level === 'info' ? 'blue' :
                                  msg.level === 'command' ? 'indigo' :
                                  msg.level === 'system' ? 'green' :
                                  'gray'
                                }
                              >
                                {msg.level}
                              </Badge>
                              <Text size="xs" color="dimmed">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </Text>
                            </Group>
                            <Group spacing="xs">
                              <Badge size="xs" variant="outline">
                                {msg.source}
                                {msg.lineNumber && `:${msg.lineNumber}`}
                              </Badge>
                              <Tooltip label={copiedId === msg.id ? "Copied!" : "Copy log entry"}>
                                <ActionIcon 
                                  size="xs" 
                                  variant="subtle"
                                  onClick={() => copyToClipboard(
                                    `[${msg.level}][${new Date(msg.timestamp).toLocaleTimeString()}][${msg.source}${msg.lineNumber ? `:${msg.lineNumber}` : ''}] ${msg.text}`, 
                                    msg.id
                                  )}
                                >
                                  {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Group>
                          <Text className={getMessageStyle(msg.level)}>
                            {msg.text}
                          </Text>
                        </div>
                      ))}
                      <div ref={consoleEndRef} />
                    </div>
                  )}
                </ScrollArea>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="execute" pt="xs">
              <Card shadow="xs" mt="md" withBorder>
                <Card.Section p="md" className="border-b">
                  <Group justify="space-between">
                    <Text weight={600}>Execute JavaScript</Text>
                  </Group>
                </Card.Section>
                
                <Box p="md">
                  <form onSubmit={handleCommandSubmit}>
                    <Stack spacing="md">
                      <TextInput
                        placeholder="Enter JavaScript to execute in WebView..."
                        value={command}
                        onChange={(e) => setCommand(e.currentTarget.value)}
                        rightSection={
                          <ActionIcon 
                            type="submit" 
                            color="blue"
                            disabled={!command.trim() || !consoleLoggerActive}
                          >
                            <Play size={16} />
                          </ActionIcon>
                        }
                      />
                      
                      <Button
                        type="submit"
                        leftSection={<Terminal size={16} />}
                        disabled={!command.trim() || !consoleLoggerActive}
                        loading={loading}
                      >
                        Execute
                      </Button>
                      
                      {!consoleLoggerActive && (
                        <Alert color="yellow" title="Console Logger Required" icon={<Info size={16} />}>
                          You need to inject the console logger first before executing JavaScript.
                        </Alert>
                      )}
                      
                      <Text size="sm" color="dimmed">
                        Executed JavaScript results will appear in the Console tab.
                      </Text>
                      
                      <Card withBorder p="sm">
                        <Text size="sm" weight={600} mb="xs">Common Examples:</Text>
                        <Box className="space-y-2">
                          <Code block onClick={() => setCommand('console.log("Hello from WebView DevTools!")')}>
                            console.log("Hello from WebView DevTools!")
                          </Code>
                          
                          <Code block onClick={() => setCommand('document.querySelectorAll("div").length')}>
                            document.querySelectorAll("div").length
                          </Code>
                          
                          <Code block onClick={() => setCommand('window.location.href')}>
                            window.location.href
                          </Code>
                          
                          // Replace the problematic Code block with this fixed version
                            <Code block onClick={() => setCommand(`
                            const divs = document.querySelectorAll('div');
                            console.log("Found " + divs.length + " divs on the page");
                            divs.forEach((div, i) => {
                            if (i < 5) console.log("Div " + i + ":", div.className || '(no class)');
                            });
                            `.trim())}>
                            {`// Analyze DIVs on the page
                            const divs = document.querySelectorAll('div');
                            console.log(\`Found \${divs.length} divs on the page\`);
                            divs.forEach((div, i) => {
                            if (i < 5) console.log(\`Div \${i}:\`, div.className || '(no class)');
                            });`}
                            </Code>
                        </Box>
                      </Card>
                    </Stack>
                  </form>
                </Box>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="help" pt="xs">
              <Card shadow="xs" mt="md" withBorder>
                <Card.Section p="md" className="border-b">
                  <Group justify="space-between">
                    <Text weight={600}>Help & Documentation</Text>
                  </Group>
                </Card.Section>
                
                <Stack p="md" spacing="lg">
                  <div>
                    <Text weight={600} size="lg" mb="xs">Getting Started</Text>
                    <Text size="sm">
                      The WebView2 DevTools panel provides tools for debugging and interacting with your app's WebView. 
                      Follow these steps to start debugging:
                    </Text>
                    <ol className="list-decimal pl-5 mt-2 space-y-2 text-sm">
                      <li>Click <strong>Open DevTools</strong> to open the WebView's built-in DevTools window</li>
                      <li>Click <strong>Inject Console Logger</strong> to start capturing console messages</li>
                      <li>View console logs in the Console tab</li>
                      <li>Execute JavaScript code in the Execute JavaScript tab</li>
                    </ol>
                  </div>
                  
                  <div>
                    <Text weight={600} size="lg" mb="xs">Features</Text>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                      <li><strong>Console Logging:</strong> Capture and display all console.log, console.error, console.warn, and console.info messages</li>
                      <li><strong>Error Tracking:</strong> Catch and display JavaScript errors, including unhandled promise rejections</li>
                      <li><strong>JavaScript Execution:</strong> Run JavaScript code directly in the WebView context</li>
                      <li><strong>Filtering:</strong> Filter console messages by level (log, info, warning, error) or text content</li>
                      <li><strong>Export:</strong> Save console logs to a JSON file for further analysis</li>
                    </ul>
                  </div>
                  
                  <div>
                    <Text weight={600} size="lg" mb="xs">Troubleshooting</Text>
                    <Text size="sm">
                      If you encounter issues with the WebView2 DevTools:
                    </Text>
                    <ul className="list-disc pl-5 mt-2 space-y-2 text-sm">
                      <li>Make sure the <code>devtools</code> feature is enabled in your <code>Cargo.toml</code> file</li>
                      <li>Click <strong>Refresh Status</strong> to update the DevTools connection status</li>
                      <li>Try reopening the DevTools window if it becomes unresponsive</li>
                      <li>If the console logger stops working, try reinjecting it</li>
                      <li>Use the <strong>Run Test Logs</strong> button to verify that console capturing is working correctly</li>
                    </ul>
                  </div>
                </Stack>
              </Card>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Card>
    </div>
  );
};

export default WebView2DevToolsPanel;