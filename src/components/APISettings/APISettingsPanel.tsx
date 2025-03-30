// src/components/APISettings/APISettingsPanel.tsx
import { useState, useEffect } from 'react';
import { Card, Text, Group, TextInput, Button, Badge, Stack, Select, ActionIcon } from '@mantine/core';
import { Settings, Power, PowerOff, Radio, RefreshCw } from 'lucide-react';
import { core } from '@tauri-apps/api';
import WebSocketService, { ClientInfo } from '../../services/WebSocketService';
import { listen } from '@tauri-apps/api/event';
import { notifications } from '@mantine/notifications';
import { ChromeClientsList } from './ChromeClientsList';
import { forwardRef } from 'react';
import { SafeFavicon } from '../common/SafeFavicon';

// Define types for the state and payloads
interface NewChatStatus {
  loading: boolean;
  result: NewChatResult | null;
}

interface NewChatResult {
  type?: string;
  success: boolean;
  message: string;
  platform?: string;
  tabId?: string;
  initialArticleCount?: number;
  finalArticleCount?: number;
  attempts?: number;
  initialMessageCount?: number;
  finalMessageCount?: number;
  method?: string;
}

interface SelectItemProps {
  label: string;
  description?: string;
  active?: boolean;
  platform?: string;
  [key: string]: any;
}

interface PlatformSelectItemProps {
  label: string;
  favicon?: string;
  [key: string]: any;
}


