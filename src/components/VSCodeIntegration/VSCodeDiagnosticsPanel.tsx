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
  Code,
  List,
  ThemeIcon,
  Tooltip
} from '@mantine/core';
import { AlertCircle, Search, RefreshCw, FileText, X, ExternalLink, Link as LinkIcon, Tag, Info, Code2 } from 'lucide-react';
import { notifications } from '@mantine/notifications';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';

// Enhanced DiagnosticItem interface with additional VS Code fields
interface DiagnosticItem {
  severity: number;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string | { value: string; target: string };
  source?: string;
  // Additional fields from VS Code DiagnosticItem
  tags?: number[];  // DiagnosticTag values (1 = Unnecessary, 2 = Deprecated)
  relatedInformation?: {
    message: string;
    location: {
      uri: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
  }[];
  codeActions?: {
    title: string;
    kind?: string;
    isPreferred?: boolean;
    command?: {
      title: string;
      command: string;
      arguments?: any[];
    };
  }[];
  documentation?: string | {
    value: string;
    isTrusted: boolean;
    supportHtml?: boolean;
  };
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
  const [tagFilter, setTagFilter] = useState<number>(-1); // -1 = all, 1 = Unnecessary, 2 = Deprecated
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which position in the cyclical queue we're at
  const [openFileIndex, setOpenFileIndex] = useState(0);

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
  
  // Function to apply a code action if available
  const applyCodeAction = async (filePath: string, codeAction: any) => {
    if (!isServerRunning || !codeAction) {
      return;
    }
    
    try {
      await core.invoke('send_chat_to_vscode', { 
        message: JSON.stringify({ 
          type: 'applyCodeAction',
          file: filePath,
          codeAction: codeAction 
        })
      });
      
      notifications.show({
        title: 'Code Action',
        message: `Applying: ${codeAction.title}`,
        color: 'blue'
      });
      
      // Request fresh diagnostics after applying fix
      setTimeout(() => requestDiagnostics(), 1000);
    } catch (error: any) {
      console.error('Error applying code action:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to apply code action: ${error.toString()}`,
        color: 'red'
      });
    }
  };

