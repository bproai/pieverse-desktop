// src/components/FileSystem/FileOperations.tsx
import React, { useState } from 'react';
import { 
  Button, 
  TextInput, 
  Stack, 
  Group, 
  Card, 
  Text, 
  Tabs, 
  Textarea, 
  Alert, 
  ActionIcon,
  Badge,
  Code,
  ScrollArea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
  FileText, 
  Save, 
  Folder, 
  Copy, 
  Trash, 
  RefreshCw, 
  PenTool, 
  FilePlus, 
  FolderPlus,
  Download,
  Upload,
  AlertCircle,
  Check,
} from 'lucide-react';

import FileSystemService, { FileEntry } from '../../services/FileSystemService';

const FileOperations: React.FC = () => {
  // States for file operations
  const [currentPath, setCurrentPath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [directoryContents, setDirectoryContents] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('read-write');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [destinationPath, setDestinationPath] = useState<string>('');

  // Reset notification states
  const resetNotifications = () => {
    setError(null);
    setSuccess(null);
  };

  // Show notifications based on operation result
  const showOperationResult = (success: boolean, operation: string, details?: string) => {
    if (success) {
      const message = `${operation} successful${details ? `: ${details}` : ''}`;
      setSuccess(message);
      notifications.show({
        title: 'Success',
        message,
        color: 'green',
      });
    } else {
      const message = `${operation} failed${details ? `: ${details}` : ''}`;
      setError(message);
      notifications.show({
        title: 'Error',
        message,
        color: 'red',
      });
    }
  };

  // Handle browse for file
  const handleBrowseFile = async () => {
    resetNotifications();
    setIsLoading(true);
    
    try {
      const result = await FileSystemService.openAndReadFile({
        filters: [
          { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'html', 'css'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Open Text File'
      });
      
      if (result) {
        setCurrentPath(result.path);
        setFileContent(result.content);
        showOperationResult(true, 'File opened', FileSystemService.getBaseName(result.path));
      }
    } catch (error) {
      showOperationResult(false, 'Opening file', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save file
  const handleSaveFile = async () => {
    resetNotifications();
    setIsLoading(true);
    
    try {
      const filePath = await FileSystemService.saveContent(fileContent, {
        defaultPath: currentPath,
        filters: [
          { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'html', 'css'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Save Text File'
      });
      
      if (filePath) {
        setCurrentPath(filePath);
        showOperationResult(true, 'File saved', FileSystemService.getBaseName(filePath));
      }
    } catch (error) {
      showOperationResult(false, 'Saving file', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle browse directory
  const handleBrowseDirectory = async () => {
    resetNotifications();
    setIsLoading(true);
    
    try {
      const dirPath = await FileSystemService.openDirectoryDialog({
        title: 'Select Directory'
      });
      
      if (dirPath && !Array.isArray(dirPath)) {
        setCurrentPath(dirPath);
        await loadDirectoryContents(dirPath);
        showOperationResult(true, 'Directory opened', FileSystemService.getBaseName(dirPath));
      }
    } catch (error) {
      showOperationResult(false, 'Opening directory', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Load directory contents
  const loadDirectoryContents = async (dirPath: string) => {
    setIsLoading(true);
    
    try {
      const contents = await FileSystemService.listDirectory(dirPath);
      setDirectoryContents(contents);
    } catch (error) {
      showOperationResult(false, 'Loading directory contents', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file selection
  const handleSelectFile = async (filePath: string, isDir: boolean) => {
    setSelectedFile(filePath);
    setRenameInput(FileSystemService.getBaseName(filePath));
    
    if (!isDir) {
      setIsLoading(true);
      try {
        const content = await FileSystemService.readTextFile(filePath);
        if (content !== null) {
          setFileContent(content);
          setCurrentPath(filePath);
        }
      } catch (error) {
        showOperationResult(false, 'Reading file', String(error));
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle create new file
  const handleCreateFile = async () => {
    if (!currentPath || !newFileName) return;
    
    resetNotifications();
    setIsLoading(true);
    
    try {
      const newFilePath = `${currentPath}/${newFileName}`;
      const success = await FileSystemService.createFile(newFilePath);
      
      if (success) {
        showOperationResult(true, 'File created', newFileName);
        setNewFileName('');
        // Refresh directory contents
        await loadDirectoryContents(currentPath);
      } else {
        showOperationResult(false, 'Creating file');
      }
    } catch (error) {
      showOperationResult(false, 'Creating file', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle create new folder
  const handleCreateFolder = async () => {
    if (!currentPath || !newFolderName) return;
    
    resetNotifications();
    setIsLoading(true);
    
    try {
      const newFolderPath = `${currentPath}/${newFolderName}`;
      const success = await FileSystemService.createDirectory(newFolderPath);
      
      if (success) {
        showOperationResult(true, 'Folder created', newFolderName);
        setNewFolderName('');
        // Refresh directory contents
        await loadDirectoryContents(currentPath);
      } else {
        showOperationResult(false, 'Creating folder');
      }
    } catch (error) {
      showOperationResult(false, 'Creating folder', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle delete file or folder
  const handleDelete = async () => {
    if (!selectedFile) return;
    
    resetNotifications();
    setIsLoading(true);
    
    try {
      const isDirectory = directoryContents.find(item => item.path === selectedFile)?.isDir || false;
      const confirmed = await FileSystemService.confirmAction(
        `Are you sure you want to delete this ${isDirectory ? 'folder' : 'file'}?${
          isDirectory ? ' All contents will be deleted as well.' : ''
        }`,
        { title: 'Confirm Deletion', type: 'warning' }
      );
      
      if (!confirmed) {
        setIsLoading(false);
        return;
      }
      
      let success = false;
      if (isDirectory) {
        success = await FileSystemService.removeDirectory(selectedFile);
      } else {
        success = await FileSystemService.removeFile(selectedFile);
      }
      
      if (success) {
        showOperationResult(true, `${isDirectory ? 'Folder' : 'File'} deleted`, FileSystemService.getBaseName(selectedFile));
        setSelectedFile(null);
        setRenameInput('');
        
        // Refresh directory contents
        await loadDirectoryContents(currentPath);
        
        // Clear content if the current file was deleted
        if (!isDirectory && selectedFile === currentPath) {
          setCurrentPath('');
          setFileContent('');
        }
      } else {
        showOperationResult(false, `Deleting ${isDirectory ? 'folder' : 'file'}`);
      }
    } catch (error) {
      showOperationResult(false, 'Deleting item', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle rename file or folder
  const handleRename = async () => {
    if (!selectedFile || !renameInput) return;
    
    resetNotifications();
    setIsLoading(true);
    
    try {
      const parentPath = selectedFile.substring(0, selectedFile.lastIndexOf('/'));
      const newPath = `${parentPath}/${renameInput}`;
      
      const success = await FileSystemService.rename(selectedFile, newPath);
      
      if (success) {
        showOperationResult(true, 'Item renamed', renameInput);
        setSelectedFile(newPath);
        
        // Update current path if it was the renamed file
        if (selectedFile === currentPath) {
          setCurrentPath(newPath);
        }
        
        // Refresh directory contents
        await loadDirectoryContents(currentPath);
      } else {
        showOperationResult(false, 'Renaming item');
      }
    } catch (error) {
      showOperationResult(false, 'Renaming item', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copy file
  const handleCopy = async () => {
    if (!selectedFile || !destinationPath) return;
    
    resetNotifications();
    setIsLoading(true);
    
    try {
      const success = await FileSystemService.copyFile(selectedFile, destinationPath);
      
      if (success) {
        showOperationResult(true, 'File copied', `to ${FileSystemService.getBaseName(destinationPath)}`);
        setDestinationPath('');
        
        // Refresh directory contents if destination is in current directory
        const destDir = destinationPath.substring(0, destinationPath.lastIndexOf('/'));
        if (destDir === currentPath) {
          await loadDirectoryContents(currentPath);
        }
      } else {
        showOperationResult(false, 'Copying file');
      }
    } catch (error) {
      showOperationResult(false, 'Copying file', String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copy to clipboard
  const handleCopyToClipboard = async () => {
    if (!fileContent) return;
    
    resetNotifications();
    
    try {
      await navigator.clipboard.writeText(fileContent);
      showOperationResult(true, 'Content copied to clipboard');
    } catch (error) {
      showOperationResult(false, 'Copying to clipboard', String(error));
    }
  };

  // Render directory contents
  const renderDirectoryContents = () => {
    if (!directoryContents.length) {
      return (
        <Text color="dimmed" align="center" mt="md">
          No files or directories found
        </Text>
      );
    }
    
    return (
      <ScrollArea h={300} mt="md">
        {directoryContents.map((item) => (
          <div
            key={item.path}
            onClick={() => handleSelectFile(item.path, item.isDir)}
            style={{
              padding: '8px',
              margin: '4px 0',
              cursor: 'pointer',
              borderRadius: '4px',
              backgroundColor: item.path === selectedFile ? '#f0f9ff' : 'transparent',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {item.isDir ? (
              <Folder size={18} style={{ marginRight: '8px', color: '#3b82f6' }} />
            ) : (
              <FileText size={18} style={{ marginRight: '8px', color: '#64748b' }} />
            )}
            <Text size="sm">{item.name}</Text>
            {item.isDir && (
              <Badge size="xs" ml="auto" color="blue">
                directory
              </Badge>
            )}
          </div>
        ))}
      </ScrollArea>
    );
  };

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" withBorder>
        <Group position="apart">
          <Text size="xl" weight={700}>File System Operations</Text>
        </Group>
      </Card.Section>
      
      {error && (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)} mt="md">
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert color="green" title="Success" withCloseButton onClose={() => setSuccess(null)} mt="md">
          {success}
        </Alert>
      )}
      
      <Tabs value={activeTab} onChange={setActiveTab} mt="md">
        <Tabs.List>
            <Tabs.Tab value="read-write" icon={<FileText size={16} />}>
                Read & Write
            </Tabs.Tab>
            <Tabs.Tab value="directory" icon={<Folder size={16} />}>
                Directory Operations
            </Tabs.Tab>
            <Tabs.Tab value="management" icon={<PenTool size={16} />}>
                File Management
            </Tabs.Tab>
        </Tabs.List>
        
        <Tabs.Panel value="read-write" pt="md">
          <Stack spacing="md">
            <Group grow align="end">
              <TextInput
                label="Current File"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.currentTarget.value)}
                placeholder="No file selected"
                readOnly
              />
              <Button
                leftSection={<FileText size={16} />}
                onClick={handleBrowseFile}
                loading={isLoading}
              >
                Browse
              </Button>
            </Group>
            
            <Textarea
              label="File Content"
              placeholder="File content will appear here..."
              value={fileContent}
              onChange={(e) => setFileContent(e.currentTarget.value)}
              minRows={10}
              autosize
            />
            
            <Group position="apart">
              <Button
                leftSection={<Save size={16} />}
                onClick={handleSaveFile}
                loading={isLoading}
                disabled={!fileContent}
              >
                Save File
              </Button>
              
              <Button
                variant="light"
                leftSection={<Copy size={16} />}
                onClick={handleCopyToClipboard}
                disabled={!fileContent}
              >
                Copy to Clipboard
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
        
        <Tabs.Panel value="directory" pt="md">
          <Stack spacing="md">
            <Group grow align="end">
              <TextInput
                label="Current Directory"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.currentTarget.value)}
                placeholder="No directory selected"
                readOnly
              />
              <Button
                leftSection={<Folder size={16} />}
                onClick={handleBrowseDirectory}
                loading={isLoading}
              >
                Browse
              </Button>
            </Group>
            
            <Group position="apart">
              <Text weight={600}>Directory Contents</Text>
              <Button
                variant="subtle"
                leftSection={<RefreshCw size={16} />}
                onClick={() => currentPath && loadDirectoryContents(currentPath)}
                loading={isLoading}
                disabled={!currentPath}
                size="xs"
              >
                Refresh
              </Button>
            </Group>
            
            {renderDirectoryContents()}
            
            <Group grow align="end">
              <TextInput
                label="New File Name"
                value={newFileName}
                onChange={(e) => setNewFileName(e.currentTarget.value)}
                placeholder="Enter file name"
                disabled={!currentPath}
              />
              <Button
                leftSection={<FilePlus size={16} />}
                onClick={handleCreateFile}
                loading={isLoading}
                disabled={!currentPath || !newFileName}
              >
                Create File
              </Button>
            </Group>
            
            <Group grow align="end">
              <TextInput
                label="New Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.currentTarget.value)}
                placeholder="Enter folder name"
                disabled={!currentPath}
              />
              <Button
                leftSection={<FolderPlus size={16} />}
                onClick={handleCreateFolder}
                loading={isLoading}
                disabled={!currentPath || !newFolderName}
              >
                Create Folder
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
        
        <Tabs.Panel value="management" pt="md">
          <Stack spacing="md">
            <Alert color="blue" title="Selected Item" icon={<AlertCircle size={16} />}>
              {selectedFile ? (
                <Code block>{selectedFile}</Code>
              ) : (
                <Text>No item selected. Select a file or folder from the Directory tab.</Text>
              )}
            </Alert>
            
            <Group grow align="end">
              <TextInput
                label="Rename To"
                value={renameInput}
                onChange={(e) => setRenameInput(e.currentTarget.value)}
                placeholder="New name"
                disabled={!selectedFile}
              />
              <Button
                leftSection={<PenTool size={16} />}
                onClick={handleRename}
                loading={isLoading}
                disabled={!selectedFile || !renameInput}
              >
                Rename
              </Button>
            </Group>
            
            <Group grow align="end">
              <TextInput
                label="Destination Path (for copy)"
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.currentTarget.value)}
                placeholder="Path to copy to"
                disabled={!selectedFile}
              />
              <Button
                leftSection={<Copy size={16} />}
                onClick={handleCopy}
                loading={isLoading}
                disabled={!selectedFile || !destinationPath}
              >
                Copy
              </Button>
            </Group>
            
            <Button
              leftSection={<Trash size={16} />}
              color="red"
              onClick={handleDelete}
              loading={isLoading}
              disabled={!selectedFile}
            >
              Delete Selected Item
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
};

export default FileOperations;