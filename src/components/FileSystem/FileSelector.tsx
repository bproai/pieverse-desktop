// src/components/FileSystem/FileSelector.tsx
import React, { useState } from 'react';
import { 
  Group, 
  TextInput, 
  ActionIcon, 
  Button, 
  Text, 
  Card, 
  Tooltip 
} from '@mantine/core';
import { Folder, FileText, Save, Upload, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';

import FileSystemService, { FileFilter } from '../../services/FileSystemService';

interface FileSelectorProps {
  mode: 'open' | 'save' | 'directory'; // The operation mode
  value: string; // Current path value
  onChange: (path: string) => void; // Handler for path change
  onFileContent?: (content: string) => void; // Handler for file content (when mode is 'open')
  label?: string; // Input label
  placeholder?: string; // Input placeholder
  filters?: FileFilter[]; // File filters for the dialog
  buttonLabel?: string; // Custom button label
  clearable?: boolean; // Whether the input can be cleared
  compact?: boolean; // Whether to use a compact layout (just icon buttons)
  disabled?: boolean; // Whether the component is disabled
  required?: boolean; // Whether the input is required
  content?: string; // Content to save (when mode is 'save')
  autoReadContent?: boolean; // Whether to automatically read file content when selecting a file
  showOpenButton?: boolean; // Whether to show the open button that opens the selected file
  showSaveButton?: boolean; // Whether to show the save button that saves the content to the selected file
  acceptPaths?: boolean; // Whether to accept manually entered paths
}

const FileSelector: React.FC<FileSelectorProps> = ({
  mode = 'open',
  value,
  onChange,
  onFileContent,
  label = mode === 'directory' ? 'Directory' : 'File',
  placeholder = mode === 'directory' ? 'Select a directory...' : 'Select a file...',
  filters = [{ name: 'All Files', extensions: ['*'] }],
  buttonLabel,
  clearable = true,
  compact = false,
  disabled = false,
  required = false,
  content = '',
  autoReadContent = true,
  showOpenButton = false,
  showSaveButton = false,
  acceptPaths = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleBrowse = async () => {
    setIsLoading(true);
    
    try {
      let selectedPath: string | string[] | null = null;
      
      if (mode === 'directory') {
        selectedPath = await FileSystemService.openDirectoryDialog();
      } else if (mode === 'open') {
        selectedPath = await FileSystemService.openFileDialog({ filters });
      } else if (mode === 'save') {
        selectedPath = await FileSystemService.saveFileDialog({ filters });
      }
      
      if (selectedPath && !Array.isArray(selectedPath)) {
        onChange(selectedPath);
        
        // If mode is 'open' and autoReadContent is true, read the file content
        if (mode === 'open' && autoReadContent && onFileContent) {
          const fileContent = await FileSystemService.readTextFile(selectedPath);
          if (fileContent !== null) {
            onFileContent(fileContent);
          }
        }
        
        // If mode is 'save', save the content to the file
        if (mode === 'save' && content) {
          await FileSystemService.writeTextFile(selectedPath, content);
          notifications.show({
            title: 'Success',
            message: `File saved successfully: ${FileSystemService.getBaseName(selectedPath)}`,
            color: 'green',
          });
        }
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to ${mode} file: ${error}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClear = () => {
    onChange('');
    if (onFileContent) {
      onFileContent('');
    }
  };
  
  const handleManualPathChange = (path: string) => {
    if (acceptPaths) {
      onChange(path);
    }
  };
  
  const handleOpenFile = async () => {
    if (!value) return;
    
    setIsLoading(true);
    
    try {
      const fileContent = await FileSystemService.readTextFile(value);
      if (fileContent !== null && onFileContent) {
        onFileContent(fileContent);
        notifications.show({
          title: 'Success',
          message: `File opened successfully: ${FileSystemService.getBaseName(value)}`,
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to open file: ${error}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveFile = async () => {
    if (!value || !content) return;
    
    setIsLoading(true);
    
    try {
      const success = await FileSystemService.writeTextFile(value, content);
      
      if (success) {
        notifications.show({
          title: 'Success',
          message: `File saved successfully: ${FileSystemService.getBaseName(value)}`,
          color: 'green',
        });
      } else {
        throw new Error('Failed to write file');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to save file: ${error}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const getButtonIcon = () => {
    switch (mode) {
      case 'directory':
        return <Folder size={16} />;
      case 'open':
        return <FileText size={16} />;
      case 'save':
        return <Save size={16} />;
      default:
        return <Folder size={16} />;
    }
  };
  
  const getButtonLabel = () => {
    if (buttonLabel) return buttonLabel;
    
    switch (mode) {
      case 'directory':
        return 'Browse';
      case 'open':
        return 'Open';
      case 'save':
        return 'Save';
      default:
        return 'Browse';
    }
  };
  
  if (compact) {
    return (
      <Group spacing="xs">
        <TextInput
          value={value}
          onChange={(e) => handleManualPathChange(e.currentTarget.value)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          style={{ flex: 1 }}
          rightSection={
            clearable && value ? (
              <ActionIcon onClick={handleClear} size="sm" disabled={disabled}>
                <X size={14} />
              </ActionIcon>
            ) : null
          }
        />
        <Tooltip label={getButtonLabel()}>
          <ActionIcon
            color="blue"
            variant="filled"
            onClick={handleBrowse}
            loading={isLoading}
            disabled={disabled}
          >
            {getButtonIcon()}
          </ActionIcon>
        </Tooltip>
        {showOpenButton && mode === 'open' && (
          <Tooltip label="Open File">
            <ActionIcon
              color="green"
              variant="filled"
              onClick={handleOpenFile}
              disabled={disabled || !value}
            >
              <Upload size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        {showSaveButton && (
          <Tooltip label="Save File">
            <ActionIcon
              color="green"
              variant="filled"
              onClick={handleSaveFile}
              disabled={disabled || !value || !content}
            >
              <Save size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    );
  }
  
  return (
    <div>
      {label && <Text size="sm" mb={4}>{label}</Text>}
      <Group spacing="xs">
        <TextInput
          value={value}
          onChange={(e) => handleManualPathChange(e.currentTarget.value)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          style={{ flex: 1 }}
          rightSection={
            clearable && value ? (
              <ActionIcon onClick={handleClear} size="sm" disabled={disabled}>
                <X size={14} />
              </ActionIcon>
            ) : null
          }
        />
        <Button
          leftSection={getButtonIcon()}
          onClick={handleBrowse}
          loading={isLoading}
          disabled={disabled}
        >
          {getButtonLabel()}
        </Button>
        {showOpenButton && mode === 'open' && (
          <Button
            leftSection={<Upload size={16} />}
            color="green"
            onClick={handleOpenFile}
            disabled={disabled || !value}
          >
            Open
          </Button>
        )}
        {showSaveButton && (
          <Button
            leftSection={<Save size={16} />}
            color="green"
            onClick={handleSaveFile}
            disabled={disabled || !value || !content}
          >
            Save
          </Button>
        )}
      </Group>
    </div>
  );
};

export default FileSelector;