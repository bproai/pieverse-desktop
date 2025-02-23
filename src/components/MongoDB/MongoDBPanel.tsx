// src/components/MongoDB/MongoDBPanel.tsx
import React, { useState } from 'react';
import { Card, Button, Text, Group, Stack, Badge } from '@mantine/core';
import { Database, Power, PowerOff } from 'lucide-react';
import { core } from '@tauri-apps/api';

const MongoDBPanel = () => {
  const [status, setStatus] = useState('stopped');
  const [port, setPort] = useState(27017);
  const [url, setUrl] = useState('mongodb://localhost:27017');

  const handleStartService = async () => {
    try {
      await core.invoke('start_mongodb');
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

        <Text size="sm" color="gray">
          Connection URL: {url}
        </Text>
        <Text size="sm" color="gray">
          Port: {port}
        </Text>

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
