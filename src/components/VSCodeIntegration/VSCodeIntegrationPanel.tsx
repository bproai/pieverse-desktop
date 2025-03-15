// src/components/VSCodeIntegration/VSCodeIntegrationPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  NumberInput,
  Stack, 
  Alert, 
  Badge, 
  Switch,
  Code,
  Textarea,
  Tabs,
  Tooltip,
  ActionIcon,
  Collapse
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Code as CodeIcon, RefreshCw, CheckCircle, MessageSquare, FileCode, Eraser, X, Folder, ChevronDown, ChevronUp } from 'lucide-react';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import VSCodeChat from './VSCodeChat';
import Editor, { loader } from '@monaco-editor/react';
loader.config({
  paths: {
    vs: './monaco-editor/vs'
  }
});

const getLanguageFromExtension = (ext: string): string => {
  switch (ext.toLowerCase()) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
};

interface CodeEditorProps {
  code: string;
  fileExtension: string; // e.g., "js", "py", "html", etc.
  onChange: (value: string) => void;
}

interface VSCodeStatus {
  isRunning: boolean;
  port: number;
}

interface CodeDiffRequest {
  originalFile: string;
  suggestedContent: string;
  description: string;
}

const VSCodeIntegrationPanel: React.FC = () => {
  const [port, setPort] = useState<number>(3001);
  const [status, setStatus] = useState<VSCodeStatus>({ isRunning: false, port: 3001 });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('diff');
  
  // Test diff parameters
  const [originalFile, setOriginalFile] = useState<string>('');
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [description, setDescription] = useState<string>('Suggested change');

  const [isConnectionOpen, setIsConnectionOpen] = useState(true);

  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');

  const [statusInfo, setStatusInfo] = useState<string | null>(null);

  useEffect(() => {
    // Force a resize event when the connection panel visibility changes
    // This helps the Monaco editor recalculate its dimensions
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300); // Short delay to allow the collapse animation to finish
  }, [isConnectionOpen]);

  const browseForFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Select Original File',
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }, {
          name: 'Text Files',
          extensions: ['txt', 'md', 'js', 'ts', 'html', 'css', 'json', 'py', 'jsx', 'tsx']
        }, {
          name: 'Source Code',
          extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb']
        }]
      });
      
      if (selected && typeof selected === 'string') {
        console.log('Selected file:', selected);
        setOriginalFile(selected);
        
        // Load the file content into Suggested Content using Tauri 2.0 API
        try {
          const fileExists = await exists(selected);
          if (!fileExists) {
            throw new Error(`File does not exist: ${selected}`);
          }
          
          const fileContent = await readTextFile(selected);
          setSuggestedContent(fileContent);
          
          notifications.show({
            title: 'Success',
            message: `File loaded successfully: ${selected.split('/').pop()}`,
            color: 'green'
          });
        } catch (readError) {
          console.error('Error reading file content:', readError);
          notifications.show({
            title: 'Error',
            message: `Could not read file content: ${readError}`,
            color: 'red'
          });
        }
      } else {
        console.log('No file selected or multiple selection returned', selected);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to open file browser: ${error}`,
        color: 'red'
      });
    }
  };

  const validateAndLoadFile = async (filePath: string) => {
    if (!filePath.trim()) return;
    
    try {
      console.log('Validating file path:', filePath);
      
      // Check if file exists using Tauri's FS API
      const fileExists = await exists(filePath);
      if (!fileExists) {
        notifications.show({
          title: 'Error',
          message: `File does not exist: ${filePath}`,
          color: 'red'
        });
        return;
      }
      
      // If file exists, load its content
      const fileContent = await readTextFile(filePath);
      setSuggestedContent(fileContent);
      
      notifications.show({
        title: 'Success',
        message: `File loaded successfully: ${filePath.split('/').pop() || filePath.split('\\').pop()}`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error validating or loading file:', error);
      notifications.show({
        title: 'Error',
        message: `Could not load file: ${error}`,
        color: 'red'
      });
    }
  };

  const resetSuggestedContent = () => {
    setSuggestedContent('');
  };

  const resetForm = () => {
    setOriginalFile('');
    setSuggestedContent('');
    setDescription('Suggested change');
  };
  
  // Fetch current server status
  const fetchStatus = async () => {
    try {
      const [isRunning, currentPort] = await core.invoke('get_vscode_ws_status') as [boolean, number];
      setStatus({ isRunning, port: currentPort });
      if (isRunning) {
        setPort(currentPort);
      }
    } catch (error: any) {
      console.error('Error fetching VS Code connection status:', error);
      setError(error.toString());
    }
  };

  useEffect(() => {
    // Check if your application has a way to detect dark mode
    // This is an example - adapt it to your app's dark mode detection method
    const isDarkMode = document.body.classList.contains('dark-mode') || 
                       window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    setColorScheme(isDarkMode ? 'dark' : 'light');
    
    // Optional: listen for changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setColorScheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Load status on component mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Start the WebSocket server
  const startServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('start_vscode_ws_server', { port });
      notifications.show({
        title: 'Success',
        message: `VS Code WebSocket server started. Connect your extension to ws://localhost:${port}`,
        color: 'green'
      });
      setStatus({ isRunning: true, port: port });
      fetchStatus(); // Refresh status to get the actual port
    } catch (error: any) {
      console.error('Error starting VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to start VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Stop the WebSocket server
  const stopServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('stop_vscode_ws_server');
      notifications.show({
        title: 'Success',
        message: 'VS Code WebSocket server stopped',
        color: 'blue'
      });
      setStatus({ ...status, isRunning: false });
    } catch (error: any) {
      console.error('Error stopping VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to stop VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Send a test diff to VS Code
  const sendTestDiff = async () => {
    if (!originalFile) {
      notifications.show({
        title: 'Error',
        message: 'Please enter an original file path',
        color: 'red'
      });
      return;
    }

    if (!suggestedContent) {
      notifications.show({
        title: 'Error',
        message: 'Please enter suggested content',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      // Create the diff request object
      const diffRequest: CodeDiffRequest = {
        originalFile,
        suggestedContent,
        description
      };
      
      // Debug logging
      console.log('Sending diff request with:', JSON.stringify(diffRequest, null, 2));
      
      // First check if the server is running
      const isRunning = await core.invoke('get_vscode_ws_status') as [boolean, number];
      console.log('Server status before sending diff:', isRunning);
      
      try {
        // Try to invoke the command with verbose logging
        console.log('Invoking send_code_diff_to_vscode with request:', diffRequest);
        await core.invoke('send_code_diff_to_vscode', { 
          diffRequest: {
            original_file: originalFile,
            suggested_content: suggestedContent,
            description
          }
        });
        
        notifications.show({
          title: 'Success',
          message: 'Diff sent to VS Code extension',
          color: 'green'
        });
      } catch (commandError: any) {
        // More detailed error logging
        console.error('Invoke error details:', {
          message: commandError.message,
          stack: commandError.stack,
          fullError: commandError
        });
        
        // Show error notification
        notifications.show({
          title: 'Error',
          message: `Failed to send diff: ${commandError}`,
          color: 'red'
        });
        
        // Show a more detailed error message to help debugging
        setError(`Detailed error: ${JSON.stringify({
          message: commandError.message || commandError.toString(),
          errorType: typeof commandError,
          diffRequest
        }, null, 2)}`);
      }
    } catch (error: any) {
      console.error('Error in sendTestDiff function:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to prepare diff: ${error}`,
        color: 'red'
      });
      setError(`Error preparing diff request: ${error.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const language = originalFile
  ? getLanguageFromExtension(originalFile.split('.').pop() || 'plaintext')
  : 'markdown';

// Modify the component return statement to consolidate the cards and give more space to Suggested Content

// First, remove the bottom card entirely and integrate its content into the top section
// Then increase the height of the Suggested Content textarea

  return (
    <div
      className="vscode-integration-panel"
      style={{ height: isConnectionOpen ? 'calc(100vh)' : 'calc(100%+10px)',
        display: 'flex', flexDirection: 'column', padding: '0 0 8px 0' }}
    >
      <Card
        shadow="sm"
        p="lg"
        radius="md"
        withBorder
        style={{ flex: 1, display: 'flex', flexDirection: 'column', height:  isConnectionOpen ? 'calc(100%)' : 'calc(100% + 20px)'}}
      >
        <Card.Section p="md" className="border-b">
          <Group position="apart">
            <Group>
              <CodeIcon size={20} />
              <Text size="xl" fw={700}>VS Code Integration</Text>
            </Group>
            <Badge 
              color={status.isRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {status.isRunning ? 'Connected' : 'Disconnected'}
            </Badge>
          </Group>
        </Card.Section>
        
        <Stack spacing="md" mt="md">
          <Group position="apart" style={{ cursor: 'pointer' }} onClick={() => setIsConnectionOpen(!isConnectionOpen)}>
            <Text size="sm" fw={600}>VS Code Extension Connection</Text>
            <ActionIcon variant="transparent">
              {isConnectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </ActionIcon>
          </Group>

          <Collapse in={isConnectionOpen}>
            <div>
              <Alert 
                icon={<AlertCircle size={16} />} 
                color="blue" 
                title="VS Code Extension Connection"
              >
                <Text size="sm">
                  Configure the connection to the VS Code diff-extension. Make sure you have the PieVerse Diff Extension installed in VS Code and 
                  that it's configured to connect to the correct WebSocket port.
                </Text>
                
                <Text size="sm" mt="md" fw={600}>
                  VS Code Extension Settings:
                </Text>
                <Code block size="xs">
                  {`{"pieverse-diff.websocketUrl": "ws://localhost:${status.port}"}`}
                </Code>
              </Alert>

              {/* WebSocket Port and Server Control Group */}
              <Group align="end" mt="md">
                <NumberInput
                  label="WebSocket Port"
                  description={status.isRunning 
                    ? `Active connection URL: ws://localhost:${status.port}`
                    : "Port for VS Code extension to connect to"}
                  value={port}
                  onChange={(val) => setPort(val || 3001)}
                  min={1024}
                  max={65535}
                  disabled={status.isRunning}
                />
                
                {!status.isRunning ? (
                  <Button 
                    onClick={startServer}
                    loading={loading}
                    leftSection={<RefreshCw size={14} />}
                  >
                    Start Server
                  </Button>
                ) : (
                  <Button 
                    onClick={stopServer}
                    loading={loading}
                    color="red"
                    leftSection={<AlertCircle size={14} />}
                  >
                    Stop Server
                  </Button>
                )}
                
                <Button 
                  variant="outline"
                  onClick={fetchStatus}
                  leftSection={<RefreshCw size={14} />}
                >
                  Refresh Status
                </Button>
              </Group>
            </div>
          </Collapse>

          {error && (
            <Alert color="red" title="Error" icon={<AlertCircle size={16} />}>
              {error}
            </Alert>
          )}
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Tabs
              defaultValue="diff"
              value={activeTab}
              onChange={setActiveTab}
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            >
              <Tabs.List>
                <Tabs.Tab value="diff" leftSection={<FileCode size={16} />}>
                  Diff
                </Tabs.Tab>
                <Tabs.Tab value="chat" leftSection={<MessageSquare size={16} />}>
                  Chat
                </Tabs.Tab>
                <Tabs.Tab value="debug" leftSection={<AlertCircle size={16} />}>
                  Debug
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="diff" p="md" style={{ flex: 1 }}>
                <Card
                  withBorder
                  p="lg"
                  mt="md"
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: isConnectionOpen ? 'calc(100% - 15px)' : 'calc(100% + 9px)',
                    flex: 1,
                    transition: 'height 0.3s ease'
                  }}
                >
                    {/* Card contents remain the same... */}                  
                  {/* Fixed-height section for inputs */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <Stack spacing="sm">
                      <TextInput
                        label={
                          <Tooltip label="Path to the original file that will be modified">
                            <Text size="sm" style={{ cursor: 'help' }}>Original File Path</Text>
                          </Tooltip>
                        }
                        placeholder="/path/to/your/file.js"
                        value={originalFile}
                        onChange={(e) => setOriginalFile(e.currentTarget.value)}
                        onBlur={() => {
                          if (originalFile.trim()) {
                            validateAndLoadFile(originalFile);
                          }
                        }}
                        onPaste={(e) => {
                          // Allow default paste behavior to update the input value
                          setTimeout(() => {
                            // Check if the pasted content looks like a file path
                            const value = e.currentTarget.value;
                            if (value && (value.includes('/') || value.includes('\\'))) {
                              validateAndLoadFile(value);
                            }
                          }, 100);
                        }}
                        rightSection={
                          <ActionIcon
                            onClick={browseForFile}
                            variant="subtle"
                            size="lg"
                            title="Browse for file"
                            style={{ marginRight: '8px' }}
                            color="blue"
                          >
                            <Folder size={16} />
                          </ActionIcon>
                        }
                        rightSectionWidth={50}
                        styles={{ rightSection: { pointerEvents: 'auto' } }}
                      />
                      
                      <TextInput
                        label={
                          <Tooltip label="Description of the proposed change">
                            <Text size="sm" style={{ cursor: 'help' }}>Description</Text>
                          </Tooltip>
                        }
                        placeholder="Refactor function for better performance"
                        value={description}
                        onChange={(e) => setDescription(e.currentTarget.value)}
                      />
                    </Stack>
                  </div>
                  
                  {/* Editor that takes available space but allows room for buttons */}
                  <div style={{ 
                    flex: 1, 
                    minHeight: '150px',
                    height: isConnectionOpen ? 'auto' : 'auto', // Adjust this value based on your layout
                    transition: 'height 0.3s ease'
                  }}>
                    <Editor
                      key={language}
                      height={isConnectionOpen ? 'calc(97% + 6px)' : 'calc(93% + 10px)'}
                      language={language}
                      value={suggestedContent}
                      onChange={(value) => setSuggestedContent(value || '')}
                      theme={colorScheme === 'dark' ? 'vs-dark' : 'light'} // Add this line
                      options={{
                        wordWrap: 'on',
                        minimap: { enabled: false },
                        automaticLayout: true,
                        fontSize: 14
                      }}
                    />
                  </div>
                                  
                  {/* Button group with minimal margin to maximize editor space */}
                  <Group position="apart" mt="12px">
                    <Button
                      onClick={sendTestDiff}
                      loading={loading}
                      disabled={!status.isRunning}
                      title={!status.isRunning ? "WebSocket server is not running. Start the server to enable this button." : ""}
                    >
                      Send Diff
                    </Button>
                    
                    <Group spacing="xs">
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={resetSuggestedContent}
                        leftSection={<X size={14} />}
                        size="sm"
                      >
                        Clear Content Only
                      </Button>
                      
                      <Button
                        variant="outline"
                        color="gray"
                        onClick={resetForm}
                        leftSection={<Eraser size={14} />}
                      >
                        Reset All Fields
                      </Button>
                    </Group>
                  </Group>
                </Card>
              </Tabs.Panel>



              
              <Tabs.Panel value="chat" p="md">
                <VSCodeChat isServerRunning={status.isRunning} />
              </Tabs.Panel>
              
              <Tabs.Panel value="debug" p="md">
                <Card withBorder p="md" mt="md">
                  <Text weight={600} mb="md">Debug Information</Text>
                  <Stack spacing="md">
                    <Alert 
                      icon={<AlertCircle size={16} />} 
                      color="blue" 
                      title="Debug Mode"
                    >
                      This panel shows debug information to help diagnose connection issues.
                    </Alert>
                    
                    {statusInfo && (
                      <Alert 
                        color="blue" 
                        title="Status Information" 
                        icon={<CheckCircle size={16} />}
                        withCloseButton
                        onClose={() => setStatusInfo(null)}
                      >
                        {statusInfo}
                      </Alert>
                    )}

                    <Text size="sm" fw={600}>Current Request Payload:</Text>
                    <Code block>
                      {JSON.stringify({
                        originalFile,
                        suggestedContent: suggestedContent.length > 100 
                          ? suggestedContent.substring(0, 100) + '...' 
                          : suggestedContent,
                        description
                      }, null, 2)}
                    </Code>
                    
                    <Text size="sm" fw={600}>Connection Status:</Text>
                    <Code block>
                      {JSON.stringify(status, null, 2)}
                    </Code>
                    
                    {error && (
                      <>
                        <Text size="sm" fw={600} color="red">Error Details:</Text>
                        <Code block>
                          {error}
                        </Code>
                      </>
                    )}
                    
                    <Group>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const wsStatus = await core.invoke('get_vscode_ws_status');
                            setStatusInfo(`WebSocket Status: ${JSON.stringify(wsStatus, null, 2)}`);
                            setError(null); // Clear any existing errors
                          } catch (e: any) {
                            setError(`Failed to get status: ${e.toString()}`);
                            setStatusInfo(null);
                          }
                        }}
                      >
                        Check WebSocket Status
                      </Button>
                      
                      <Button
                        variant="outline"
                        color="yellow"
                        onClick={async () => {
                          try {
                            // Just invoke the send_code_diff_to_vscode command directly with test data
                            const testData = {
                              diffRequest: {
                                originalFile: "/test/file.js",
                                suggestedContent: "// Test content",
                                description: "Test description"
                              }
                            };
                            await core.invoke('send_code_diff_to_vscode', testData);
                            setError(`Test diff sent successfully with: ${JSON.stringify(testData, null, 2)}`);
                          } catch (e: any) {
                            setError(`Failed to send test diff: ${e.toString()}`);
                          }
                        }}
                      >
                        Send Test Data
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              </Tabs.Panel>
            </Tabs>
          </div>
        </Stack>
      </Card>
    </div>
  );
};

export default VSCodeIntegrationPanel;