  // Function to open a file in VS Code with position information
  const openFileInVSCode = async (filePath: string, line: number, character: number) => {
    if (!isServerRunning) {
      notifications.show({
        title: 'Error',
        message: 'WebSocket server is not running. Please start the server first.',
        color: 'red'
      });
      return;
    }
    
    try {
      // Determine the view column (first, second, etc.) based on the cyclical queue
      // viewColumn: 1 = first column, 2 = second column, etc.
      const viewColumn = (openFileIndex % 2) + 1; // Alternates between 1 and 2
      
      // Increment the open file index for the next file
      setOpenFileIndex(prevIndex => prevIndex + 1);
      
      // Send message to VS Code to open the file
      // The VS Code extension will receive this message and open the file in the appropriate column
      await core.invoke('send_open_file_to_vscode', { 
        openFileRequest: {
          type: 'openFile',
          file: filePath,
          line: line,
          character: character,
          view_column: viewColumn
        }
      });
      
      notifications.show({
        title: 'File Opened',
        message: `Opened ${getFileName(filePath)} in VS Code (${viewColumn === 1 ? 'left' : 'right'} pane)`,
        color: 'blue'
      });
    } catch (error: any) {
      console.error('Error opening file:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to open file: ${error.toString()}`,
        color: 'red'
      });
    }
  };

  // Function to open related information file
  const openRelatedFile = async (uri: string, line: number, character: number) => {
    if (!isServerRunning) {
      return;
    }
    
    try {
      // For related info, always open in the other column
      const viewColumn = ((openFileIndex + 1) % 2) + 1;
      
      // Fix URI format - if it's already a file:// URI, convert it to a proper path
      let filePath = uri;
      if (uri.startsWith('file:')) {
        // Remove file:// prefix and convert to filesystem path
        filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
      }
      
      await core.invoke('send_open_file_to_vscode', { 
        openFileRequest: {
          type: 'openFile',
          file: filePath,
          line: line,
          character: character,
          view_column: viewColumn
        }
      });
    } catch (error: any) {
      console.error('Error opening related file:', error);
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
    
    // Filter by tag
    if (tagFilter !== -1) {
      return fileDiag.diagnostics.some(diag => 
        diag.tags && diag.tags.includes(tagFilter)
      );
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
  
  // Get tag text representation
  const getTagText = (tag: number): string => {
    switch (tag) {
      case 1: return 'Unnecessary';
      case 2: return 'Deprecated';
      default: return `Tag ${tag}`;
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

  // Render the documentation content
  const renderDocumentation = (doc: string | { value: string; isTrusted: boolean; supportHtml?: boolean }) => {
    if (typeof doc === 'string') {
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{doc}</Text>;
    } else {
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{doc.value}</Text>;
    }
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
        
        <Group align="flex-end">
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
          
          <Select
            placeholder="Filter by tag"
            value={tagFilter.toString()}
            onChange={(value) => setTagFilter(parseInt(value || '-1'))}
            data={[
              { value: '-1', label: 'All Tags' },
              { value: '1', label: 'Unnecessary' },
              { value: '2', label: 'Deprecated' }
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
                            <Group>
                              <Badge color={getSeverityColor(diag.severity)}>
                                {getSeverityText(diag.severity)}
                              </Badge>
                              {diag.tags && diag.tags.map((tag, tagIndex) => (
                                <Badge key={tagIndex} color="violet" leftSection={<Tag size={12} />}>
                                  {getTagText(tag)}
                                </Badge>
                              ))}
                            </Group>
                            <Group>
                              <Text size="xs" color="dimmed">
                                Line {diag.range.start.line + 1}, Col {diag.range.start.character + 1}
                              </Text>
                              <Tooltip label="Open file at location">
                                <Button 
                                  variant="subtle" 
                                  size="xs" 
                                  p={4} 
                                  onClick={() => openFileInVSCode(
                                    fileDiag.file, 
                                    diag.range.start.line, 
                                    diag.range.start.character
                                  )}
                                >
                                  <ExternalLink size={14} />
                                </Button>
                              </Tooltip>
                            </Group>
                          </Group>
                          
                          <Text mt="xs">{diag.message}</Text>
                          
                          {diag.source && (
                            <Group mt="xs">
                              <Badge color="gray" variant="light">Source: {diag.source}</Badge>
                            </Group>
                          )}
                          
                          {diag.code && (
                            <Group mt="xs">
                              <Badge leftSection={<Code2 size={12} />} color="gray" variant="light">
                                Code: {typeof diag.code === 'string' ? diag.code : diag.code.value}
                              </Badge>
                            </Group>
                          )}
                          
                          {/* Documentation section */}
                          {diag.documentation && (
                            <Card mt="xs" withBorder p="xs" bg="gray.0">
                              <Group mb="xs">
                                <Info size={14} />
                                <Text fw={500} size="sm">Documentation</Text>
                              </Group>
                              {renderDocumentation(diag.documentation)}
                            </Card>
                          )}
                          
                          {/* Related information section */}
                          {diag.relatedInformation && diag.relatedInformation.length > 0 && (
                            <Card mt="xs" withBorder p="xs" bg="gray.0">
                              <Group mb="xs">
                                <LinkIcon size={14} />
                                <Text fw={500} size="sm">Related Information</Text>
                              </Group>
                              <List spacing="xs" size="sm">
                                {diag.relatedInformation.map((info, infoIndex) => (
                                  <List.Item 
                                    key={infoIndex}
                                    icon={
                                      <ThemeIcon color="blue" size={20} radius="xl">
                                        <FileText size={12} />
                                      </ThemeIcon>
                                    }
                                  >
                                    <Group>
                                      <Text size="sm">{info.message}</Text>
                                      <Button 
                                        variant="subtle" 
                                        size="xs"
                                        onClick={() => openRelatedFile(
                                          info.location.uri,
                                          info.location.range.start.line,
                                          info.location.range.start.character
                                        )}
                                      >
                                        {getFileName(info.location.uri)}:{info.location.range.start.line + 1}
                                      </Button>
                                    </Group>
                                  </List.Item>
                                ))}
                              </List>
                            </Card>
                          )}
                          
                          {/* Code actions section */}
                          {diag.codeActions && diag.codeActions.length > 0 && (
                            <Card mt="xs" withBorder p="xs" bg="gray.0">
                              <Group mb="xs">
                                <Code2 size={14} />
                                <Text fw={500} size="sm">Quick Fixes</Text>
                              </Group>
                              <Group gap="xs">
                                {diag.codeActions.map((action, actionIndex) => (
                                  <Button 
                                    key={actionIndex}
                                    size="xs"
                                    variant={action.isPreferred ? "filled" : "light"}
                                    onClick={() => applyCodeAction(fileDiag.file, action)}
                                  >
                                    {action.title}
                                  </Button>
                                ))}
                              </Group>
                            </Card>
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