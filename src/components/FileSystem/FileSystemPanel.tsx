// src/components/FileSystem/FileSystemPanel.tsx
import React, { useState } from 'react';
import { 
  Card, 
  Text, 
  Tabs, 
  Group,
  Stack,
  Divider
} from '@mantine/core';
import { Folder, FileText, Settings, FolderTree } from 'lucide-react';

import FileOperations from './FileOperations';
import FileSelector from './FileSelector';

// Import the project structure component if you have one
// import FolderStructurePanel from '../FolderStructure/FolderStructurePanel';

/**
 * This component serves as a container for all file system operations
 * in your application. It provides a tabbed interface to access different
 * file system features.
 */
const FileSystemPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('operations');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  
  return (
    <Card shadow="sm" p={0} radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card.Section p="md" withBorder>
        <Group position="apart">
          <Text size="xl" weight={700}>File System</Text>
        </Group>
      </Card.Section>
      
      <Tabs value={activeTab} onChange={setActiveTab} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Tabs.List>
            <Tabs.Tab value="operations" icon={<FileText size={16} />}>
                File Operations
            </Tabs.Tab>
            <Tabs.Tab value="quick-access" icon={<Folder size={16} />}>
                Quick Access
            </Tabs.Tab>
            <Tabs.Tab value="structure" icon={<FolderTree size={16} />}>
                Project Structure
            </Tabs.Tab>
          </Tabs.List>
        
        <Tabs.Panel value="operations" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <FileOperations />
        </Tabs.Panel>
        
        <Tabs.Panel value="quick-access" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <Stack spacing="lg">
            <Card withBorder p="md">
              <Text weight={600} mb="md">Open File</Text>
              <FileSelector
                mode="open"
                value={selectedFile}
                onChange={setSelectedFile}
                onFileContent={setFileContent}
                label="Select a file to open"
                filters={[
                  { name: 'Text Files', extensions: ['txt', 'md', 'json'] },
                  { name: 'Source Code', extensions: ['js', 'ts', 'py', 'html', 'css'] },
                  { name: 'All Files', extensions: ['*'] }
                ]}
              />
              
              {fileContent && (
                <>
                  <Divider my="md" />
                  <Text weight={600} mb="xs">File Content</Text>
                  <Card withBorder p="xs" style={{ 
                    maxHeight: '200px', 
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {fileContent}
                  </Card>
                </>
              )}
            </Card>
            
            <Card withBorder p="md">
              <Text weight={600} mb="md">Save File</Text>
              <Stack spacing="md">
                <FileSelector
                  mode="save"
                  value={selectedFile}
                  onChange={setSelectedFile}
                  label="Select a destination to save"
                  content={fileContent}
                  filters={[
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'Markdown', extensions: ['md'] },
                    { name: 'JSON', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                  ]}
                  showSaveButton
                />
              </Stack>
            </Card>
            
            <Card withBorder p="md">
              <Text weight={600} mb="md">Select Directory</Text>
              <FileSelector
                mode="directory"
                value={selectedFile}
                onChange={setSelectedFile}
                label="Select a directory"
              />
            </Card>
            
            <Card withBorder p="md">
              <Text weight={600} mb="md">Compact File Selectors</Text>
              <Stack spacing="md">
                <Group align="center" style={{ gap: '8px' }}>
                  <Text size="sm" style={{ width: '80px' }}>Open File:</Text>
                  <FileSelector
                    mode="open"
                    value={selectedFile}
                    onChange={setSelectedFile}
                    onFileContent={setFileContent}
                    compact
                    showOpenButton
                  />
                </Group>
                
                <Group align="center" style={{ gap: '8px' }}>
                  <Text size="sm" style={{ width: '80px' }}>Save File:</Text>
                  <FileSelector
                    mode="save"
                    value={selectedFile}
                    onChange={setSelectedFile}
                    content={fileContent}
                    compact
                    showSaveButton
                  />
                </Group>
                
                <Group align="center" style={{ gap: '8px' }}>
                  <Text size="sm" style={{ width: '80px' }}>Directory:</Text>
                  <FileSelector
                    mode="directory"
                    value={selectedFile}
                    onChange={setSelectedFile}
                    compact
                  />
                </Group>
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>
        
        <Tabs.Panel value="structure" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* 
            If you have your own FolderStructurePanel component, uncomment this:
            <FolderStructurePanel />
            
            Or show a message:
          */}
          <Card withBorder p="md">
            <Text align="center">
              Your project structure explorer is available in the FolderStructurePanel component.
            </Text>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
};

export default FileSystemPanel;