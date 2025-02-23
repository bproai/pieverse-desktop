// src/components/MongoDB/MongoDBPanel.tsx
import React, { useState } from 'react';
import { Card, Button, Text, Group, Stack, Badge, TextInput, Switch } from '@mantine/core';
import { Database, Power, PowerOff, Link } from 'lucide-react';
import { core } from '@tauri-apps/api';

const MongoDBPanel = () => {
  const [status, setStatus] = useState('stopped');
  const [port, setPort] = useState(27017);
  const defaultUrl = `mongodb://localhost:${port}`;
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const currentUrl = useCustomUrl ? customUrl : defaultUrl;

  const handleStartService = async () => {
    try {
      await core.invoke('start_mongodb', { url: currentUrl });
      setStatus('running');
    } catch (error) {
      console.error('Failed to start MongoDB:', error);
    }
  };

  const handleStopService = async () => {
    try {
      await core.invoke('stop_mongodb');
      setStatus('stopped');
    } catch (error) {
      console.error('Failed to stop MongoDB:', error);
    }
  };

  return (
    <Card className="w-full" shadow="sm" padding="lg">
      <Stack>
        <Group position="apart">
          <Group>
            <Database size={24} />
            <Text size="xl" weight={500}>MongoDB Service</Text>
          </Group>
          <Badge color={status === 'running' ? 'green' : 'red'} variant="filled">
            {status}
          </Badge>
        </Group>

        <Stack spacing="xs">
          <Group>
            <Switch
              label="Use custom URI"
              checked={useCustomUrl}
              onChange={(event) => setUseCustomUrl(event.currentTarget.checked)}
            />
          </Group>

          {useCustomUrl ? (
            <TextInput
              icon={<Link size={16} />}
              placeholder="Enter custom MongoDB URI"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.currentTarget.value)}
            />
          ) : (
            <Text size="sm" color="gray">
              Connection URL: {defaultUrl}
            </Text>
          )}

          <Text size="sm" color="gray">
            Port: {port}
          </Text>
        </Stack>

        <Group>
          <Button
            leftIcon={<Power size={16} />}
            color="green"
            onClick={handleStartService}
            disabled={status === 'running'}
          >
            Start Service
          </Button>
          <Button
            leftIcon={<PowerOff size={16} />}
            color="red"
            onClick={handleStopService}
            disabled={status === 'stopped'}
          >
            Stop Service
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export default MongoDBPanel;