export function APISettingsPanel() {
  const [httpStatus, setHttpStatus] = useState('stopped');
  const [httpPort, setHttpPort] = useState(3030);
  const [httpIsLoading, setHttpIsLoading] = useState(false);
  const [httpError, setHttpError] = useState('');

  const [wsStatus, setWsStatus] = useState('stopped');
  const [wsPort, setWsPort] = useState(3031);
  const [wsIsLoading, setWsIsLoading] = useState(false);
  const [wsError, setWsError] = useState('');

  const [chromeConnected, setChromeConnected] = useState(false);
  const [connectedClient, setConnectedClient] = useState('');
  const [clients, setClients] = useState<ClientInfo[]>([]);

  const [testPrompt, setTestPrompt] = useState("Tell me about WebSockets in 2-3 sentences.");
  const [sendingTest, setSendingTest] = useState(false);
  const [targetType, setTargetType] = useState<'broadcast' | 'platform' | 'client'>('broadcast');
  const [targetId, setTargetId] = useState<string | null>(null);

  const [newChatStatus, setNewChatStatus] = useState<NewChatStatus>({ loading: false, result: null });

  // Get WebSocket service instance
  const wsService = WebSocketService.getInstance();

  useEffect(() => {
    const unlisten = listen('api-server-started', (event) => {
      const actualPort = event.payload as number;
      if (actualPort !== httpPort) {
        setHttpPort(actualPort);
        setHttpError(`Port ${httpPort} busy; using ${actualPort}`);
      } else {
        setHttpError('');
      }
    });
  
    return () => {
      unlisten.then((f) => f());
    };
  }, [httpPort]);
  


  useEffect(() => {
    const setupNewChatListener = async () => {
      const unlisten = await listen('chrome-extension-message', (event) => {
        const payload = event.payload as NewChatResult;
        if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'newChatResult') {
          setNewChatStatus({ loading: false, result: payload });
          
          // Show notification based on result
          notifications.show({
            title: payload.success ? 'Success' : 'Action Failed',
            message: payload.message,
            color: payload.success ? 'green' : 'red'
          });
        }
      });
      
      return unlisten;
    };
    
    const unlistenPromise = setupNewChatListener();
    
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const clientRefreshInterval = setInterval(() => {
      if (wsStatus === 'running') {
        wsService.getConnectedClients().then(setClients);
      }
    }, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(clientRefreshInterval);
  }, [wsStatus]);

  useEffect(() => {
    // Listen for client updates
    const setupClientListener = async () => {
      const unlisten = await listen('chrome-extension-clients-updated', (event) => {
        const clients = event.payload as ClientInfo[];
        setClients(clients);
        
        // Check if the currently selected client is still available
        if (targetType === 'client' && targetId) {
          const clientStillExists = clients.some(client => client.id === targetId);
          if (!clientStillExists) {
            // Reset selection if the client is no longer available
            setTargetId(null);
            notifications.show({
              title: 'Client Disconnected',
              message: 'The selected client has disconnected. Please select another client.',
              color: 'yellow'
            });
          }
        }
      });
      
      return unlisten;
    };
    
    const unlistenPromise = setupClientListener();
    
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [targetId, targetType]);

  useEffect(() => {
    // Listen for chrome extension connection events
    const unlisten = listen('chrome-extension-connection', (event) => {
      const payload = event.payload as { connected: boolean, clientInfo: string };
      if (payload && typeof payload === 'object') {
        setChromeConnected(payload.connected);
        if (payload.connected) {
          setConnectedClient(payload.clientInfo);
        } else {
          setConnectedClient('');
        }
      }
    });
    
    // Listen for clients updated events
    const clientsUnlisten = listen('chrome-extension-clients-updated', (event) => {
      setClients(event.payload as ClientInfo[]);
    });
  
    return () => {
      unlisten.then(fn => fn());
      clientsUnlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    checkHttpServerStatus();
    checkWebSocketServerStatus();
    
    // Set up a periodic check for WebSocket status
    const intervalId = setInterval(() => {
      setWsStatus(wsService.getStatus());
    }, 2000);
  
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  
  const PlatformSelectItem = forwardRef<HTMLDivElement, PlatformSelectItemProps>(
    ({ label, favicon, ...others }, ref) => (
      <div ref={ref} {...others}>
        <Group>
          <SafeFavicon url={favicon} size={12} />
          <span>{label}</span>
        </Group>
      </div>
    )
  );
  
  PlatformSelectItem.displayName = 'PlatformSelectItem';

  const sendTestPrompt = async () => {
    if (!testPrompt) {
      notifications.show({
        title: 'Empty Prompt',
        message: 'Please enter a test prompt first',
        color: 'yellow'
      });
      return;
    }
    
    setSendingTest(true);
    try {
      await core.invoke('send_message_to_chrome', { 
        message: JSON.stringify({
          type: 'insertPrompt',
          prompt: testPrompt,
          autoSubmit: true // Set to true to test automatic submission
        })
      });
      
      notifications.show({
        title: 'Success',
        message: 'Test prompt sent to Chrome extension',
        color: 'green'
      });
    } catch (error) {
      console.error('Error sending test prompt:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to send test prompt: ${String(error)}`,
        color: 'red'
      });
    } finally {
      setSendingTest(false);
    }
  };

  const sendTargetedTestPrompt = async () => {
    if (!testPrompt) {
      notifications.show({
        title: 'Empty Prompt',
        message: 'Please enter a test prompt first',
        color: 'yellow'
      });
      return;
    }
    
    setSendingTest(true);
    try {
      const message = {
        type: 'insertPrompt',
        prompt: testPrompt,
        autoSubmit: true
      };
      
      await wsService.sendTargetedMessage(
        message,
        targetType, 
        targetId || undefined
      );
      
      notifications.show({
        title: 'Success',
        message: `Test prompt sent to ${targetType === 'broadcast' ? 'all clients' : 
                  targetType === 'platform' ? `${targetId} platform` :
                  'specific client'}`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error sending test prompt:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to send test prompt: ${String(error)}`,
        color: 'red'
      });
    } finally {
      setSendingTest(false);
    }
  };

  // HTTP Server Functions
  const checkHttpServerStatus = async () => {
    try {
      const response = await fetch(`http://localhost:${httpPort}/api/status`);
      if (response.ok) {

        const actualPort = await core.invoke('start_api_server', { port: httpPort }) as number;
        if (actualPort !== httpPort) {
          setHttpPort(actualPort);
          setHttpError(`Port ${httpPort} busy; using port ${actualPort}`);
        }
        else {
          setHttpError('');
        }

        setHttpStatus('running');
      } else {
        await handleStartHttpService();
      }
    } catch (error) {
      // If fetch fails, server is probably not running, so try to start it
      await handleStartHttpService();
    }
  };

  const checkWebSocketServerStatus = async () => {
    try {
      // Get current status from service
      const status = wsService.getStatus();
      setWsStatus(status);
      setWsPort(wsService.getPort());
      
      // If not running, try to start it
      if (status !== 'running') {
        try {
          // Start directly using the service instead of using handleStartWsService
          // to avoid showing the error notification
          setWsIsLoading(true);
          await wsService.start(wsPort);
          setWsStatus('running');
          // No notification for auto-start
        } catch (error) {
          // Only log the error without showing notification or setting error state
          // if it contains "already running"
          const errorStr = String(error);
          if (!errorStr.includes('already running')) {
            setWsError(errorStr);
          }
        } finally {
          setWsIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Failed to check WebSocket server status:', error);
      setWsError(String(error));
    }
  };

  const handleStartHttpService = async () => {
    setHttpIsLoading(true);
    setHttpError('');
    try {
      const actualPort = await core.invoke('start_api_server', { port: httpPort }) as number;
      if (actualPort !== httpPort) {
        setHttpPort(actualPort);
        setHttpError(`Port ${httpPort} busy; using port ${actualPort}`);
      } else {
        setHttpError('');
      }
      console.log('API server started on port:', actualPort);
      setHttpStatus('running');
    } catch (error) {
      console.error('Failed to start API server:', error);
      setHttpStatus('stopped');
      setHttpError(String(error));
    } finally {
      setHttpIsLoading(false);
    }
  };

  const handleStopHttpService = async () => {
    setHttpIsLoading(true);
    setHttpError('');
    try {
      await core.invoke('stop_api_server');
      setHttpStatus('stopped');
    } catch (error) {
      console.error('Failed to stop API server:', error);
      setHttpError(String(error));
    } finally {
      setHttpIsLoading(false);
    }
  };

  const handleHttpPortChange = (value: string) => {
    const newPort = parseInt(value, 10);
    if (!isNaN(newPort) && newPort >= 0 && newPort <= 65535) {
      setHttpPort(newPort);
    }
  };

  const handleApplyHttpPort = async () => {
    if (httpStatus === 'running') {
      await handleStopHttpService();
    }
    await handleStartHttpService();
  };

  // WebSocket Server Functions
  const handleStartWsService = async () => {
    setWsIsLoading(true);
    setWsError('');
    try {
      await wsService.start(wsPort);
      setWsStatus('running');
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      setWsStatus('stopped');
      setWsError(String(error));
    } finally {
      setWsIsLoading(false);
    }
  };

  const handleStopWsService = async () => {
    setWsIsLoading(true);
    setWsError('');
    try {
      await wsService.stop();
      setWsStatus('stopped');
    } catch (error) {
      console.error('Failed to stop WebSocket server:', error);
      setWsError(String(error));
    } finally {
      setWsIsLoading(false);
    }
  };

  const handleWsPortChange = (value: string) => {
    const newPort = parseInt(value, 10);
    if (!isNaN(newPort) && newPort >= 0 && newPort <= 65535) {
      setWsPort(newPort);
    }
  };

  const handleApplyWsPort = async () => {
    if (wsStatus === 'running') {
      await handleStopWsService();
    }
    await handleStartWsService();
  };

  const refreshClients = async () => {
    try {
      const clientsList = await wsService.getConnectedClients();
      setClients(clientsList);
    } catch (error) {
      console.error('Failed to refresh clients:', error);
    }
  };

  // Helper functions for targeting options
  const getPlatformOptions = () => {
    // Get unique platforms from clients with their favicons
    const platformData: Record<string, { platform: string, favicon?: string }> = {};
    
    clients.forEach(c => {
      if (c.platform) {
        // If we haven't seen this platform yet, or if this client has a favicon and the current one doesn't
        if (!platformData[c.platform] || (!platformData[c.platform].favicon && c.favicon)) {
          platformData[c.platform] = {
            platform: c.platform,
            favicon: c.favicon
          };
        }
      }
    });
    
    // If no platforms detected yet, return default options
    if (Object.keys(platformData).length === 0) {
      return [
        { value: 'chatgpt', label: 'ChatGPT', favicon: null }, 
        { value: 'claude', label: 'Claude', favicon: null }
      ];
    }
    
    return Object.values(platformData).map(p => ({ 
      value: p.platform, 
      // Make display names nicer
      label: p.platform === 'chatgpt' ? 'ChatGPT' : 
             p.platform === 'claude' ? 'Claude' : p.platform,
      favicon: p.favicon
    }));
  };
  
  const getClientOptions = () => {
    return clients.map(c => {
      // Format text for the label
      const title = c.tab_title || `${c.platform || 'Unknown'}`;
      const url = c.tab_url ? ` (${new URL(c.tab_url).hostname})` : '';
      const active = Date.now() - c.last_active * 1000 < 30000;
      
      return {
        value: c.id,
        label: `${title}${url}`,  // Plain text label
        description: c.platform,
        active: active,
        favicon: c.favicon
      };
    });
  };

  return (
    <Stack>
      <Card className="w-full" shadow="sm" padding="lg">
        <Stack>
          <Group justify="space-between">
            <Group>
              <Settings size={24} />
              <Text size="xl">HTTP API Server</Text>
            </Group>
            <Badge color={httpStatus === 'running' ? 'green' : 'red'} variant="filled">
              {httpStatus}
            </Badge>
          </Group>

          <Stack>
            <TextInput
              label="Port"
              placeholder="Enter port number"
              value={httpPort}
              onChange={(event) => handleHttpPortChange(event.currentTarget.value)}
              disabled={httpIsLoading}
            />

            <Text size="sm" color="dimmed">
              Server URL: http://localhost:{httpPort}
            </Text>

            {httpError && (
              <Text size="sm" color="red">
                {httpError}
              </Text>
            )}
          </Stack>

          <Group>
            <Button
              leftSection={<Power size={16} />}
              color="green"
              onClick={handleStartHttpService}
              disabled={httpStatus === 'running' || httpIsLoading}
              loading={httpIsLoading && httpStatus === 'stopped'}
            >
              Start Server
            </Button>
            <Button
              leftSection={<PowerOff size={16} />}
              color="red"
              onClick={handleStopHttpService}
              disabled={httpStatus === 'stopped' || httpIsLoading}
              loading={httpIsLoading && httpStatus === 'running'}
            >
              Stop Server
            </Button>
            <Button
              color="blue"
              onClick={handleApplyHttpPort}
              disabled={httpIsLoading}
              loading={httpIsLoading}
            >
              Apply Port
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card className="w-full" shadow="sm" padding="lg">
        <Stack>
          <Group justify="space-between">
            <Group>
              <Radio size={24} />
              <Text size="xl">WebSocket Server</Text>
            </Group>
            <Group>
              {chromeConnected && (
                <Badge color="green" variant="filled">
                  Extension Connected
                </Badge>
              )}
              <Badge color={wsStatus === 'running' ? 'green' : 'red'} variant="filled">
                {wsStatus}
              </Badge>
            </Group>
          </Group>

          <Stack>
            <TextInput
              label="Port"
              placeholder="Enter port number"
              value={wsPort}
              onChange={(event) => handleWsPortChange(event.currentTarget.value)}
              disabled={wsIsLoading}
            />

            <Text size="sm" color="dimmed">
              Server URL: ws://localhost:{wsPort}
            </Text>

            <Text size="xs" color="dimmed">
              This WebSocket server enables real-time communication with Chrome extensions.
            </Text>

            {wsError && (
              <Text size="sm" color="red">
                {wsError}
              </Text>
            )}
          </Stack>

          <Group>
            <Button
              leftSection={<Power size={16} />}
              color="green"
              onClick={handleStartWsService}
              disabled={wsStatus === 'running' || wsIsLoading}
              loading={wsIsLoading && wsStatus === 'stopped'}
            >
              Start Server
            </Button>
            <Button
              leftSection={<PowerOff size={16} />}
              color="red"
              onClick={handleStopWsService}
              disabled={wsStatus === 'stopped' || wsIsLoading}
              loading={wsIsLoading && wsStatus === 'running'}
            >
              Stop Server
            </Button>
            <Button
              color="blue"
              onClick={handleApplyWsPort}
              disabled={wsIsLoading}
              loading={wsIsLoading}
            >
              Apply Port
            </Button>
          </Group>
          {chromeConnected && (
            <Text size="xs" color="dimmed">
              Chrome extension connected from: {connectedClient}
            </Text>
          )}          
        </Stack>
        
        <Group mt="md">
          <TextInput
            label="Test Prompt"
            placeholder="Enter a test prompt here"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.currentTarget.value)}
            style={{ flexGrow: 1 }}
          />
          <Button
            mt={25} // Align with the input
            onClick={sendTestPrompt}
            disabled={wsStatus !== 'running'}
            loading={sendingTest}
          >
            Send to Extension
          </Button>
        </Group>
      </Card>

      {/* Add client list component when server is running */}
      {wsStatus === 'running' && <ChromeClientsList />}
      
      {/* Add targeted messaging UI when server is running */}
      {wsStatus === 'running' && (
        <Card className="w-full" shadow="sm" padding="lg">
          <Stack>
            <Text size="lg">Targeted Message</Text>
            
            <TextInput
              label="Test Prompt"
              placeholder="Enter a test prompt here"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.currentTarget.value)}
            />
            
            <Group grow>
              <Select
                label="Target Type"
                value={targetType}
                onChange={(value) => {
                  if (value) {
                    setTargetType(value as 'broadcast' | 'platform' | 'client');
                  }
                }}
                data={[
                  { value: 'broadcast', label: 'Broadcast to All' },
                  { value: 'platform', label: 'Specific Platform' },
                  { value: 'client', label: 'Specific Client' }
                ]}
              />
              
              {targetType === 'platform' && (
                <Select
                  label="Select Platform"
                  value={targetId}
                  onChange={setTargetId}
                  data={getPlatformOptions()}
                  placeholder="Select platform"
                  disabled={getPlatformOptions().length === 0}
                  renderOption={({ option }) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <SafeFavicon url={option.favicon} size={12} />
                      <Text>{option.label}</Text>
                    </div>
                  )}
                />
              )}
              
              {targetType === 'client' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <Select
                    label="Select Client"
                    value={targetId}
                    onChange={setTargetId}
                    data={getClientOptions()}
                    placeholder="Select client"
                    disabled={clients.length === 0}
                    style={{ flexGrow: 1 }}
                    renderOption={({ option }) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SafeFavicon url={option.favicon} size={12} />
                        {option.active && (
                          <div 
                            style={{ 
                              width: 8, 
                              height: 8, 
                              borderRadius: '50%', 
                              backgroundColor: '#2ECC40',
                              marginRight: '0px'
                            }} 
                          />
                        )}
                        <Text>{option.label}</Text>
                      </div>
                    )}
                  />
                  <ActionIcon onClick={refreshClients} style={{ marginTop: '30px' }}>
                    <RefreshCw size={16} />
                  </ActionIcon>
                </div>
              )}
            </Group>
            
            <Button
              onClick={sendTargetedTestPrompt}
              disabled={
                wsStatus !== 'running' || 
                (targetType === 'platform' && !targetId) ||
                (targetType === 'client' && !targetId)
              }
              loading={sendingTest}
            >
              Send Targeted Message
            </Button>
          </Stack>
        </Card>
      )}

      {wsStatus === 'running' && (
        <Card className="w-full" shadow="sm" padding="lg">
          <Stack>
            <Group justify="space-between">
              <Text size="lg">New AI Chat</Text>
              <Badge color="violet" variant="filled">ChatGPT & Claude</Badge>
            </Group>
            
            <Text size="xs" color="dimmed">
              Creates a new conversation by triggering the New Chat functionality in ChatGPT or Claude.
            </Text>
            
            <Group grow>
              <Select
                label="Target Type"
                value={targetType}
                onChange={(value) => {
                  if (value) {
                    setTargetType(value as 'broadcast' | 'platform' | 'client');
                    // Reset result when changing targeting
                    setNewChatStatus({ loading: false, result: null });
                  }
                }}
                data={[
                  { value: 'broadcast', label: 'Broadcast to All' },
                  { value: 'platform', label: 'Specific Platform' },
                  { value: 'client', label: 'Specific Client' }
                ]}
              />
              
              {targetType === 'platform' && (
                <Select
                  label="Select Platform"
                  value={targetId}
                  onChange={setTargetId}
                  data={getPlatformOptions()}
                  placeholder="Select platform"
                  disabled={getPlatformOptions().length === 0}
                  renderOption={({ option }) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <SafeFavicon url={option.favicon} size={12} />
                      <Text>{option.label}</Text>
                    </div>
                  )}
                />
              )}
              
              {targetType === 'client' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <Select
                    label="Select Client"
                    value={targetId}
                    onChange={setTargetId}
                    data={getClientOptions()}
                    placeholder="Select client"
                    disabled={clients.length === 0}
                    style={{ flexGrow: 1 }}
                    renderOption={({ option }) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SafeFavicon url={option.favicon} size={12} />
                        {option.active && (
                          <div 
                            style={{ 
                              width: 8, 
                              height: 8, 
                              borderRadius: '50%', 
                              backgroundColor: '#2ECC40',
                              marginRight: '0px'
                            }} 
                          />
                        )}
                        <Text>{option.label}</Text>
                      </div>
                    )}
                  />
                  <ActionIcon onClick={refreshClients} style={{ marginTop: '30px' }}>
                    <RefreshCw size={16} />
                  </ActionIcon>
                </div>
              )}
            </Group>
            
            {/* Enhanced result display section */}
            {newChatStatus.result && (
              <Card withBorder p="xs" radius="md" bg={newChatStatus.result.success ? 'rgba(0, 200, 0, 0.05)' : 'rgba(255, 0, 0, 0.05)'}>
                <Stack>
                  <Group justify="space-between">
                    <Group>
                      <Badge 
                        color={newChatStatus.result.success ? 'green' : 'red'}
                        variant="filled"
                        size="lg"
                      >
                        {newChatStatus.result.success ? 'Success' : 'Failed'}
                      </Badge>
                      {newChatStatus.result.platform && (
                        <Badge color="gray" variant="light">
                          {newChatStatus.result.platform === 'chatgpt' ? 'ChatGPT' : 
                          newChatStatus.result.platform === 'claude' ? 'Claude' : 
                          newChatStatus.result.platform}
                        </Badge>
                      )}
                    </Group>
                    {newChatStatus.result.tabId && (
                      <Text size="xs" color="dimmed">Tab ID: {newChatStatus.result.tabId}</Text>
                    )}
                  </Group>
                  
                  <Text size="sm">
                    {newChatStatus.result.message}
                  </Text>
                  
                  {/* Platform-specific details */}
                  {newChatStatus.result.platform === 'chatgpt' && (
                    <>
                      {/* ChatGPT specific details */}
                      {newChatStatus.result.initialArticleCount !== undefined && (
                        <Text size="xs" color="dimmed">
                          Article count: {newChatStatus.result.initialArticleCount} → {newChatStatus.result.finalArticleCount || 0}
                        </Text>
                      )}
                      {newChatStatus.result.attempts && (
                        <Text size="xs" color="dimmed">
                          Attempts: {newChatStatus.result.attempts}
                        </Text>
                      )}
                    </>
                  )}
                  
                  {newChatStatus.result.platform === 'claude' && (
                    <>
                      {/* Claude specific details */}
                      {newChatStatus.result.initialMessageCount !== undefined && (
                        <Text size="xs" color="dimmed">
                          Message count: {newChatStatus.result.initialMessageCount} → {newChatStatus.result.finalMessageCount || 0}
                        </Text>
                      )}
                      {newChatStatus.result.method && (
                        <Text size="xs" color="dimmed">
                          Method: {newChatStatus.result.method.replace(/-/g, ' ')}
                        </Text>
                      )}
                    </>
                  )}
                  
                  {/* Timestamp */}
                  <Text size="xs" color="dimmed" ta="right">
                    {new Date().toLocaleTimeString()}
                  </Text>
                </Stack>
              </Card>
            )}
            
            <Button
              color="teal"
              loading={newChatStatus.loading}
              onClick={() => {
                // Reset previous results
                setNewChatStatus({ loading: true, result: null });
                
                // Send the newChat message
                wsService.sendTargetedMessage(
                  { type: 'newChat' },
                  targetType, 
                  targetId || undefined
                ).then(() => {
                  // Message sent successfully - result will come back via websocket
                }).catch(error => {
                  // Error sending message
                  setNewChatStatus({ 
                    loading: false, 
                    result: { 
                      success: false, 
                      message: `Failed to send command: ${String(error)}` 
                    } 
                  });
                  
                  notifications.show({
                    title: 'Error',
                    message: `Failed to send new chat command: ${String(error)}`,
                    color: 'red'
                  });
                });
              }}
              disabled={
                wsStatus !== 'running' || 
                (targetType === 'platform' && !targetId) ||
                (targetType === 'client' && !targetId) ||
                clients.length === 0 ||
                newChatStatus.loading
              }
            >
              Start New Chat
            </Button>
          </Stack>
        </Card>
      )}

    </Stack>
  );
}