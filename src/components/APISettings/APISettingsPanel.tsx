// src/components/APISettings/APISettingsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Group, TextInput, Button, Badge, Stack } from '@mantine/core';
import { Settings, Power, PowerOff, Radio } from 'lucide-react';
import { core } from '@tauri-apps/api';
import WebSocketService from '../../services/WebSocketService';

export function APISettingsPanel() {
  const [httpStatus, setHttpStatus] = useState('stopped');
  const [httpPort, setHttpPort] = useState(3030);
  const [httpIsLoading, setHttpIsLoading] = useState(false);
  const [httpError, setHttpError] = useState('');

  const [wsStatus, setWsStatus] = useState('stopped');
  const [wsPort, setWsPort] = useState(3031);
  const [wsIsLoading, setWsIsLoading] = useState(false);
  const [wsError, setWsError] = useState('');

  // Get WebSocket service instance
  const wsService = WebSocketService.getInstance();

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
            <Badge color={wsStatus === 'running' ? 'green' : 'red'} variant="filled">
              {wsStatus}
            </Badge>
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
        </Stack>
      </Card>
    </Stack>
  );
}