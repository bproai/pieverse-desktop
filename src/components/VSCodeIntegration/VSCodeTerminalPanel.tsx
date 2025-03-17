// src/components/VSCodeIntegration/VSCodeTerminalPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Text, 
  Badge, 
  Card, 
  Group, 
  TextInput, 
  Button, 
  ScrollArea,
  Stack,
  Alert,
  ActionIcon,
  Code
} from '@mantine/core';
import { Terminal, Send, Trash, Copy, AlertCircle, History } from 'lucide-react';
import { notifications } from '@mantine/notifications';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';

interface TerminalCommand {
  id: string;
  command: string;
  output: string;
  status: 'running' | 'completed' | 'error' | 'canceled';
  exitCode?: number;
  timestamp: Date;
  directory?: string;
}

interface VSCodeTerminalPanelProps {
  isServerRunning: boolean;
}

const VSCodeTerminalPanel: React.FC<VSCodeTerminalPanelProps> = ({ isServerRunning }) => {
  const [commands, setCommands] = useState<TerminalCommand[]>([]);
  const [commandInput, setCommandInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Listen for terminal events from VS Code
  useEffect(() => {
    const unlisten = listen('vscode-terminal-event', (event) => {
      console.log('Received terminal event:', event);
      const payload = event.payload as { 
        eventType: string;
        id?: string;
        command?: string;
        output?: string;
        text?: string;
        isError?: boolean;
        exitCode?: number;
        success?: boolean;
        error?: string;
        directory?: string;
      };
      
      if (!payload || !payload.eventType) return;
      
      switch (payload.eventType) {
        case 'commandStarted':
          if (payload.id && payload.command) {
            // Add new command to the list
            setCommands(prev => [...prev, {
              id: payload.id!,
              command: payload.command!,
              output: '',
              status: 'running',
              timestamp: new Date(),
              directory: payload.directory
            }]);
            
            // Update command history if needed
            if (!recentCommands.includes(payload.command)) {
              setRecentCommands(prev => [payload.command!, ...prev.slice(0, 9)]);
            }
          }
          break;
          
        case 'outputChunk':
          if (payload.id && payload.text) {
            // Update command output
            setCommands(prev => {
              const updatedCommands = [...prev];
              const index = updatedCommands.findIndex(cmd => cmd.id === payload.id);
              
              if (index >= 0) {
                updatedCommands[index] = {
                  ...updatedCommands[index],
                  output: updatedCommands[index].output + payload.text!
                };
              }
              
              return updatedCommands;
            });
          }
          break;
          
        case 'commandCompleted':
          if (payload.id) {
            // Update command status to completed
            setCommands(prev => {
              const updatedCommands = [...prev];
              const index = updatedCommands.findIndex(cmd => cmd.id === payload.id);
              
              if (index >= 0) {
                updatedCommands[index] = {
                  ...updatedCommands[index],
                  output: payload.output || updatedCommands[index].output,
                  status: 'completed',
                  exitCode: payload.exitCode
                };
              }
              
              return updatedCommands;
            });
            
            // Show notification
            if (payload.command) {
              notifications.show({
                title: payload.success ? 'Command Completed' : 'Command Failed',
                message: `"${payload.command.length > 30 ? payload.command.substring(0, 30) + '...' : payload.command}" ${payload.success ? 'completed successfully' : 'failed with exit code ' + payload.exitCode}`,
                color: payload.success ? 'green' : 'red',
              });
            }
          }
          break;
          
        case 'commandError':
          if (payload.id) {
            // Update command status to error
            setCommands(prev => {
              const updatedCommands = [...prev];
              const index = updatedCommands.findIndex(cmd => cmd.id === payload.id);
              
              if (index >= 0) {
                updatedCommands[index] = {
                  ...updatedCommands[index],
                  output: updatedCommands[index].output + '\n' + (payload.error || 'Unknown error'),
                  status: 'error'
                };
              }
              
              return updatedCommands;
            });
            
            // Show notification
            if (payload.command && payload.error) {
              notifications.show({
                title: 'Command Error',
                message: `"${payload.command.length > 30 ? payload.command.substring(0, 30) + '...' : payload.command}" failed: ${payload.error}`,
                color: 'red',
              });
            }
          }
          break;
          
        case 'commandCanceled':
          if (payload.id) {
            // Update command status to canceled
            setCommands(prev => {
              const updatedCommands = [...prev];
              const index = updatedCommands.findIndex(cmd => cmd.id === payload.id);
              
              if (index >= 0) {
                updatedCommands[index] = {
                  ...updatedCommands[index],
                  status: 'canceled'
                };
              }
              
              return updatedCommands;
            });
          }
          break;
          
        case 'directoryChanged':
          if (payload.directory) {
            setCurrentDirectory(payload.directory);
          }
          break;
      }
    });
  
    // Clean up listener when component unmounts
    return () => {
      unlisten.then(fn => fn());
    };
  }, [recentCommands]);

  // Auto-scroll to bottom when new commands are added or updated
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commands]);

  // Function to show the VS Code terminal
  const showTerminal = async () => {
    if (!isServerRunning) {
      notifications.show({
        title: 'Error',
        message: 'WebSocket server is not running. Please start the server first.',
        color: 'red'
      });
      return;
    }
    
    try {
      await core.invoke('send_chat_to_vscode', { 
        message: JSON.stringify({ 
          type: 'showTerminal'
        })
      });
      
      notifications.show({
        title: 'Terminal Opened',
        message: 'VS Code terminal has been opened',
        color: 'blue'
      });
    } catch (error: any) {
      console.error('Error opening terminal:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to open terminal: ${error.toString()}`,
        color: 'red'
      });
    }
  };

  // Function to send a command to VS Code terminal
  const executeCommand = async () => {
    if (!commandInput.trim()) return;
    if (!isServerRunning) {
      notifications.show({
        title: 'Error',
        message: 'WebSocket server is not running. Please start the server first.',
        color: 'red'
      });
      return;
    }
    
    setLoading(true);
    try {
      // Generate a unique ID for this command
      const commandId = Date.now().toString();
      
      // Send message to VS Code to execute command
      await core.invoke('send_chat_to_vscode', { 
        message: JSON.stringify({ 
          type: 'executeTerminalCommand',
          id: commandId,
          command: commandInput
        })
      });
      
      // Clear input
      setCommandInput('');
    } catch (error: any) {
      console.error('Error sending terminal command:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to send command: ${error.toString()}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Clear command history
  const clearCommands = () => {
    setCommands([]);
    setError(null);
  };

  // Copy output to clipboard
  const copyOutput = (output: string) => {
    navigator.clipboard.writeText(output).then(() => {
      notifications.show({
        title: 'Copied',
        message: 'Command output copied to clipboard',
        color: 'green'
      });
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Get status icon for command
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return '⏳';
      case 'completed':
        return '✅';
      case 'error':
      case 'canceled':
        return '❌';
      default:
        return '';
    }
  };

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" className="border-b">
        <Group justify="apart">
          <Group>
            <Terminal size={20} />
            <Text size="xl" fw={700}>VS Code Terminal</Text>
          </Group>
          <Group>
            <Badge 
              color={isServerRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {isServerRunning ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge 
              color="blue"
              variant="outline"
            >
              {commands.length > 0 
                ? `${commands.length} commands` 
                : 'No commands'}
            </Badge>
          </Group>
        </Group>
      </Card.Section>
      
      <Stack gap="md" mt="md">
        {error && (
          <Alert color="red" title="Error" icon={<AlertCircle size={16} />} withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        {currentDirectory && (
          <Alert color="blue" title="Working Directory" icon={<Terminal size={16} />}>
            {currentDirectory}
          </Alert>
        )}
        
        <Group justify="apart">
          <TextInput
            placeholder="Enter terminal command..."
            value={commandInput}
            onChange={(e) => setCommandInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
            rightSection={<Terminal size={16} />}
            style={{ flexGrow: 1 }}
            autoCorrect="off"
            autoCapitalize="off"
          />
          
          <Button
            onClick={executeCommand}
            loading={loading}
            disabled={!isServerRunning || !commandInput.trim()}
            leftSection={<Send size={14} />}
          >
            Execute
          </Button>
          
          <Button
            variant="outline"
            onClick={showTerminal}
            disabled={!isServerRunning}
          >
            Show Terminal
          </Button>
          
          <Button
            variant="subtle"
            color="gray"
            onClick={clearCommands}
            leftSection={<Trash size={14} />}
          >
            Clear
          </Button>
        </Group>
        
        <ScrollArea 
          style={{ height: 'calc(70vh - 250px)' }} 
          viewportRef={scrollRef}
          scrollbarSize={8}
          type="auto"
          offsetScrollbars
        >
          {commands.length === 0 ? (
            <Alert
              color="blue"
              title="No Commands Executed"
              icon={<AlertCircle size={16} />}
            >
              No terminal commands have been executed yet. Enter a command above and click 'Execute' or press Enter.
            </Alert>
          ) : (
            <Stack gap="xs">
              {commands.map((cmd, index) => (
                <Card key={cmd.id} withBorder p="xs">
                  <Group justify="apart" mb="xs">
                    <Group>
                      <Text>{getStatusIcon(cmd.status)}</Text>
                      <Text fw={700} style={{ fontFamily: 'monospace' }}>
                        $ {cmd.command}
                      </Text>
                    </Group>
                    <Group>
                      {cmd.directory && (
                        <Text size="xs" color="dimmed">
                          [{cmd.directory.split('/').pop() || cmd.directory.split('\\').pop()}]
                        </Text>
                      )}
                      <Text size="xs" color="dimmed">
                        {cmd.timestamp.toLocaleTimeString()}
                      </Text>
                      <ActionIcon 
                        variant="subtle" 
                        onClick={() => copyOutput(cmd.output)}
                        disabled={cmd.status === 'running'}
                      >
                        <Copy size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Code block style={{ maxHeight: '300px', overflow: 'auto' }}>
                    {cmd.output || (cmd.status === 'running' ? 'Running...' : 'No output')}
                  </Code>
                </Card>
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Card>
  );
};

export default VSCodeTerminalPanel;