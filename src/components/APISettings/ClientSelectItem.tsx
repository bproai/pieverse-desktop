// src/components/APISettings/ClientSelectItem.tsx
import React, { forwardRef } from 'react';
import { Group, Text, Badge } from '@mantine/core';
import { Globe } from 'lucide-react';

// First update the interface to include the favicon prop
interface ClientSelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    description?: string;
    platform?: string;
    active?: boolean;
    url?: string;
    favicon?: string;
}
  
export const ClientSelectItem = forwardRef<HTMLDivElement, ClientSelectItemProps>(
    ({ label, description, platform, active, favicon, ...others }: ClientSelectItemProps, ref) => (
      <div ref={ref} {...others}>
        <Group position="apart" nowrap='true' spacing="xs">
          <div style={{ maxWidth: 'calc(100% - 24px)' }}>
            <Group spacing="xs" nowrap='true'>
              {/* Favicon first */}
              {favicon ? (
                <div style={{ width: '12px', height: '12px', flexShrink: 0 }}>
                  <img 
                    src={favicon}
                    alt="Site favicon"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>
              ) : (
                <Globe size={12} />
              )}
              
              {/* Then active indicator */}
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
              
              {/* Then label */}
              <Text style={{ 
                maxWidth: '100%', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {label}
              </Text>
            </Group>
            
            {/* Platform badge if available */}
            {platform && (
              <Group spacing="xs" nowrap='true' ml={20}>
                <Badge size="xs" variant="outline">{platform}</Badge>
              </Group>
            )}
          </div>
        </Group>
      </div>
    )
);
  
ClientSelectItem.displayName = 'ClientSelectItem';