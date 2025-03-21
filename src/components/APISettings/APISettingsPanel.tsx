// src/components/APISettings/APISettingsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Group, TextInput, Button, Badge, Stack, Select, ActionIcon } from '@mantine/core';
import { Settings, Power, PowerOff, Radio, RefreshCw } from 'lucide-react';
import { core } from '@tauri-apps/api';
import WebSocketService, { ClientInfo } from '../../services/WebSocketService';
import { listen } from '@tauri-apps/api/event';
import { notifications } from '@mantine/notifications';
import { ChromeClientsList } from './ChromeClientsList';

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


  const [newChatStatus, setNewChatStatus] = useState({ loading: false, result: null });

  // Get WebSocket service instance
  const wsService = WebSocketService.getInstance();


  useEffect(() => {
    const setupNewChatListener = async () => {
      const unlisten = await listen('chrome-extension-message', (event) => {
        const payload = event.payload;
        if (payload.type === 'newChatResult') {
          setNewChatStatus(prev => ({ ...prev, loading: false, result: payload }));
          
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
        setClients(event.payload as ClientInfo[]);
        
        // Check if the currently selected client is still available
        if (targetType === 'client' && targetId) {
          const clientStillExists = event.payload.some((client: ClientInfo) => client.id === targetId);
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
      setChromeConnected(payload.connected);
      if (payload.connected) {
        setConnectedClient(payload.clientInfo);
      } else {
        setConnectedClient('');
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
    
    // Check initial WebSocket status
    setWsStatus(wsService.getStatus());
    setWsPort(wsService.getPort());

    // Set up a periodic check for WebSocket status
    const intervalId = setInterval(() => {
      setWsStatus(wsService.getStatus());
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

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
        message: `Failed to send test prompt: ${error}`,
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
        message: `Failed to send test prompt: ${error}`,
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
        setHttpStatus('running');
      } else {
        await handleStartHttpService();
      }
    } catch (error) {
      // If fetch fails, server is probably not running, so try to start it
      await handleStartHttpService();
    }
  };

  const handleStartHttpService = async () => {
    setHttpIsLoading(true);
    setHttpError('');
    try {
      await core.invoke('start_api_server', { port: httpPort });
      setHttpStatus('running');
    } catch (error) {
      console.error('Failed to start API server:', error);
      // If error contains "already running", just set status to running
      if (error.toString().includes('already running')) {
        setHttpStatus('running');
      } else {
        setHttpStatus('stopped');
        setHttpError(error.toString());
      }
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
      setHttpError(error.toString());
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
      setWsError(error.toString());
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
      setWsError(error.toString());
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
    // Get unique platforms from clients
    const platforms = [...new Set(clients.map(c => c.platform).filter(p => p))];
    
    // If no platforms detected yet, return default options
    if (platforms.length === 0) {
      return [
        { value: 'chatgpt', label: 'ChatGPT' }, 
        { value: 'claude', label: 'Claude' }
      ];
    }
    
    return platforms.map(p => ({ 
      value: p, 
      // Make display names nicer
      label: p === 'chatgpt' ? 'ChatGPT' : 
            p === 'claude' ? 'Claude' : p
    }));
  };
  
  const getClientOptions = () => {
    return clients.map(c => {
      // Calculate how long since last active
      const lastActiveSeconds = Math.floor((Date.now() - c.last_active * 1000) / 1000);
      const isRecent = lastActiveSeconds < 30; // Consider active if message in last 30 seconds
      
      return {
        value: c.id,
        label: `${c.platform || 'Unknown'} (${c.addr})${isRecent ? ' 🟢' : ' ⚪'}`, 
        // Green dot for recently active clients
      };
    });
  };

  return (
    <Stack spacing="lg">
      <Card className="w-full" shadow="sm" padding="lg">
        <Stack>
          <Group position="apart">
            <Group>
              <Settings size={24} />
              <Text size="xl" weight={500}>HTTP API Server</Text>
            </Group>
            <Badge color={httpStatus === 'running' ? 'green' : 'red'} variant="filled">
              {httpStatus}
            </Badge>
          </Group>

          <Stack spacing="xs">
            <TextInput
              label="Port"
              placeholder="Enter port number"
              value={httpPort}
              onChange={(event) => handleHttpPortChange(event.currentTarget.value)}
              disabled={httpIsLoading}
            />

            <Text size="sm" color="gray">
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
          <Group position="apart">
            <Group>
              <Radio size={24} />
              <Text size="xl" weight={500}>WebSocket Server</Text>
            </Group>
            <Group spacing={8}>
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

          <Stack spacing="xs">
            <TextInput
              label="Port"
              placeholder="Enter port number"
              value={wsPort}
              onChange={(event) => handleWsPortChange(event.currentTarget.value)}
              disabled={wsIsLoading}
            />

            <Text size="sm" color="gray">
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
            <Text size="lg" weight={500}>Targeted Message</Text>
            
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
                onChange={(value) => setTargetType(value as 'broadcast' | 'platform' | 'client')}
                data={[
                  { value: 'broadcast', label: 'Broadcast to All' },
                  { value: 'platform', label: 'Target Platform' },
                  { value: 'client', label: 'Target Specific Client' }
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
                />
              )}
              
              {targetType === 'client' && (
                <Group position="apart" mt="md">
                  <Select
                    label="Select Client"
                    value={targetId}
                    onChange={setTargetId}
                    data={getClientOptions()}
                    placeholder="Select client"
                    disabled={clients.length === 0}
                    style={{ flexGrow: 1 }}
                  />
                  <ActionIcon onClick={refreshClients} mt={30}>
                    <RefreshCw size={16} />
                  </ActionIcon>
                </Group>
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
            <Group position="apart">
              <Text size="lg" weight={500}>New ChatGPT Chat</Text>
              <Badge color="blue" variant="filled">ChatGPT Only</Badge>
            </Group>
            
            <Text size="xs" color="dimmed">
              This will trigger the "New Chat" button on ChatGPT, creating a fresh conversation.
            </Text>
            
            <Group grow>
              <Select
                label="Target Type"
                value={targetType}
                onChange={(value) => {
                  setTargetType(value as 'broadcast' | 'platform' | 'client');
                  // Reset result when changing targeting
                  setNewChatStatus({ loading: false, result: null });
                }}
                data={[
                  { value: 'broadcast', label: 'All ChatGPT Tabs' },
                  { value: 'client', label: 'Specific ChatGPT Tab' }
                ]}
              />
              
              {targetType === 'client' && (
                <Group position="apart" mt="md">
                  <Select
                    label="Select Client"
                    value={targetId}
                    onChange={(val) => {
                      setTargetId(val);
                      // Reset result when changing client
                      setNewChatStatus({ loading: false, result: null });
                    }}
                    data={getClientOptions().filter(option => 
                      // Only show ChatGPT clients
                      option.label.toLowerCase().includes('chatgpt')
                    )}
                    placeholder="Select ChatGPT client"
                    disabled={clients.filter(c => c.platform === 'chatgpt').length === 0}
                    style={{ flexGrow: 1 }}
                  />
                  <ActionIcon onClick={refreshClients} mt={30}>
                    <RefreshCw size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
            
            {newChatStatus.result && (
              <Group mt={4}>
                <Badge 
                  color={newChatStatus.result.success ? 'green' : 'red'}
                  variant="filled"
                >
                  {newChatStatus.result.success ? 'Success' : 'Failed'}
                </Badge>
                <Text size="xs">{newChatStatus.result.message}</Text>
              </Group>
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
                      message: `Failed to send command: ${error}` 
                    } 
                  });
                  
                  notifications.show({
                    title: 'Error',
                    message: `Failed to send new chat command: ${error}`,
                    color: 'red'
                  });
                });
              }}
              disabled={
                wsStatus !== 'running' || 
                (targetType === 'client' && !targetId) ||
                clients.filter(c => c.platform === 'chatgpt').length === 0 ||
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