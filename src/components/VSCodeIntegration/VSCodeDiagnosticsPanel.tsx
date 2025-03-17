// src/components/VSCodeIntegration/VSCodeDiagnosticsPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  Text, 
  Badge, 
  Card, 
  Group, 
  TextInput, 
  Button, 
  Accordion, 
  ScrollArea,
  Stack,
  Alert,
  Select,
  Code
} from '@mantine/core';
import { AlertCircle, Search, RefreshCw, FileText, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';

interface DiagnosticItem {
  severity: number;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string | { value: string; target: string };
  source?: string;
}

interface FileDiagnostics {
  file: string;
  diagnostics: DiagnosticItem[];
}

interface VSCodeDiagnosticsPanelProps {
  isServerRunning: boolean;
}

const VSCodeDiagnosticsPanel: React.FC<VSCodeDiagnosticsPanelProps> = ({ isServerRunning }) => {
  const [diagnostics, setDiagnostics] = useState<FileDiagnostics[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<number>(-1); // -1 = all, 0 = error, 1 = warning, etc.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for diagnostics messages on component mount
  useEffect(() => {
    const unlisten = listen('vscode-diagnostics', (event) => {
      console.log('Received diagnostics event:', event);
      const payload = event.payload as { data: FileDiagnostics[] };
      
      if (payload && payload.data) {
        setDiagnostics(payload.data);
        
        // Show notification with diagnostics count
        const totalFiles = payload.data.length;
        const totalDiagnostics = payload.data.reduce((count, file) => 
          count + file.diagnostics.length, 0);
        
        const totalErrors = payload.data.reduce((count, file) => {
          return count + file.diagnostics.filter(d => d.severity === 0).length;
        }, 0);
        
        const totalWarnings = payload.data.reduce((count, file) => {
          return count + file.diagnostics.filter(d => d.severity === 1).length;
        }, 0);
        
        notifications.show({
          title: 'Diagnostics Received',
          message: `${totalDiagnostics} issues (${totalErrors} errors, ${totalWarnings} warnings) across ${totalFiles} files`,
          color: totalErrors > 0 ? 'red' : totalWarnings > 0 ? 'yellow' : 'blue',
        });
      }
    });
  
    // Clean up listener when component unmounts
    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Function to manually request diagnostics
  const requestDiagnostics = async () => {
    if (!isServerRunning) {
      notifications.show({
        title: 'Error',
        message: 'WebSocket server is not running. Please start the server first.',
        color: 'red'
      });
      return;
    }
    
    setLoading(true);
    try {
      // Send message to VS Code to request diagnostics
      await core.invoke('send_chat_to_vscode', { 
        message: JSON.stringify({ type: 'requestDiagnostics' })
      });
      
      notifications.show({
        title: 'Request Sent',
        message: 'Diagnostics request sent to VS Code',
        color: 'blue'
      });
    } catch (error: any) {
      console.error('Error requesting diagnostics:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to request diagnostics: ${error.toString()}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter diagnostics based on user input
  const filteredDiagnostics = diagnostics.filter(fileDiag => {
    // Filter by filename
    if (filter && !fileDiag.file.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    
    // Filter by severity
    if (severityFilter !== -1) {
      return fileDiag.diagnostics.some(diag => diag.severity === severityFilter);
    }
    
    return true;
  });

  // Get severity string representation
  const getSeverityText = (severity: number): string => {
    switch (severity) {
      case 0: return 'Error';
      case 1: return 'Warning';
      case 2: return 'Information';
      case 3: return 'Hint';
      default: return 'Unknown';
    }
  };

  // Get severity color for badges
  const getSeverityColor = (severity: number): string => {
    switch (severity) {
      case 0: return 'red';
      case 1: return 'yellow';
      case 2: return 'blue';
      case 3: return 'gray';
      default: return 'gray';
    }
  };

  // Clear diagnostics
  const clearDiagnostics = () => {
    setDiagnostics([]);
    setError(null);
  };

  // Get file name from full path
  const getFileName = (filePath: string): string => {
    return filePath.split(/[\/\\]/).pop() || filePath;
  };

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" className="border-b">
        <Group justify="apart">
          <Group>
            <FileText size={20} />
            <Text size="xl" fw={700}>VS Code Diagnostics</Text>
          </Group>
          <Group>
            <Badge 
              color={isServerRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {isServerRunning ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge 
              color="blue"
              variant="outline"
            >
              {diagnostics.length > 0 
                ? `${diagnostics.reduce((sum, file) => sum + file.diagnostics.length, 0)} issues` 
                : 'No issues'}
            </Badge>
          </Group>
        </Group>
      </Card.Section>
      
      <Stack gap="md" mt="md">
        {error && (
          <Alert color="red" title="Error" icon={<AlertCircle size={16} />} withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        <Group justify="apart">
          <TextInput
            placeholder="Filter by filename..."
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            rightSection={<Search size={16} />}
            style={{ flexGrow: 1 }}
          />
          
          <Select
            placeholder="Filter by severity"
            value={severityFilter.toString()}
            onChange={(value) => setSeverityFilter(parseInt(value || '-1'))}
            data={[
              { value: '-1', label: 'All Severities' },
              { value: '0', label: 'Errors Only' },
              { value: '1', label: 'Warnings Only' },
              { value: '2', label: 'Info Only' },
              { value: '3', label: 'Hints Only' }
            ]}
            style={{ width: 150 }}
          />
          
          <Button
            onClick={requestDiagnostics}
            loading={loading}
            disabled={!isServerRunning}
            leftSection={<RefreshCw size={14} />}
          >
            Refresh Diagnostics
          </Button>
          
          <Button
            variant="subtle"
            color="gray"
            onClick={clearDiagnostics}
            leftSection={<X size={14} />}
          >
            Clear
          </Button>
        </Group>
        
        <ScrollArea style={{ height: 'calc(100vh - 250px)' }}>
          {filteredDiagnostics.length === 0 ? (
            <Alert
              color="blue"
              title={diagnostics.length === 0
                ? "No Diagnostics Available"
                : "No Matching Diagnostics"}
              icon={<AlertCircle size={16} />}
            >
              {diagnostics.length === 0
                ? "No diagnostics information available from VS Code. Click 'Refresh Diagnostics' to request the latest diagnostics."
                : "No diagnostics match your current filter criteria."}
            </Alert>
          ) : (
            <Accordion>
              {filteredDiagnostics.map((fileDiag, fileIndex) => (
                <Accordion.Item 
                  key={fileIndex} 
                  value={fileDiag.file}
                >
                  <Accordion.Control>
                    <Group>
                      <Text>{getFileName(fileDiag.file)}</Text>
                      <Badge color={
                        fileDiag.diagnostics.some(d => d.severity === 0) ? 'red' :
                        fileDiag.diagnostics.some(d => d.severity === 1) ? 'yellow' : 'blue'
                      }>
                        {fileDiag.diagnostics.length} issue{fileDiag.diagnostics.length !== 1 ? 's' : ''}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      <Text size="xs" color="dimmed">{fileDiag.file}</Text>
                      {fileDiag.diagnostics.map((diag, diagIndex) => (
                        <Card 
                          key={diagIndex} 
                          withBorder 
                          p="xs"
                          style={{ 
                            borderLeft: `4px solid ${
                              diag.severity === 0 ? 'red' :
                              diag.severity === 1 ? 'orange' :
                              diag.severity === 2 ? 'blue' : 'gray'
                            }`
                          }}
                        >
                          <Group justify="apart">
                            <Badge color={getSeverityColor(diag.severity)}>
                              {getSeverityText(diag.severity)}
                            </Badge>
                            <Text size="xs" color="dimmed">
                              Line {diag.range.start.line + 1}, Col {diag.range.start.character + 1}
                            </Text>
                          </Group>
                          <Text mt="xs">{diag.message}</Text>
                          {diag.source && (
                            <Text size="xs" color="dimmed" mt="xs">Source: {diag.source}</Text>
                          )}
                          {diag.code && (
                            <Text size="xs" color="dimmed">
                              Code: {typeof diag.code === 'string' ? diag.code : diag.code.value}
                            </Text>
                          )}
                        </Card>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </ScrollArea>
      </Stack>
    </Card>
  );
};

export default VSCodeDiagnosticsPanel;