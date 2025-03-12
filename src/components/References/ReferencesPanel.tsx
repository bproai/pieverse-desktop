// src/components/References/ReferencesPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  TextInput, 
  Button, 
  Card, 
  Text, 
  Group, 
  Badge, 
  ActionIcon, 
  Select, 
  Textarea,
  Tabs,
  Image,
  Box,
  Paper
} from '@mantine/core';
import { Search, Plus, Trash, ExternalLink, Edit, Save, X, FileText, Image as ImageIcon, Link, Code, FileQuestion } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';

// Define types for reference items
type ReferenceType = 'documentation' | 'image' | 'url' | 'code' | 'other';

interface ReferenceItem {
  id: string;
  title: string;
  type: ReferenceType;
  url?: string;
  content?: string;
  tags: string[];
  dateAdded: string;
  imageData?: string;
}

const ReferencesPanel: React.FC = () => {
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New reference form state
  const [newReference, setNewReference] = useState<Omit<ReferenceItem, 'id' | 'dateAdded'>>({
    title: '',
    type: 'documentation',
    url: '',
    content: '',
    tags: [],
  });
  
  // Tag input state
  const [tagInput, setTagInput] = useState('');
  
  useEffect(() => {
    // Load references from storage
    loadReferences();
  }, []);
  
  const loadReferences = async () => {
    try {
      // In a real implementation, this would call a Tauri command to load from local storage
      // For now, we'll use mock data
      const mockReferences: ReferenceItem[] = [
        {
          id: '1',
          title: 'Tauri Dialog API',
          type: 'documentation',
          url: 'https://v2.tauri.app/plugin/dialog/',
          content: 'The Tauri Dialog API allows creating native dialogs for file selection, alerts, and confirmations.',
          tags: ['tauri', 'dialog', 'api'],
          dateAdded: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'React Hooks Reference',
          type: 'documentation',
          url: 'https://react.dev/reference/react',
          content: 'Complete reference for React Hooks including useState, useEffect, and more.',
          tags: ['react', 'hooks', 'frontend'],
          dateAdded: new Date().toISOString(),
        },
        {
          id: '3',
          title: 'Mantine UI Components',
          type: 'url',
          url: 'https://mantine.dev/core/button/',
          content: 'Documentation for Mantine UI library components.',
          tags: ['mantine', 'ui', 'components'],
          dateAdded: new Date().toISOString(),
        }
      ];
      
      setReferences(mockReferences);
      
      // In the real implementation:
      // const storedReferences = await invoke('load_references');
      // setReferences(JSON.parse(storedReferences));
    } catch (error) {
      console.error('Failed to load references:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load references',
        color: 'red',
      });
    }
  };
  
  const saveReferences = async (updatedReferences: ReferenceItem[]) => {
    try {
      // In a real implementation, save to storage via Tauri
      // await invoke('save_references', { references: JSON.stringify(updatedReferences) });
      console.log('References saved:', updatedReferences);
    } catch (error) {
      console.error('Failed to save references:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save references',
        color: 'red',
      });
    }
  };
  
  const addReference = () => {
    if (!newReference.title) {
      notifications.show({
        title: 'Error',
        message: 'Title is required',
        color: 'red',
      });
      return;
    }
    
    const newItem: ReferenceItem = {
      ...newReference,
      id: Date.now().toString(),
      dateAdded: new Date().toISOString(),
    };
    
    const updatedReferences = [...references, newItem];
    setReferences(updatedReferences);
    saveReferences(updatedReferences);
    
    // Reset form
    setNewReference({
      title: '',
      type: 'documentation',
      url: '',
      content: '',
      tags: [],
    });
    setIsAddingNew(false);
  };
  
  const updateReference = (id: string) => {
    const index = references.findIndex(ref => ref.id === id);
    if (index !== -1) {
      const updatedReferences = [...references];
      updatedReferences[index] = {
        ...newReference,
        id,
        dateAdded: references[index].dateAdded,
      } as ReferenceItem;
      
      setReferences(updatedReferences);
      saveReferences(updatedReferences);
      setEditingId(null);
    }
  };
  
  const deleteReference = (id: string) => {
    const updatedReferences = references.filter(ref => ref.id !== id);
    setReferences(updatedReferences);
    saveReferences(updatedReferences);
  };
  
  const startEditing = (id: string) => {
    const reference = references.find(ref => ref.id === id);
    if (reference) {
      setNewReference({
        title: reference.title,
        type: reference.type,
        url: reference.url || '',
        content: reference.content || '',
        tags: [...reference.tags],
      });
      setEditingId(id);
    }
  };
  
  const addTag = () => {
    if (tagInput && !newReference.tags.includes(tagInput)) {
      setNewReference({
        ...newReference,
        tags: [...newReference.tags, tagInput],
      });
      setTagInput('');
    }
  };
  
  const removeTag = (tag: string) => {
    setNewReference({
      ...newReference,
      tags: newReference.tags.filter(t => t !== tag),
    });
  };
  
  const openUrl = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to open URL',
        color: 'red',
      });
    }
  };
  
  // Filter references based on search query and type
  const filteredReferences = references.filter(ref => {
    const matchesSearch = 
      ref.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = !filterType || ref.type === filterType;
    
    return matchesSearch && matchesType;
  });
  
  // Helper to get icon based on type
  const getTypeIcon = (type: ReferenceType) => {
    switch (type) {
      case 'documentation':
        return <FileText size={16} />;
      case 'image':
        return <ImageIcon size={16} />;
      case 'url':
        return <Link size={16} />;
      case 'code':
        return <Code size={16} />;
      default:
        return <FileQuestion size={16} />;
    }
  };
  
  return (
    <div className="space-y-4">
      <Group position="apart">
        <Text size="xl" weight={700}>Knowledge Base References</Text>
        <Button 
          leftSection={<Plus size={16} />} 
          onClick={() => {
            setIsAddingNew(true);
            setEditingId(null);
          }}
        >
          Add Reference
        </Button>
      </Group>
      
      <Group>
        <TextInput
          placeholder="Search references..."
          icon={<Search size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flexGrow: 1 }}
        />
        
        <Select
          placeholder="Filter by type"
          value={filterType}
          onChange={setFilterType}
          clearable
          data={[
            { value: 'documentation', label: 'Documentation' },
            { value: 'image', label: 'Image' },
            { value: 'url', label: 'URL' },
            { value: 'code', label: 'Code' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </Group>
      
      {(isAddingNew || editingId) && (
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Card.Section withBorder p="md">
            <Group position="apart">
              <Text weight={500}>
                {editingId ? 'Edit Reference' : 'Add New Reference'}
              </Text>
              <ActionIcon onClick={() => {
                setIsAddingNew(false);
                setEditingId(null);
              }}>
                <X size={16} />
              </ActionIcon>
            </Group>
          </Card.Section>
          
          <div className="space-y-3 mt-3">
            <TextInput
              label="Title"
              placeholder="Enter title"
              required
              value={newReference.title}
              onChange={(e) => setNewReference({...newReference, title: e.target.value})}
            />
            
            <Select
              label="Type"
              placeholder="Select type"
              required
              value={newReference.type}
              onChange={(value) => setNewReference({...newReference, type: value as ReferenceType})}
              data={[
                { value: 'documentation', label: 'Documentation' },
                { value: 'image', label: 'Image' },
                { value: 'url', label: 'URL' },
                { value: 'code', label: 'Code' },
                { value: 'other', label: 'Other' },
              ]}
            />
            
            {(newReference.type === 'documentation' || newReference.type === 'url') && (
              <TextInput
                label="URL"
                placeholder="Enter URL"
                value={newReference.url || ''}
                onChange={(e) => setNewReference({...newReference, url: e.target.value})}
              />
            )}
            
            <Textarea
              label="Content/Description"
              placeholder="Enter description or content"
              minRows={3}
              value={newReference.content || ''}
              onChange={(e) => setNewReference({...newReference, content: e.target.value})}
            />
            
            <div>
              <Text size="sm" weight={500} mb={5}>Tags</Text>
              <Group>
                <TextInput
                  placeholder="Add tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  style={{ flexGrow: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button onClick={addTag}>Add</Button>
              </Group>
              
              <Group mt={10}>
                {newReference.tags.map(tag => (
                  <Badge 
                    key={tag} 
                    rightSection={
                      <ActionIcon size="xs" onClick={() => removeTag(tag)}>
                        <X size={12} />
                      </ActionIcon>
                    }
                  >
                    {tag}
                  </Badge>
                ))}
              </Group>
            </div>
            
            <Group position="right" mt={20}>
              <Button 
                variant="default" 
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                leftSection={editingId ? <Save size={16} /> : <Plus size={16} />}
                onClick={() => editingId ? updateReference(editingId) : addReference()}
              >
                {editingId ? 'Save Changes' : 'Add Reference'}
              </Button>
            </Group>
          </div>
        </Card>
      )}
      
      {/* Reference list */}
      <Tabs defaultValue="list">
        <Tabs.List>
          <Tabs.Tab value="list" leftSection={<FileText size={16} />}>List View</Tabs.Tab>
          <Tabs.Tab value="grid" leftSection={<ImageIcon size={16} />}>Grid View</Tabs.Tab>
        </Tabs.List>
        
        <Tabs.Panel value="list" pt="md">
          {filteredReferences.length === 0 ? (
            <Text color="dimmed" align="center" mt={20}>
              No references found. Add some or change your search criteria.
            </Text>
          ) : (
            <div className="space-y-3">
              {filteredReferences.map(reference => (
                <Card key={reference.id} shadow="sm" p="lg" radius="md" withBorder>
                  <Group position="apart" mb="xs">
                    <Group>
                      {getTypeIcon(reference.type)}
                      <Text weight={500}>{reference.title}</Text>
                    </Group>
                    <Group spacing={8}>
                      {reference.url && (
                        <ActionIcon title="Open URL" onClick={() => openUrl(reference.url || '')}>
                          <ExternalLink size={18} />
                        </ActionIcon>
                      )}
                      <ActionIcon title="Edit" onClick={() => startEditing(reference.id)}>
                        <Edit size={18} />
                      </ActionIcon>
                      <ActionIcon title="Delete" color="red" onClick={() => deleteReference(reference.id)}>
                        <Trash size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  
                  {reference.content && (
                    <Text size="sm" color="dimmed" mb="md">
                      {reference.content}
                    </Text>
                  )}
                  
                  <Group position="apart">
                    <Group spacing={5}>
                      {reference.tags.map(tag => (
                        <Badge key={tag} size="sm">{tag}</Badge>
                      ))}
                    </Group>
                    <Text size="xs" color="dimmed">
                      {new Date(reference.dateAdded).toLocaleDateString()}
                    </Text>
                  </Group>
                </Card>
              ))}
            </div>
          )}
        </Tabs.Panel>
        
        <Tabs.Panel value="grid" pt="md">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReferences.map(reference => (
              <Card key={reference.id} shadow="sm" p="lg" radius="md" withBorder>
                <Card.Section p="xs">
                  {reference.type === 'image' && reference.imageData ? (
                    <Image src={reference.imageData} height={160} alt={reference.title} />
                  ) : (
                    <Box 
                      sx={(theme) => ({
                        height: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[1],
                      })}
                    >
                      {getTypeIcon(reference.type)}
                    </Box>
                  )}
                </Card.Section>
                
                <Text weight={500} mt="md" mb="xs">
                  {reference.title}
                </Text>
                
                <Group position="apart" mt="md">
                  <Group spacing={5}>
                    {reference.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} size="sm">{tag}</Badge>
                    ))}
                    {reference.tags.length > 2 && (
                      <Badge size="sm">+{reference.tags.length - 2}</Badge>
                    )}
                  </Group>
                  <Group spacing={8}>
                    {reference.url && (
                      <ActionIcon size="sm" onClick={() => openUrl(reference.url || '')}>
                        <ExternalLink size={16} />
                      </ActionIcon>
                    )}
                    <ActionIcon size="sm" onClick={() => startEditing(reference.id)}>
                      <Edit size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

export default ReferencesPanel;