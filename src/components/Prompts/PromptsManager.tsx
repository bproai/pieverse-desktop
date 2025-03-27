// src/components/Prompts/PromptsManager.tsx
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Text, 
  Group, 
  Stack,
  Title,
  Button,
  Modal,
  TextInput,
  Textarea,
  NumberInput,
  Switch,
  LoadingOverlay,
  Alert,
  Select,
  Badge,
  ThemeIcon,
  Tooltip,
  ActionIcon
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { 
  ChevronRight, 
  Plus,
  Code,
  Book,
  ChartBar,
  Pencil,
  Trash,
  AlertCircle,
  Upload,
  ArrowLeftRight,
  Download,
  Settings,
  Send,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import WebSocketService, { ClientInfo } from '../../services/WebSocketService';
import { MySQLService } from '../MySQL/MySQLService';
import promptService from '../../services/MySQLPromptService';
import SQLitePromptService from '../../services/SQLitePromptService';
import type { Prompt } from '../../services/MySQLPromptService';
import CategoryManager from './CategoryManager';
import { useCategories } from './categoryHooks';
import { listen } from '@tauri-apps/api/event';
import { ClientSelectItem } from '../APISettings/ClientSelectItem';

interface PromptsManagerProps {
  backend: 'mysql' | 'sqlite';
  onBackendChange: (backend: 'mysql' | 'sqlite') => void;
}

const PromptsManager = ({ backend, onBackendChange }: PromptsManagerProps) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expandedPromptId, setExpandedPromptId] = useState<number | null>(null);
  const [lastHoveredPromptId, setLastHoveredPromptId] = useState<number | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // Client targeting state
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [wsStatus, setWsStatus] = useState('stopped');
  const [clientErrorMessage, setClientErrorMessage] = useState<string | null>(null);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<{prompt: Prompt, opened: boolean}>({
    prompt: null as any,
    opened: false
  });

  // Use the custom categories hook
  const { 
    categories, 
    addCategory, 
    updateCategory, 
    deleteCategory,
    reorderCategories,
    getCategoryIcon,
    reconcileCategories  // Add this line
  } = useCategories(prompts, setPrompts, backend);

  // Get the active service based on backend selection
  const activeService = backend === 'sqlite' ? SQLitePromptService : promptService;
  
  // Get WebSocket service instance
  const wsService = WebSocketService.getInstance();

  useEffect(() => {
    if (backend === 'sqlite') {
      initialize();
    } else {
      const removeListener = MySQLService.addConnectionListener(async (connected) => {
        console.log('MySQL connection status in PromptsManager:', connected);
        setLoading(true);
        try {
          if (connected) {
            await promptService.initializeDatabase();
            await loadData();
            setError(null);
          } else {
            setError('MySQL is not connected. Please connect to MySQL in the MySQL tab first.');
          }
        } catch (error) {
          console.error('Error in PromptsManager:', error);
          setError('Failed to initialize database. Please try again.');
        } finally {
          setLoading(false);
        }
      });
      return () => removeListener();
    }
  }, [backend]);
  
  // Check WebSocket status and load clients
  useEffect(() => {
    // Check the status of the WebSocket server
    setWsStatus(wsService.getStatus());
    
    // Load clients if the WebSocket server is running
    if (wsService.getStatus() === 'running') {
      loadClients();
    }
    
    // Set up a periodic check for WebSocket status and clients
    const intervalId = setInterval(() => {
      const status = wsService.getStatus();
      setWsStatus(status);
      
      if (status === 'running') {
        loadClients();
      } else {
        setClients([]);
        setSelectedClientId(null);
      }
    }, 5000);
  
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  // Listen for client updates
  useEffect(() => {
    // Listen for client updates
    const setupClientListener = async () => {
      const unlisten = await listen('chrome-extension-clients-updated', (event) => {
        const clientsList = event.payload as ClientInfo[];
        setClients(clientsList);
        
        // Check if the currently selected client is still available
        if (selectedClientId) {
          const clientStillExists = clientsList.some(client => client.id === selectedClientId);
          if (!clientStillExists) {
            // Reset selection if the client is no longer available
            setSelectedClientId(null);
            setClientErrorMessage('The selected client has disconnected. Please select another client.');
          }
        }
      });
      
      return unlisten;
    };
    
    const unlistenPromise = setupClientListener();
    
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [selectedClientId]);

  const initialize = async () => {
    try {
      setLoading(true);
      await SQLitePromptService.initializeDatabase();
      await loadData();
      setError(null);
    } catch (error) {
      console.error('Failed to initialize:', error);
      setError('Failed to initialize SQLite database. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const loadClients = async () => {
    try {
      const clientsList = await wsService.getConnectedClients();
      // Filter out any clients with "Chrome Extension" in the title
      const filteredClients = clientsList.filter(client => 
        !client.tab_title?.includes('Chrome Extension')
      );
      setClients(filteredClients);
    } catch (error) {
      console.error('Failed to load clients:', error);
      setClientErrorMessage('Failed to load clients. Please check WebSocket server status.');
    }
  };

  const loadData = async () => {
    try {
      const fetchedPrompts = await activeService.getPrompts();
      const convertedPrompts = fetchedPrompts.map(prompt => ({
        ...prompt,
        is_active: tinyintToBoolean(Number(prompt.is_active))
      }));
      
      setPrompts(convertedPrompts);
      
      // Extract unique categories from prompts
      const promptCategories = Array.from(
        new Set(convertedPrompts.map(prompt => prompt.category))
      );
      
      // Reconcile categories from prompts with our existing list
      reconcileCategories(promptCategories);
      
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setError('Failed to load prompts. Please try again.');
    }
  };

  // Render the category icon based on the configuration from the hook
  const renderCategoryIcon = (categoryName: string) => {
    const iconConfig = getCategoryIcon(categoryName);
    
    if (iconConfig.type === 'icon') {
      // Render predefined icons
      if (iconConfig.name === 'book') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <Book size={20} />
          </ThemeIcon>
        );
      } else if (iconConfig.name === 'chart-bar') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <ChartBar size={20} />
          </ThemeIcon>
        );
      } else if (iconConfig.name === 'code') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <Code size={20} />
          </ThemeIcon>
        );
      }
    } else if (iconConfig.type === 'letter') {
      // Render letter icon for custom categories
      return (
        <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold">
          {iconConfig.letter}
        </div>
      );
    }
    
    return null;
  };

  const handleTransferPrompts = async () => {
    try {
      setLoading(true);
      // Get prompts from current backend
      const sourceService = backend === 'sqlite' ? SQLitePromptService : promptService;
      const targetService = backend === 'sqlite' ? promptService : SQLitePromptService;
      
      // If transferring to MySQL, check connection first
      if (backend === 'sqlite' && !MySQLService.getConnectionStatus()) {
        setError('MySQL is not connected. Please connect to MySQL in the MySQL tab first.');
        return;
      }

      const fetchedPrompts = await sourceService.getPrompts();
      
      // Transfer to other backend
      if (fetchedPrompts.length > 0) {
        await targetService.bulkImport(fetchedPrompts.map(prompt => ({
          title: prompt.title,
          description: prompt.description,
          category: prompt.category,
          display_order: prompt.display_order,
          is_active: prompt.is_active
        })));
        
        // Switch to the other backend
        onBackendChange(backend === 'sqlite' ? 'mysql' : 'sqlite');
      }
    } catch (error) {
      console.error('Failed to transfer prompts:', error);
      setError('Failed to transfer prompts. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleExportPrompts = async () => {
    try {
      // Make sure we have prompts to export
      if (prompts.length === 0) {
        setError('No prompts to export.');
        return;
      }
      
      // Convert prompts to the format needed for export
      const exportData = prompts.map(prompt => ({
        title: prompt.title,
        description: prompt.description,
        category: prompt.category,
        display_order: Number(prompt.display_order),
        is_active: typeof prompt.is_active === 'number' ? tinyintToBoolean(prompt.is_active) : prompt.is_active
      }));
      
      // Create a JSON string with proper formatting
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Use Tauri's saveDialog to get the save path
      const savePath = await saveDialog({
        filters: [{
          name: 'JSON Files',
          extensions: ['json']
        }],
        defaultPath: `prompts_export_${new Date().toISOString().split('T')[0]}.json`,
        title: 'Save Prompts'
      });
      
      // If user selected a path, write the file
      if (savePath) {
        await writeTextFile(savePath, jsonString);
        
        // Show success notification
        notifications.show({
          title: 'Success',
          message: 'Prompts exported successfully',
          color: 'green'
        });
      }
    } catch (error: any) {
      console.error('Failed to export prompts:', error);
      setError('Failed to export prompts. Please try again.');
      
      // Show error notification
      notifications.show({
        title: 'Error',
        message: `Failed to export prompts: ${error.toString()}`,
        color: 'red'
      });
    }
  };

  const tinyintToBoolean = (value: number | null | undefined): boolean => {
    if (typeof value === 'number') {
      return value === 1;
    }
    return false;
  };

  const validatePromptData = (data: any[]): { isValid: boolean; error?: string } => {
    if (!Array.isArray(data)) {
      return { isValid: false, error: 'Input must be a JSON array' };
    }

    const requiredFields = ['title', 'description', 'category', 'display_order', 'is_active'];
    
    for (let i = 0; i < data.length; i++) {
      const prompt = data[i];
      for (const field of requiredFields) {
        if (!(field in prompt)) {
          return { isValid: false, error: `Item ${i + 1} is missing required field: ${field}` };
        }
      }
      
      // Category validation is more flexible now - if a category doesn't exist, we'll add it
      if (typeof prompt.category !== 'string' || prompt.category.trim() === '') {
        return { 
          isValid: false, 
          error: `Item ${i + 1} has invalid category. Must be a non-empty string.` 
        };
      }
      
      if (typeof prompt.title !== 'string' || prompt.title.length === 0) {
        return { isValid: false, error: `Item ${i + 1} has invalid title` };
      }
      if (typeof prompt.description !== 'string') {
        return { isValid: false, error: `Item ${i + 1} has invalid description` };
      }
      if (typeof prompt.display_order !== 'number') {
        return { isValid: false, error: `Item ${i + 1} has invalid display_order` };
      }
      if (typeof prompt.is_active !== 'boolean') {
        return { isValid: false, error: `Item ${i + 1} has invalid is_active value` };
      }
    }

    return { isValid: true };
  };

  const handleBulkImport = async () => {
    setJsonError(null);
    
    try {
      const data = JSON.parse(bulkJson);
      const validation = validatePromptData(data);
      
      if (!validation.isValid) {
        setJsonError(validation.error);
        return;
      }

      // Extract any new categories from the import data
      const newCats = new Set(categories);
      data.forEach((prompt: any) => {
        if (prompt.category && !categories.includes(prompt.category)) {
          newCats.add(prompt.category);
        }
      });
      
      // Update categories list if new ones were found
      if (newCats.size > categories.length) {
        // Since we're using the custom hook now, add each new category
        Array.from(newCats).forEach(cat => {
          if (!categories.includes(cat as string)) {
            addCategory(cat as string);
          }
        });
      }

      setLoading(true);
      const dataWithDummyFields = data.map(prompt => ({...prompt, id: 0, created_at: '', updated_at: ''}));
      await activeService.bulkImport(dataWithDummyFields);
      await loadData();
      setIsBulkImportOpen(false);
      setBulkJson('');
    } catch (error) {
      if (error instanceof SyntaxError) {
        setJsonError('Invalid JSON format');
      } else {
        console.error('Failed to import prompts:', error);
        setError('Failed to import prompts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPrompt) return;

    try {
      setLoading(true);
      if (editingPrompt.id) {
        await activeService.updatePrompt(editingPrompt.id, editingPrompt);
      } else {
        await activeService.createPrompt(editingPrompt);
      }
      await loadData();
      setIsModalOpen(false);
      setEditingPrompt(null);
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setError('Failed to save prompt. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to send a prompt to the selected client
  const sendPromptToClient = async (prompt: Prompt) => {
    if (!selectedClientId) {
      setClientErrorMessage('Please select a client first');
      return;
    }
    
    if (wsStatus !== 'running') {
      setClientErrorMessage('WebSocket server is not running. Please go to API Settings tab and start the server.');
      return;
    }
    
    setClientErrorMessage(null);
    setSendingToClient(true);
    
    try {
      const message = {
        type: 'insertPrompt',
        prompt: prompt.description,
        autoSubmit: true // Automatically submit the prompt
      };
      
      await wsService.sendTargetedMessage(
        message,
        'client', 
        selectedClientId
      );
      
      notifications.show({
        title: 'Success',
        message: `Prompt sent to client successfully`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error sending prompt to client:', error);
      setClientErrorMessage(`Failed to send prompt: ${String(error)}`);
      
      notifications.show({
        title: 'Error',
        message: `Failed to send prompt to client. Please check if the client is still connected.`,
        color: 'red'
      });
    } finally {
      setSendingToClient(false);
    }
  };

  const startNewChat = async () => {
    if (!selectedClientId) {
      setClientErrorMessage('Please select a client first');
      return;
    }
    
    if (wsStatus !== 'running') {
      setClientErrorMessage('WebSocket server is not running. Please go to API Settings tab and start the server.');
      return;
    }
    
    setSendingToClient(true);
    setClientErrorMessage(null);
    
    try {
      // Send the newChat message to the selected client
      await wsService.sendTargetedMessage(
        { type: 'newChat' },
        'client', 
        selectedClientId
      );
      
      notifications.show({
        title: 'Success',
        message: `New conversation started successfully`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error starting new chat:', error);
      setClientErrorMessage(`Failed to start new chat: ${String(error)}`);
      
      notifications.show({
        title: 'Error',
        message: `Failed to start new conversation. Please check if the client is still connected.`,
        color: 'red'
      });
    } finally {
      setSendingToClient(false);
    }
  };

  const handleDelete = async (prompt: Prompt) => {
    try {
      setLoading(true);
      await activeService.deletePrompt(prompt.id);
      await loadData();
      setDeleteConfirmation({ prompt: null as any, opened: false });
    } catch (error) {
      console.error('Failed to delete prompt:', error);
      setError('Failed to delete prompt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (prompt: Prompt) => {
    const convertedPrompt = {
      ...prompt,
      is_active: tinyintToBoolean(Number(prompt.is_active))
    };
    setEditingPrompt(convertedPrompt);
    setIsModalOpen(true);
  };

  const getClientOptions = () => {
    return clients
      .filter(client => client.platform && ['chatgpt', 'claude'].includes(client.platform.toLowerCase()))
      .map(c => {
        // Format text for the label
        let title = c.tab_title || `${c.platform || 'Unknown'}`;
        // Truncate title if it's too long
        if (title.length > 25) {
          title = title.substring(0, 22) + '...';
        }
        
        const hostname = c.tab_url ? new URL(c.tab_url).hostname : '';
        // Compact format: just show the hostname without protocol
        const url = hostname ? ` (${hostname})` : '';
        const active = Date.now() - c.last_active * 1000 < 30000; // Last active within 30 seconds
        
        return {
          value: c.id,
          label: `${title}${url}`,
          description: c.platform,
          active: active,
          platform: c.platform,
          url: c.tab_url,
          favicon: c.favicon
        };
      });
  };

  if (error && backend === 'mysql') {
    return (
      <Stack spacing="md">
        <Alert 
          icon={<AlertCircle size={16} />}
          title="MySQL Connection Error" 
          color="red"
          className="max-w-xl mx-auto mt-8"
        >
          {error}
        </Alert>
        <Button
          variant="light"
          color="blue"
          onClick={() => onBackendChange('sqlite')}
          className="mx-auto"
        >
          Switch to SQLite
        </Button>
      </Stack>
    );
  }

  const promptsByCategory = categories.reduce((acc, category) => {
    acc[category] = prompts.filter(p => p.category === category);
    return acc;
  }, {} as Record<string, Prompt[]>);

  // Check for prompts with categories not in our categories list
  const uncategorizedPrompts = prompts.filter(prompt => !categories.includes(prompt.category));
  if (uncategorizedPrompts.length > 0) {
    // Add any missing categories from prompts
    uncategorizedPrompts.forEach(prompt => {
      if (prompt.category && !categories.includes(prompt.category)) {
        promptsByCategory[prompt.category] = prompts.filter(p => p.category === prompt.category);
      }
    });
  }

  return (
    <div className="relative min-h-[calc(100vh-200px)]">
      <LoadingOverlay visible={loading} overlayBlur={2} />
      
      <Group position="apart" className="mb-6">
        <Group>
          <Title order={3}>Prompt Builder</Title>
          
          {/* Custom SegmentedControl that works in both light and dark mode */}
          <div className="flex p-1 bg-gray-200 dark:bg-gray-800 rounded-md shadow-sm">
            <button 
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                backend === 'sqlite' 
                  ? 'bg-blue-500 text-white shadow-sm' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
              onClick={() => onBackendChange('sqlite')}
            >
              SQLite
            </button>
            <button 
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                backend === 'mysql' 
                  ? 'bg-blue-500 text-white shadow-sm' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
              onClick={() => onBackendChange('mysql')}
            >
              MySQL
            </button>
          </div>
        </Group>
        <Group align="flex-end">
          <Group>
            <Button
              variant="outline"
              leftSection={<Settings size={16} />}
              onClick={() => setIsCategoryModalOpen(true)}
            >
              Manage Categories
            </Button>
            <Button
              variant="outline"
              leftSection={<ArrowLeftRight size={16} />}
              onClick={handleTransferPrompts}
            >
              Transfer to {backend === 'sqlite' ? 'MySQL' : 'SQLite'}
            </Button>
            <Button
              variant="outline"
              leftSection={<Upload size={16} />}
              onClick={() => setIsBulkImportOpen(true)}
            >
              Bulk Import
            </Button>
            <Button
              variant="outline"
              leftSection={<Download size={16} />}
              onClick={handleExportPrompts}
              disabled={prompts.length === 0}
            >
              Export JSON
            </Button>
          </Group>

          <Group spacing="md">
            <Button
              leftSection={<Plus size={16} />}
              onClick={() => {
                setEditingPrompt({
                  id: 0,
                  title: '',
                  description: '',
                  category: categories[0] || '',
                  display_order: 0,
                  is_active: true,
                  created_at: '',
                  updated_at: ''
                });
                setIsModalOpen(true);
              }}
            >
              Add Prompt
            </Button>
            
            {/* Client selection dropdown */}
            <Group spacing="xs" noWrap>
              <Tooltip label="Click to select an AI client" withArrow>
                <Select
                  placeholder="Select AI client..."
                  value={selectedClientId}
                  onChange={setSelectedClientId}
                  data={getClientOptions()}
                  disabled={wsStatus !== 'running' || clients.length === 0}
                  itemComponent={ClientSelectItem}
                  searchable
                  clearable
                  maxDropdownHeight={280}
                  style={{ width: '200px' }}
                />
              </Tooltip>  
              <ActionIcon 
                onClick={loadClients} 
                disabled={wsStatus !== 'running'}
                color={wsStatus === 'running' ? 'blue' : 'red'}
                variant="subtle"
              >
                <RefreshCw size={16} />
              </ActionIcon>

              <Tooltip label="Start new conversation in selected client" withArrow>
                <ActionIcon
                  onClick={startNewChat}
                  disabled={!selectedClientId || wsStatus !== 'running'}
                  color="teal"
                  variant="subtle"
                  title=""
                >
                  <Plus size={16} />
                </ActionIcon>
            </Tooltip>

            </Group>
          </Group>
        </Group>
      </Group>
      
      {/* Show error message if there's a client error */}
      {clientErrorMessage && (
        <Alert color="yellow" className="mb-4" icon={<AlertTriangle size={16} />} withCloseButton onClose={() => setClientErrorMessage(null)}>
          <Text size="sm">{clientErrorMessage}</Text>
          {wsStatus !== 'running' && (
            <Text size="sm" mt="xs">Please go to the API Settings tab and start the WebSocket server to send prompts to clients.</Text>
          )}
        </Alert>
      )}

      {/* Display categories and prompts */}
      {categories.map(category => (
        <div key={category} className="mb-8">
          <Group className="mb-4">
            {renderCategoryIcon(category)}
            <Text size="sm" className="text-gray-500 uppercase tracking-wider font-medium">
              {category}
            </Text>
            <Badge size="sm" color="gray">{promptsByCategory[category]?.length || 0}</Badge>
          </Group>
          <Stack spacing="md">
            {promptsByCategory[category]?.map(prompt => (
              <Card
                key={prompt.id}
                className="bg-white hover:bg-gray-50 transition-colors duration-200 prompt-card"
                shadow="sm"
                padding="md"
                onClick={() => setExpandedPromptId(expandedPromptId === prompt.id ? null : prompt.id)}
                onMouseEnter={() => setLastHoveredPromptId(prompt.id)}
              >
                <Group position="apart" align="flex-start" style={{ width: "100%" }}>
                <Group align="flex-start" style={{ flexGrow: 1, minWidth: 0, flexWrap: 'nowrap' }}>
                    <div style={{ flexShrink: 0 }}>
                      {renderCategoryIcon(category)}
                    </div>
                    <div className="overflow-hidden flex-grow" style={{ minWidth: '50%' }}>
                      <Text size="lg" weight={500}>{prompt.title}</Text>
                      <Text 
                        size="sm" 
                        c="dimmed"
                        className="truncate"
                        style={{ 
                          width: "100%",
                          whiteSpace: (expandedPromptId === prompt.id || lastHoveredPromptId === prompt.id) ? 'normal' : 'nowrap',
                          overflow: (expandedPromptId === prompt.id || lastHoveredPromptId === prompt.id) ? 'visible' : 'hidden',
                          textOverflow: (expandedPromptId === prompt.id || lastHoveredPromptId === prompt.id) ? 'clip' : 'ellipsis'
                        }}
                      >
                        {prompt.description}
                        {prompt.is_active && <span className="ml-2 text-green-500">(Active)</span>}
                      </Text>
                    </div>
                  </Group>
                  <Group spacing="xs" style={{ flexShrink: 0 }}>
                    <Tooltip label="Send to selected client">
                      <Button
                        variant="subtle"
                        color="teal"
                        size="sm"
                        disabled={!selectedClientId || wsStatus !== 'running' || !prompt.is_active}
                        loading={sendingToClient}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendPromptToClient(prompt);
                        }}
                      >
                        <Send size={16} />
                      </Button>
                    </Tooltip>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(prompt);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmation({ prompt, opened: true });
                      }}
                    >
                      <Trash size={16} />
                    </Button>
                    <ChevronRight size={20} className="text-gray-400" />
                  </Group>
                </Group>
              </Card>
            ))}
            {promptsByCategory[category]?.length === 0 && (
              <Text c="dimmed" align="center" italic size="sm">
                No prompts in this category
              </Text>
            )}
          </Stack>
        </div>
      ))}

      {/* Edit Prompt Modal */}
      <Modal
        opened={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPrompt(null);
        }}
        title={editingPrompt?.id ? 'Edit Prompt' : 'New Prompt'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <Stack spacing="md">
            <TextInput
              label="Title"
              required
              value={editingPrompt?.title || ''}
              onChange={(e) => setEditingPrompt(prev => 
                prev ? { ...prev, title: e.target.value } : null
              )}
            />
            
            <Textarea
              label="Prompt"
              required
              autoComplete="off"
              value={editingPrompt?.description || ''}
              onChange={(e) => setEditingPrompt(prev => 
                prev ? { ...prev, description: e.target.value } : null
              )}
            />

            <Select
              label="Category"
              required
              data={categories}
              value={editingPrompt?.category || categories[0]}
              onChange={(value) => setEditingPrompt(prev => 
                prev ? { ...prev, category: value || categories[0] } : null
              )}
            />

            <NumberInput
              label="Display Order"
              value={editingPrompt?.display_order || 0}
              onChange={(value) => setEditingPrompt(prev => 
                prev ? { ...prev, display_order: value || 0 } : null
              )}
            />

            <Switch
              label="Active"
              checked={editingPrompt?.is_active}
              onChange={(event) => {
                // Extract the checked value from the event target
                const isChecked = event.currentTarget.checked;
                console.log("Switch toggled:", isChecked);
                setEditingPrompt(prev => 
                  prev ? { ...prev, is_active: isChecked } : null
                );
              }}
            />
            <Group position="right">
              <Button variant="subtle" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingPrompt?.id ? 'Update' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteConfirmation.opened}
        onClose={() => setDeleteConfirmation({ prompt: null as any, opened: false })}
        title="Delete Prompt"
        size="sm"
      >
        <Stack>
          <Text>Are you sure you want to delete this prompt?</Text>
          <Group position="right">
            <Button
              variant="subtle" 
              onClick={() => setDeleteConfirmation({ prompt: null as any, opened: false })}
            >
              Cancel
            </Button>
            <Button 
              color="red"
              onClick={() => {
                handleDelete(deleteConfirmation.prompt);
                setDeleteConfirmation({ prompt: null as any, opened: false });
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        opened={isBulkImportOpen}
        onClose={() => {
          setIsBulkImportOpen(false);
          setBulkJson('');
          setJsonError(null);
        }}
        title="Bulk Import Prompts"
        size="lg"
      >
        <Stack spacing="md">
          <Text size="sm" c="dimmed">
            Paste your JSON array of prompts. Each prompt should have: title, description, category, display_order, and is_active fields.
          </Text>
          <Text size="sm" c="dimmed">
            Example format:
            <pre className="bg-gray-100 p-2 rounded mt-1 text-xs">
{JSON.stringify([{
  title: "Example Prompt",
  description: "Description here",
  category: "WRITING & ANALYSIS",
  display_order: 0,
  is_active: true
}], null, 2)}
            </pre>
          </Text>
          <Textarea
            placeholder="Paste JSON here..."
            minRows={10}
            value={bulkJson}
            onChange={(e) => setBulkJson(e.target.value)}
            error={jsonError}
          />
          <Group position="right">
            <Button variant="subtle" onClick={() => {
              setIsBulkImportOpen(false);
              setBulkJson('');
              setJsonError(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkImport}
              disabled={!bulkJson.trim()}
            >
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Category Management Modal */}
      <CategoryManager 
        isOpen={isCategoryModalOpen} 
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        promptsByCategory={promptsByCategory}
        onAddCategory={addCategory}
        onUpdateCategory={updateCategory}
        onDeleteCategory={deleteCategory}
        onReorderCategories={reorderCategories}
        getCategoryIcon={getCategoryIcon}
      />
    </div>
  );
};

export default PromptsManager;