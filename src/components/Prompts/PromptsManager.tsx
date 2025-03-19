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
  SegmentedControl
} from '@mantine/core';
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
  ArrowLeftRight
} from 'lucide-react';
import { MySQLService } from '../MySQL/MySQLService';
import promptService from '../../services/MySQLPromptService';
import SQLitePromptService from '../../services/SQLitePromptService';
import type { Prompt } from '../../services/MySQLPromptService';

interface PromptsManagerProps {
  backend: 'mysql' | 'sqlite';
  onBackendChange: (backend: 'mysql' | 'sqlite') => void;
}

const CATEGORIES = ['WRITING & ANALYSIS', 'FINANCE & MARKETS', 'CODE & DEVELOPMENT'];

const PromptsManager = ({ backend, onBackendChange }: PromptsManagerProps) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{prompt: Prompt, opened: boolean}>({
    prompt: null as any,
    opened: false
  });

  // Get the active service based on backend selection
  const activeService = backend === 'sqlite' ? SQLitePromptService : promptService;

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

  const loadData = async () => {
    try {
      const fetchedPrompts = await activeService.getPrompts();
      const convertedPrompts = fetchedPrompts.map(prompt => ({
        ...prompt,
        is_active: tinyintToBoolean(Number(prompt.is_active))
      }));
      setPrompts(convertedPrompts);
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setError('Failed to load prompts. Please try again.');
    }
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
      
      if (!CATEGORIES.includes(prompt.category)) {
        return { 
          isValid: false, 
          error: `Item ${i + 1} has invalid category. Must be one of: ${CATEGORIES.join(', ')}` 
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

      setLoading(true);
      await activeService.bulkImport(data);
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

  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case 'WRITING & ANALYSIS':
        return <Book size={20} className="text-blue-500" />;
      case 'FINANCE & MARKETS':
        return <ChartBar size={20} className="text-green-500" />;
      case 'CODE & DEVELOPMENT':
        return <Code size={20} className="text-purple-500" />;
      default:
        return null;
    }
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

  const promptsByCategory = CATEGORIES.reduce((acc, category) => {
    acc[category] = prompts.filter(p => p.category === category);
    return acc;
  }, {} as Record<string, Prompt[]>);

  return (
    <div className="relative min-h-[calc(100vh-200px)]">
      <LoadingOverlay visible={loading} overlayBlur={2} />
      
      <Group position="apart" className="mb-6">
        <Group>
          <Title order={3}>AI Assistant Playbook</Title>
          
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
        <Group>
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
            leftSection={<Plus size={16} />}
            onClick={() => {
              setEditingPrompt({
                id: 0,
                title: '',
                description: '',
                category: CATEGORIES[0],
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
        </Group>
      </Group>

      {CATEGORIES.map(category => (
        <div key={category} className="mb-8">
          <Group className="mb-4">
            {getCategoryIcon(category)}
            <Text size="sm" className="text-gray-500 uppercase tracking-wider font-medium">
              {category}
            </Text>
          </Group>
          <Stack spacing="md">
            {promptsByCategory[category]?.map(prompt => (
              <Card
                key={prompt.id}
                className="bg-white hover:bg-gray-50 transition-colors duration-200 group"
                shadow="sm"
                padding="md"
                onClick={(e) => e.preventDefault()}
              >
                <Group position="apart">
                  <Group>
                    {getCategoryIcon(category)}
                    <div>
                      <Text size="lg" weight={500}>{prompt.title}</Text>
                      <Text size="sm" color="dimmed">
                        {prompt.description}
                        {prompt.is_active && <span className="ml-2 text-green-500">(Active)</span>}
                      </Text>
                    </div>
                  </Group>
                  <Group spacing="xs" className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
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
                        e.preventDefault();
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
          </Stack>
        </div>
      ))}

      {/* Edit Modal */}
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
              autoCorrect="off"
              autoComplete="off"
              value={editingPrompt?.description || ''}
              onChange={(e) => setEditingPrompt(prev => 
                prev ? { ...prev, description: e.target.value } : null
              )}
            />

            <Select
              label="Category"
              required
              data={CATEGORIES}
              value={editingPrompt?.category || CATEGORIES[0]}
              onChange={(value) => setEditingPrompt(prev => 
                prev ? { ...prev, category: value || CATEGORIES[0] } : null
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
          <Text size="sm" color="dimmed">
            Paste your JSON array of prompts. Each prompt should have: title, description, category, display_order, and is_active fields.
          </Text>
          <Text size="sm" color="dimmed">
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
    </div>
  );
};

export default PromptsManager;