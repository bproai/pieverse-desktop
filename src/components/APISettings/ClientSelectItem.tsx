// src/components/APISettings/ClientSelectItem.tsx
import React, { forwardRef } from 'react';
import { Group, Text, Badge } from '@mantine/core';
import { Globe } from 'lucide-react';

interface ClientSelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
  label: string;
  description?: string;
  platform?: string;
  active?: boolean;
  url?: string;
}

export const ClientSelectItem = forwardRef<HTMLDivElement, ClientSelectItemProps>(
  ({ label, description, platform, active, url, ...others }: ClientSelectItemProps, ref) => (
    <div ref={ref} {...others}>
      <Group position="apart" noWrap spacing="xs">
        <div style={{ maxWidth: 'calc(100% - 24px)' }}>
          <Group spacing="xs" noWrap>
            {active && (
              <div 
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  backgroundColor: 'var(--mantine-color-green-6)' 
                }} 
              />
            )}
            <Text style={{ 
              maxWidth: '100%', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {label}
            </Text>
          </Group>
          
          {(platform || description) && (
            <Group spacing="xs" noWrap>
              {platform && (
                <Badge size="xs" variant="outline">{platform}</Badge>
              )}
              {description && (
                <Group spacing={2} noWrap>
                  <Globe size={10} />
                  <Text size="xs" color="dimmed" style={{ 
                    maxWidth: '150px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {description}
                  </Text>
                </Group>
              )}
            </Group>
          )}
        </div>
      </Group>
    </div>
  )
);

ClientSelectItem.displayName = 'ClientSelectItem';