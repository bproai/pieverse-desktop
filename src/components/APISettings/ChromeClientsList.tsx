// src/components/APISettings/ChromeClientsList.tsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Group, Stack, Badge, ActionIcon, Select } from '@mantine/core';
import { RefreshCw } from 'lucide-react';
import WebSocketService, { ClientInfo } from '../../services/WebSocketService';
import { listen } from '@tauri-apps/api/event';

export function ChromeClientsList() {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(false);
  
  const wsService = WebSocketService.getInstance();
  
  useEffect(() => {
    // Initial load
    loadClients();

    // Listen for client updates
    const setupListener = async () => {
      const unlisten = await listen('chrome-extension-clients-updated', (event) => {
        setClients(event.payload as ClientInfo[]);
      });
      
      return unlisten;
    };

    const unlistenPromise = setupListener();
    
    // Set up periodic refresh as fallback
    const intervalId = setInterval(() => {
      loadClients();
    }, 10000);
    
    return () => {
      clearInterval(intervalId);
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);
  
  const loadClients = async () => {
    setLoading(true);
    try {
      const clientsList = await wsService.getConnectedClients();
      setClients(clientsList);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const refreshClients = () => {
    loadClients();
  };
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  return (
    <Card className="w-full" shadow="sm" padding="lg">
      <Stack>
        <Group position="apart">
          <Text size="lg" weight={500}>Connected Chrome Clients</Text>
          <Group>
            <Badge color={clients.length > 0 ? 'green' : 'gray'} variant="filled">
              {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
            </Badge>
            <ActionIcon onClick={refreshClients} loading={loading}>
              <RefreshCw size={16} />
            </ActionIcon>
          </Group>
        </Group>
        
        <Stack spacing="xs">
          {clients.length === 0 ? (
            <Text color="dimmed" size="sm" style={{ fontStyle: 'italic' }}>No connected clients</Text>
          ) : (
            clients.map(client => (
              <Card key={client.id} withBorder p="sm">
                <Group position="apart">
                  <Stack spacing={0}>
                    <Text weight={500}>{client.platform || 'Unknown Platform'}</Text>
                    <Text size="xs" color="dimmed">{client.addr}</Text>
                  </Stack>
                  <Stack spacing={0} align="flex-end">
                    <Text size="xs">Connected: {formatTime(client.connected_at)}</Text>
                    <Text size="xs">Last active: {formatTime(client.last_active)}</Text>
                  </Stack>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Stack>
    </Card>
  );
}