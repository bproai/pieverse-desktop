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
  Select
} from '@mantine/core';
import { 
  ChevronRight, 
  Plus,
  Code,
  Book,
  ChartBar,
  Pencil,
  Trash,
  AlertCircle
} from 'lucide-react';
import { MySQLService } from '../MySQL/MySQLService';
import promptService, { Prompt } from '../../services/MySQLPromptService';

const CATEGORIES = ['WRITING & ANALYSIS', 'FINANCE & MARKETS', 'CODE & DEVELOPMENT'];

const PromptsManager = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const loadData = async () => {
    try {
      const fetchedPrompts = await promptService.getPrompts();
      setPrompts(fetchedPrompts);
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setError('Failed to load prompts. Please try again.');
    }
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPrompt) return;

    try {
      setLoading(true);
      if (editingPrompt.id) {
        await promptService.updatePrompt(editingPrompt.id, editingPrompt);
      } else {
        await promptService.createPrompt(editingPrompt);
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
    if (!window.confirm('Are you sure you want to delete this prompt?')) return;
    
    try {
      setLoading(true);
      await promptService.deletePrompt(prompt.id);
      await loadData();
    } catch (error) {
      console.error('Failed to delete prompt:', error);
      setError('Failed to delete prompt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <Alert 
        icon={<AlertCircle size={16} />}
        title="Error" 
        color="red"
        className="max-w-xl mx-auto mt-8"
      >
        {error}
      </Alert>
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
        <Title order={3}>AI Assistant Playbook</Title>
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
                className="bg-white hover:bg-gray-50 cursor-pointer transition-colors duration-200 group"
                shadow="sm"
                padding="md"
              >
                <Group position="apart">
                  <Group>
                    {getCategoryIcon(category)}
                    <div>
                      <Text size="lg" weight={500}>{prompt.title}</Text>
                      <Text size="sm" color="dimmed">{prompt.description}</Text>
                    </div>
                  </Group>
                  <Group spacing="xs" className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPrompt(prompt);
                        setIsModalOpen(true);
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
                        handleDelete(prompt);
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
              label="Description"
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
              checked={editingPrompt?.is_active || false}
              onChange={(e) => setEditingPrompt(prev => 
                prev ? { ...prev, is_active: e.currentTarget.checked } : null
              )}
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
    </div>
  );
};

export default PromptsManager;