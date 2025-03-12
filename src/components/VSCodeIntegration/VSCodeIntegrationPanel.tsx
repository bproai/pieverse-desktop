// src/components/VSCodeIntegration/VSCodeIntegrationPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  NumberInput,
  Stack, 
  Alert, 
  Badge, 
  Switch,
  Code,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Code as CodeIcon, RefreshCw, CheckCircle } from 'lucide-react';

// Tauri API imports
import { core } from '@tauri-apps/api';

interface VSCodeStatus {
  isRunning: boolean;
  port: number;
}

interface CodeDiffRequest {
  originalFile: string;
  suggestedContent: string;
  description: string;
}

const VSCodeIntegrationPanel: React.FC = () => {
  const [port, setPort] = useState<number>(3001);
  const [status, setStatus] = useState<VSCodeStatus>({ isRunning: false, port: 3001 });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Test diff parameters
  const [originalFile, setOriginalFile] = useState<string>('');
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [description, setDescription] = useState<string>('Suggested change');

  // Fetch current server status
  const fetchStatus = async () => {
    try {
      const [isRunning, currentPort] = await core.invoke('get_vscode_ws_status') as [boolean, number];
      setStatus({ isRunning, port: currentPort });
      if (isRunning) {
        setPort(currentPort);
      }
    } catch (error: any) {
      console.error('Error fetching VS Code connection status:', error);
      setError(error.toString());
    }
  };

  // Load status on component mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Start the WebSocket server
  const startServer = async () => {
    setLoading(true);
    setError(null);
    try {
      const serverPort = await core.invoke('start_vscode_ws_server', { port }) as number;
      notifications.show({
        title: 'Success',
        message: `VS Code WebSocket server started on port ${serverPort}`,
        color: 'green'
      });
      setStatus({ isRunning: true, port: serverPort });
    } catch (error: any) {
      console.error('Error starting VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to start VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Stop the WebSocket server
  const stopServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('stop_vscode_ws_server');
      notifications.show({
        title: 'Success',
        message: 'VS Code WebSocket server stopped',
        color: 'blue'
      });
      setStatus({ ...status, isRunning: false });
    } catch (error: any) {
      console.error('Error stopping VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to stop VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Send a test diff to VS Code
  const sendTestDiff = async () => {
    if (!originalFile) {
      notifications.show({
        title: 'Error',
        message: 'Please enter an original file path',
        color: 'red'
      });
      return;
    }

    if (!suggestedContent) {
      notifications.show({
        title: 'Error',
        message: 'Please enter suggested content',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      const diffRequest: CodeDiffRequest = {
        originalFile,
        suggestedContent,
        description
      };
      
      await core.invoke('send_code_diff_to_vscode', { diffRequest });
      
      notifications.show({
        title: 'Success',
        message: 'Diff sent to VS Code extension',
        color: 'green'
      });
    } catch (error: any) {
      console.error('Error sending diff to VS Code:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to send diff: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vscode-integration-panel">
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Card.Section p="md" className="border-b">
          <Group position="apart">
            <Group>
              <CodeIcon size={20} />
              <Text size="xl" fw={700}>VS Code Integration</Text>
            </Group>
            <Badge 
              color={status.isRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {status.isRunning ? 'Connected' : 'Disconnected'}
            </Badge>
          </Group>
        </Card.Section>
        
        <Stack spacing="md" mt="md">
          <Alert 
            icon={<AlertCircle size={16} />} 
            color="blue" 
            title="VS Code Extension Connection"
          >
            Configure the connection to the VS Code diff-extension. Make sure you have the PieVerse Diff Extension installed in VS Code.
          </Alert>
          
          {error && (
            <Alert color="red" title="Error" icon={<AlertCircle size={16} />}>
              {error}
            </Alert>
          )}
          
          <Group align="end">
            <NumberInput
              label="WebSocket Port"
              description="Port for VS Code extension to connect to"
              value={port}
              onChange={(val) => setPort(val || 3001)}
              min={1024}
              max={65535}
              disabled={status.isRunning}
            />
            
            {!status.isRunning ? (
              <Button 
                onClick={startServer}
                loading={loading}
                leftSection={<RefreshCw size={14} />}
              >
                Start Server
              </Button>
            ) : (
              <Button 
                onClick={stopServer}
                loading={loading}
                color="red"
                leftSection={<AlertCircle size={14} />}
              >
                Stop Server
              </Button>
            )}
            
            <Button 
              variant="outline"
              onClick={fetchStatus}
              leftSection={<RefreshCw size={14} />}
            >
              Refresh Status
            </Button>
          </Group>
          
          {status.isRunning && (
            <Alert 
              icon={<CheckCircle size={16} />} 
              color="green" 
              title="Server Running"
            >
              VS Code server is running on port {status.port}. Connect your VS Code extension to ws://localhost:{status.port}
            </Alert>
          )}
          
          <Card withBorder p="md" mt="md">
            <Text weight={600} mb="md">Test VS Code Diff</Text>
            <Stack spacing="md">
              <TextInput
                label="Original File Path"
                description="Path to the original file that will be modified"
                placeholder="/path/to/your/file.js"
                value={originalFile}
                onChange={(e) => setOriginalFile(e.currentTarget.value)}
              />
              
              <TextInput
                label="Description"
                description="Description of the proposed change"
                placeholder="Refactor function for better performance"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
              />
              
              <Textarea
                label="Suggested Content"
                description="New content to be displayed in the diff view"
                placeholder="// Your suggested code here"
                value={suggestedContent}
                onChange={(e) => setSuggestedContent(e.currentTarget.value)}
                minRows={5}
              />
              
              <Button
                onClick={sendTestDiff}
                loading={loading}
                disabled={!status.isRunning}
              >
                Send Test Diff
              </Button>
            </Stack>
          </Card>
          
          <Card withBorder p="md">
            <Text weight={600} mb="md">VS Code Extension Integration</Text>
            <Text size="sm">
              To use this feature, make sure you have the PieVerse Diff Extension installed in VS Code and 
              that it's configured to connect to the correct WebSocket port.
            </Text>
            
            <Text size="sm" mt="md" fw={600}>
              VS Code Extension Settings:
            </Text>
            <Code block>
              {`{
  "pieverse-diff.websocketUrl": "ws://localhost:${status.port}"
}`}
            </Code>
          </Card>
        </Stack>
      </Card>
    </div>
  );
};

export default VSCodeIntegrationPanel;