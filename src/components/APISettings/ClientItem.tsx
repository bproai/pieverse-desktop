// src/components/APISettings/ClientItem.tsx
import { Card, Text, Group, Stack, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { ExternalLink } from 'lucide-react';
import { ClientInfo } from '../../services/WebSocketService';
import { safeOpenInNewTab, formatUrl } from '../../utils/urlUtils';
import { SafeFavicon } from '../common/SafeFavicon';

interface ClientItemProps {
  client: ClientInfo;
  selected?: boolean;
  onClick?: () => void;
}

export function ClientItem({ client, selected, onClick }: ClientItemProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  // Calculate how long since last active
  const lastActiveSeconds = Math.floor((Date.now() - client.last_active * 1000) / 1000);
  const isRecent = lastActiveSeconds < 30; // Consider active if message in last 30 seconds
  
  return (
    <Card 
      withBorder 
      p="sm" 
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        borderColor: selected ? 'var(--mantine-color-blue-6)' : undefined,
        backgroundColor: selected ? 'var(--mantine-color-blue-0)' : undefined
      }}
      onClick={onClick}
    >
      <Group justify="space-between">
        <Stack spacing={4} style={{ maxWidth: '70%' }}>
          <Group spacing={4} nowrap='true'>
            {isRecent && (
              <div 
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  backgroundColor: 'var(--mantine-color-green-6)' 
                }} 
              />
            )}
            <Text weight={500} style={{ 
              wordBreak: 'break-word',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {client.tab_title || `${client.platform || 'Unknown'} Tab`}
            </Text>
          </Group>
          
          {/* Display URL if available */}
          {client.tab_url && (
            <Group spacing={4} nowrap='true'>
              <SafeFavicon url={client.favicon} size={12} />
              <Tooltip label={client.tab_url} position="top">
                <Text size="xs" color="dimmed" style={{ 
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {formatUrl(client.tab_url)}
                </Text>
              </Tooltip>
              <ActionIcon 
                size="xs" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent parent click
                  safeOpenInNewTab(client.tab_url);
                }}
              >
                <ExternalLink size={12} />
              </ActionIcon>
            </Group>
          )}
          
          {/* Always show platform and connection info */}
          <Group spacing={4}>
            <Badge size="xs" variant="outline">
              {client.platform || 'Unknown'}
            </Badge>
            <Text size="xs" color="dimmed">{client.addr}</Text>
          </Group>
        </Stack>
        
        <Stack spacing={4} align="flex-end">
          <Text size="xs">Connected: {formatTime(client.connected_at)}</Text>
          <Text size="xs">Last active: {formatTime(client.last_active)}</Text>
        </Stack>
      </Group>
    </Card>
  );
}