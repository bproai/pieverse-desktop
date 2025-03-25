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
  Image
} from '@mantine/core';
import { Search, Plus, Trash, ExternalLink, Edit, Save, X, FileText, Image as ImageIcon, Link, Code, FileQuestion } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

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
      // Call the Tauri backend to load references from storage
      const result = await core.invoke('load_references');
      
      // If result is valid, use it
      if (result && Array.isArray(result)) {
        // Transform snake_case to camelCase if needed
        const formattedReferences = result.map(ref => ({
          id: ref.id,
          title: ref.title,
          type: ref.type,
          url: ref.url || '',
          content: ref.content || '',
          tags: ref.tags,
          dateAdded: ref.date_added, // Convert from snake_case to camelCase
          imageData: ref.image_data  // Convert from snake_case to camelCase
        }));
        
        console.log('Loaded references:', formattedReferences);
        setReferences(formattedReferences);
      } else {
        // If no valid result, use empty array
        console.warn('No valid references found, using empty array');
        setReferences([]);
      }
    } catch (error) {
      console.error('Failed to load references:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load references',
        color: 'red',
      });
      
      // In case of error, use empty array
      setReferences([]);
    }
  };
  
  const saveReferences = async (updatedReferences: ReferenceItem[]) => {
    try {
      // Transform the references to match the backend expected format
      const formattedReferences = updatedReferences.map(ref => ({
        id: ref.id,
        title: ref.title,
        type: ref.type,
        url: ref.url,
        content: ref.content,
        tags: ref.tags,
        date_added: ref.dateAdded,
        image_data: ref.imageData
      }));
      
      // Debug log
      console.log('Saving references:', formattedReferences);
      
      // Call the Tauri command to save references
      await core.invoke('save_references', { references: formattedReferences });
      console.log('References saved successfully');
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
    if (tagInput) {
      // Split the input by commas and filter out empty strings
      const tagsToAdd = tagInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag !== '');
      
      // Create a Set from existing tags for efficient deduplication
      const existingTagsSet = new Set(newReference.tags);
      
      // Filter out duplicates
      const newTags = tagsToAdd.filter(tag => !existingTagsSet.has(tag));
      
      // Only update if we have new tags to add
      if (newTags.length > 0) {
        setNewReference({
          ...newReference,
          tags: [...newReference.tags, ...newTags],
        });
      }
      
      // Clear the input field
      setTagInput('');
    }
  };
  
  const removeTag = (tag: string) => {
    setNewReference({
      ...newReference,
      tags: newReference.tags.filter(t => t !== tag),
    });
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
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
  
  // Use the existing dark mode class from the document body
  const getTypeIcon = (type: ReferenceType) => {
    // Check if dark mode is active using the existing class on the body
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    // If in dark mode, use a brighter color
    const iconColor = isDarkMode ? "#ffffff" : undefined;
    
    switch (type) {
      case 'documentation':
        return <FileText size={16} color={iconColor} />;
      case 'image':
        return <ImageIcon size={16} color={iconColor} />;
      case 'url':
        return <Link size={16} color={iconColor} />;
      case 'code':
        return <Code size={16} color={iconColor} />;
      default:
        return <FileQuestion size={16} color={iconColor} />;
    }
  };
  
  return (
    <div className="space-y-4">
      <Group justify="space-between">
        <Text size="xl" fw={700}>Knowledge Base References</Text>
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
          leftSection={<Search size={16} />}
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
            <Group justify="space-between">
              <Text fw={500}>
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
              <Text size="sm" fw={500} mb={5}>Tags</Text>
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
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
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
            
            <Group justify="flex-end" mt={20}>
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
            <Text c="dimmed" ta="center" mt={20}>
              No references found. Add some or change your search criteria.
            </Text>
          ) : (
            <div className="space-y-3">
              {filteredReferences.map(reference => (
                <Card key={reference.id} shadow="sm" p="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Group>
                      {getTypeIcon(reference.type)}
                      <Text fw={500}>{reference.title}</Text>
                    </Group>
                    <Group gap={8}>
                      {reference.url && (
                        <ActionIcon title="Open URL" onClick={() => handleOpenUrl(reference.url || '')}>
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
                    <Text size="sm" c="dimmed" mb="md">
                      {reference.content}
                    </Text>
                  )}
                  
                  <Group justify="space-between">
                    <Group gap={5}>
                      {reference.tags.map(tag => (
                        <Badge key={tag} size="sm">{tag}</Badge>
                      ))}
                    </Group>
                    <Text size="xs" c="dimmed">
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
                    <div className="h-[100px] flex items-center justify-center bg-gray-100">
                      {getTypeIcon(reference.type)}
                    </div>
                  )}
                </Card.Section>
                
                <Text fw={500} mt="md" mb="xs">
                  {reference.title}
                </Text>
                
                <Group justify="space-between" mt="md">
                  <Group gap={5}>
                    {reference.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} size="sm">{tag}</Badge>
                    ))}
                    {reference.tags.length > 2 && (
                      <Badge size="sm">+{reference.tags.length - 2}</Badge>
                    )}
                  </Group>
                  <Group gap={8}>
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