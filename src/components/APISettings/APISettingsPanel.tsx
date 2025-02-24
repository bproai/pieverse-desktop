// src/components/APISettings/APISettingsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Group, TextInput, Button, Badge, Stack } from '@mantine/core';
import { Settings, Power, PowerOff } from 'lucide-react';
import { core } from '@tauri-apps/api';

export function APISettingsPanel() {
  const [status, setStatus] = useState('stopped');
  const [port, setPort] = useState(3030);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkServerStatus();
  }, []);

  const checkServerStatus = async () => {
    try {
      const response = await fetch('http://localhost:3030/api/status');
      if (response.ok) {
        setStatus('running');
      } else {
        await handleStartService();
      }
    } catch (error) {
      // If fetch fails, server is probably not running, so try to start it
      await handleStartService();
    }
  };

  const handleStartService = async () => {
    setIsLoading(true);
    setError('');
    try {
      await core.invoke('start_api_server', { port });
      setStatus('running');
    } catch (error) {
      console.error('Failed to start API server:', error);
      // If error contains "already running", just set status to running
      if (error.toString().includes('already running')) {
        setStatus('running');
      } else {
        setStatus('stopped');
        setError(error.toString());
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopService = async () => {
    setIsLoading(true);
    setError('');
    try {
      await core.invoke('stop_api_server');
      setStatus('stopped');
    } catch (error) {
      console.error('Failed to stop API server:', error);
      setError(error.toString());
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortChange = (value: string) => {
    const newPort = parseInt(value, 10);
    if (!isNaN(newPort) && newPort >= 0 && newPort <= 65535) {
      setPort(newPort);
    }
  };

  const handleApplyPort = async () => {
    if (status === 'running') {
      await handleStopService();
    }
    await handleStartService();
  };

  return (
    <Card className="w-full" shadow="sm" padding="lg">
      <Stack>
        <Group position="apart">
          <Group>
            <Settings size={24} />
            <Text size="xl" weight={500}>API Server</Text>
          </Group>
          <Badge color={status === 'running' ? 'green' : 'red'} variant="filled">
            {status}
          </Badge>
        </Group>

        <Stack spacing="xs">
          <TextInput
            label="Port"
            placeholder="Enter port number"
            value={port}
            onChange={(event) => handlePortChange(event.currentTarget.value)}
            disabled={isLoading}
          />

          <Text size="sm" color="gray">
            Server URL: http://localhost:{port}
          </Text>

          {error && (
            <Text size="sm" color="red">
              {error}
            </Text>
          )}
        </Stack>

        <Group>
          <Button
            leftIcon={<Power size={16} />}
            color="green"
            onClick={handleStartService}
            disabled={status === 'running' || isLoading}
            loading={isLoading && status === 'stopped'}
          >
            Start Server
          </Button>
          <Button
            leftIcon={<PowerOff size={16} />}
            color="red"
            onClick={handleStopService}
            disabled={status === 'stopped' || isLoading}
            loading={isLoading && status === 'running'}
          >
            Stop Server
          </Button>
          <Button
            color="blue"
            onClick={handleApplyPort}
            disabled={isLoading}
            loading={isLoading}
          >
            Apply Port
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}