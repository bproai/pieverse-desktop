// src/components/LLMRules/LLMRulesPanel.tsx
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
  Paper,
  Switch,
  Accordion,
  ScrollArea,
  Divider,
  Box,
  ColorSwatch,
  Tooltip
} from '@mantine/core';
import { 
  Search, 
  Plus, 
  Trash, 
  Edit, 
  Save, 
  X, 
  Copy, 
  Check, 
  ArrowRight,
  Brain,
  Sparkles, 
  RefreshCw, 
  Download, 
  Upload,
  Terminal
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { core } from '@tauri-apps/api';

// Define types for LLM rules
interface LLMRuleVariable {
  name: string;
  description: string;
  default_value: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[]; // For select type
}

interface LLMRule {
  id: string;
  name: string;
  description: string;
  model: string;
  content: string;
  tags: string[];
  variables: LLMRuleVariable[];
  date_created: string;
  date_modified: string;
  is_system: boolean;
  color: string;
}



// LLM Models data
const llmModels = [
    { value: 'any-model', label: 'Any Model' },
    { value: 'claude-3.7-sonnet', label: 'Claude 3.7 Sonnet' },
    { value: 'gpt-o3-mini-high', label: 'ChatGPT o3-mini-high' }
  ];

// Available colors for rules
const colorOptions = [
  '#228BE6', // Blue
  '#40C057', // Green
  '#FA5252', // Red
  '#7950F2', // Purple
  '#FD7E14', // Orange
  '#12B886', // Teal
  '#E64980', // Pink
  '#4C6EF5', // Indigo
  '#BE4BDB', // Violet
  '#FAB005'  // Yellow
];

const LLMRulesPanel: React.FC = () => {
  // State for rules management
  const [rules, setRules] = useState<LLMRule[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // New rule form state
  const [newRule, setNewRule] = useState<Omit<LLMRule, 'id' | 'date_created' | 'date_modified'>>({
    name: '',
    description: '',
    model: 'Any Model',
    content: '',
    tags: [],
    variables: [],
    is_system: false,
    color: colorOptions[0]
  });
  
  // Variable form state
  const [newVariable, setNewVariable] = useState<LLMRuleVariable>({
    name: '',
    description: '',
    default_value: '',
    type: 'text'
  });
  
  // Tag input state
  const [tagInput, setTagInput] = useState('');
  
  // For preview with variables filled in
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});
  
  useEffect(() => {
    // Load rules
    loadRules();
  }, []);
  
  const loadRules = async () => {
    try {
      // Call the Tauri command to load rules
      const loadedRules = await core.invoke('load_llm_rules');
      setRules(loadedRules as LLMRule[]);
      
      // Select the first rule by default if available
      if (loadedRules && (loadedRules as LLMRule[]).length > 0 && !selectedRuleId) {
        setSelectedRuleId((loadedRules as LLMRule[])[0].id);
      }
    } catch (error) {
      console.error('Failed to load LLM rules:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load LLM rules',
        color: 'red',
      });
    }
  };
  
  const saveRules = async (updatedRules: LLMRule[]) => {
    try {
      // Call the Tauri command to save rules
      await core.invoke('save_llm_rules', { rules: updatedRules });
      console.log('Rules saved successfully');
    } catch (error) {
      console.error('Failed to save rules:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save rules',
        color: 'red',
      });
    }
  };
  
  const addRule = () => {
    if (!newRule.name) {
      notifications.show({
        title: 'Error',
        message: 'Name is required',
        color: 'red',
      });
      return;
    }
    
    const newItem: LLMRule = {
      ...newRule,
      id: Date.now().toString(),
      date_created: new Date().toISOString(),
      date_modified: new Date().toISOString(),
    };
    
    const updatedRules = [...rules, newItem];
    setRules(updatedRules);
    saveRules(updatedRules);
    setSelectedRuleId(newItem.id);
    
    // Reset form
    resetRuleForm();
    setIsAddingNew(false);
  };
  
  const updateRule = (id: string) => {
    const index = rules.findIndex(rule => rule.id === id);
    if (index !== -1) {
      const updatedRules = [...rules];
      updatedRules[index] = {
        ...newRule,
        id,
        date_created: rules[index].date_created,
        date_modified: new Date().toISOString(),
      } as LLMRule;
      
      setRules(updatedRules);
      saveRules(updatedRules);
      setEditingId(null);
      setIsAddingNew(false);
    }
  };
  
  const deleteRule = (id: string) => {
    const updatedRules = rules.filter(rule => rule.id !== id);
    setRules(updatedRules);
    saveRules(updatedRules);
    
    // If the deleted rule was selected, select another one
    if (selectedRuleId === id) {
      setSelectedRuleId(updatedRules.length > 0 ? updatedRules[0].id : null);
    }
  };
  
  const duplicateRule = (id: string) => {
    const ruleToDuplicate = rules.find(rule => rule.id === id);
    if (ruleToDuplicate) {
      const duplicatedRule: LLMRule = {
        ...ruleToDuplicate,
        id: Date.now().toString(),
        name: `${ruleToDuplicate.name} (Copy)`,
        date_created: new Date().toISOString(),
        date_modified: new Date().toISOString(),
        is_system: false, // Always false for duplicated rules
      };
      
      const updatedRules = [...rules, duplicatedRule];
      setRules(updatedRules);
      saveRules(updatedRules);
      
      // Select the new rule
      setSelectedRuleId(duplicatedRule.id);
    }
  };
  
  const startEditing = (id: string) => {
    const rule = rules.find(rule => rule.id === id);
    if (rule) {
      // Set all the fields first
      setNewRule({
        name: rule.name,
        description: rule.description,
        model: rule.model,
        content: rule.content,
        tags: [...rule.tags],
        variables: [...rule.variables],
        // is_system: rule.is_system,
        is_system: false,
        color: rule.color
      });
      
      // Then set editing mode AFTER the form data is ready
      setTimeout(() => {
        setEditingId(id);
        setIsAddingNew(true); // Use the same form for editing
      }, 0);
    }
  };
  
  const addTag = () => {
    if (tagInput && !newRule.tags.includes(tagInput)) {
      setNewRule({
        ...newRule,
        tags: [...newRule.tags, tagInput],
      });
      setTagInput('');
    }
  };
  
  const removeTag = (tag: string) => {
    setNewRule({
      ...newRule,
      tags: newRule.tags.filter(t => t !== tag),
    });
  };
  
  const addVariable = () => {
    if (!newVariable.name) {
      notifications.show({
        title: 'Error',
        message: 'Variable name is required',
        color: 'red',
      });
      return;
    }
    
    // Check if variable already exists
    if (newRule.variables.some(v => v.name === newVariable.name)) {
      notifications.show({
        title: 'Error',
        message: 'Variable with this name already exists',
        color: 'red',
      });
      return;
    }
    
    setNewRule({
      ...newRule,
      variables: [...newRule.variables, { ...newVariable }]
    });
    
    // Reset variable form
    setNewVariable({
      name: '',
      description: '',
      default_value: '',
      type: 'text'
    });
  };
  
  const removeVariable = (name: string) => {
    setNewRule({
      ...newRule,
      variables: newRule.variables.filter(v => v.name !== name)
    });
  };
  
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  
  const startEditingVariable = (variable: LLMRuleVariable) => {
    setNewVariable({...variable});
    setEditingVariable(variable.name);
  };
  
  const updateVariable = () => {
    if (!editingVariable) return;
    
    const updatedVariables = newRule.variables.map(v => 
      v.name === editingVariable ? {...newVariable} : v
    );
    
    setNewRule({
      ...newRule,
      variables: updatedVariables
    });
    
    // Reset variable form
    setNewVariable({
      name: '',
      description: '',
      default_value: '',
      type: 'text'
    });
    setEditingVariable(null);
  };
  
  const cancelEditingVariable = () => {
    setNewVariable({
      name: '',
      description: '',
      default_value: '',
      type: 'text'
    });
    setEditingVariable(null);
  };
  
  const resetRuleForm = () => {
    setNewRule({
      name: '',
      description: '',
      model: 'gpt-4',
      content: '',
      tags: [],
      variables: [],
      is_system: false,
      color: colorOptions[0]
    });
    setNewVariable({
      name: '',
      description: '',
      default_value: '',
      type: 'text'
    });
  };
  
  const handleCancelEditing = () => {
    setIsAddingNew(false);
    setEditingId(null);
    resetRuleForm();
  };
  
  const getFormattedContent = (content: string, variables: Record<string, string> = {}) => {
    let formattedContent = content;
    
    // Replace variables in the format {{variableName}} with their values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formattedContent = formattedContent.replace(regex, value);
    }
    
    return formattedContent;
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        notifications.show({
          title: 'Success',
          message: 'Copied to clipboard',
          color: 'green',
        });
      })
      .catch(err => {
        console.error('Failed to copy to clipboard:', err);
        notifications.show({
          title: 'Error',
          message: 'Failed to copy to clipboard',
          color: 'red',
        });
      });
  };
  
  const exportRules = async () => {
    try {
      // Use Tauri's dialog plugin to show a save dialog
      const { save } = await import('@tauri-apps/plugin-dialog');
      
      const filePath = await save({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        defaultPath: `llm_rules_export_${new Date().toISOString().slice(0, 10)}.json`
      });
      
      if (filePath) {
        // Use Tauri command to export rules to the selected path
        await core.invoke('export_llm_rules', { path: filePath });
        
        notifications.show({
          title: 'Success',
          message: 'Rules exported successfully',
          color: 'green',
        });
      }
    } catch (error) {
      console.error('Failed to export rules:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to export rules',
        color: 'red',
      });
    }
  };
  
  useEffect(() => {
    if (isAddingNew || editingId) {
      // Force a re-render of the form components
      const timer = setTimeout(() => {
        // This state update will trigger a re-render
        setNewRule(prev => ({...prev}));
      }, 10);
      
      return () => clearTimeout(timer);
    }
  }, [isAddingNew, editingId]);
  
  // Prepare variables from the selected rule for preview
  useEffect(() => {
    if (selectedRuleId) {
      const selectedRule = rules.find(rule => rule.id === selectedRuleId);
      if (selectedRule) {
        // Initialize preview variables with default values
        const variables: Record<string, string> = {};
        selectedRule.variables.forEach(v => {
          variables[v.name] = v.default_value;
        });
        setPreviewVariables(variables);
      }
    }
  }, [selectedRuleId, rules]);
  
  // Filter rules based on search query and model filter
  const filteredRules = rules.filter(rule => {
    const matchesSearch = 
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesModel = !filterModel || rule.model === filterModel;
    
    return matchesSearch && matchesModel;
  });

  const importRules = async () => {
    try {
      // Use Tauri's dialog plugin to show an open dialog
      const { open } = await import('@tauri-apps/plugin-dialog');
      
      const filePath = await open({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        multiple: false
      });
      
      if (filePath) {
        try {
          // Use Tauri command to import rules
          await core.invoke('import_llm_rules', { path: filePath });
          
          // Reload rules to display the imported ones
          await loadRules();
          
          notifications.show({
            title: 'Success',
            message: 'Rules imported successfully',
            color: 'green',
          });
        } catch (error) {
          console.error('Import error details:', error);
          let errorMessage = 'Failed to import rules';
          
          // Try to extract more detailed error message if available
          if (typeof error === 'string') {
            errorMessage = error;
          } else if (error && typeof error.message === 'string') {
            errorMessage = error.message;
          }
          
          notifications.show({
            title: 'Error',
            message: errorMessage,
            color: 'red',
          });
        }
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to open file selection dialog',
        color: 'red',
      });
    }
  };
  
  const selectedRule = selectedRuleId 
    ? rules.find(rule => rule.id === selectedRuleId) 
    : null;
  
  return (
    <div className="flex h-full">
      {/* Sidebar with list of rules */}
      <div className="w-1/4 pr-4 border-r" style={{ minWidth: '250px' }}>
        <div className="mb-4">
          <Group justify="space-between">
            <Text size="xl" weight={700}>LLM Rules</Text>
            <Button 
              leftSection={<Plus size={16} />} 
              onClick={() => {
                setIsAddingNew(true);
                setEditingId(null);
                resetRuleForm();
              }}
            >
              New Rule
            </Button>
          </Group>
          
          <Group mt="md">
            <TextInput
              placeholder="Search rules..."
              icon={<Search size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flexGrow: 1 }}
            />
          </Group>
          
          <Select
            placeholder="Filter by model"
            value={filterModel}
            onChange={setFilterModel}
            data={llmModels}
            clearable
            mt="xs"
          />
        </div>
        
        <ScrollArea style={{ height: 'calc(100vh - 250px)' }}>
          {filteredRules.length === 0 ? (
            <Text color="dimmed" align="center" mt={20}>
              No rules found. Add some or change your search criteria.
            </Text>
          ) : (
            <div className="space-y-2">
              {filteredRules.map((rule) => (
                <Card 
                  key={rule.id} 
                  shadow="sm" 
                  p="sm" 
                  radius="md" 
                  withBorder
                  className={`cursor-pointer ${selectedRuleId === rule.id ? 'border-2' : ''}`}
                  style={{ borderColor: selectedRuleId === rule.id ? rule.color : '' }}
                  onClick={() => setSelectedRuleId(rule.id)}
                >
                  <Group position="apart" mb="xs">
                    <div className="flex items-center">
                      <ColorSwatch color={rule.color} size={16} mr={8} />
                      <Text weight={500}>{rule.name}</Text>
                    </div>
                    {rule.is_system && (
                      <Badge size="xs" color="blue">System</Badge>
                    )}
                  </Group>
                  <Text size="xs" color="dimmed" lineClamp={2}>
                    {rule.description}
                  </Text>
                  <Group position="apart" mt="xs">
                    <Badge size="xs">{rule.model}</Badge>
                    <Text size="xs" color="dimmed">
                      {new Date(rule.date_modified).toLocaleDateString()}
                    </Text>
                  </Group>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        
        <Group position="center" mt="md">
          <Button 
            variant="outline" 
            leftSection={<Download size={16} />}
            onClick={exportRules}
          >
            Export Rules
          </Button>
          <Button 
            variant="outline" 
            leftSection={<Upload size={16} />}
            onClick={importRules}
          >
            Import Rules
          </Button>
        </Group>
      </div>
      
      {/* Main content area */}
      <div className="w-3/4 pl-4 flex-1" style={{ minWidth: '500px' }}>
        {/* Display editing form or rule details */}
        {isAddingNew || editingId ? (
          /* Form for adding/editing rule */
          <Card shadow="sm" p="lg" radius="md" withBorder className="h-full overflow-y-auto">
            <Card.Section withBorder p="md">
              <Group justify="space-between">
                <Text weight={500}>
                  {editingId ? 'Edit Rule' : 'Add New Rule'}
                </Text>
                <ActionIcon onClick={handleCancelEditing}>
                  <X size={16} />
                </ActionIcon>
              </Group>
            </Card.Section>
            
            <div className="space-y-4 mt-4 p-2">
              <Group align="flex-start">
                <TextInput
                  label="Name"
                  placeholder="Enter rule name"
                  required
                  value={newRule.name}
                  onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                  style={{ flex: 2 }}
                />
                
                <Select
                  label="Model"
                  placeholder="Select model"
                  required
                  value={newRule.model}
                  onChange={(value) => setNewRule({...newRule, model: value || 'gpt-4'})}
                  data={llmModels}
                  style={{ flex: 1 }}
                />
                
                <div>
                  <Text size="sm" weight={500} mb={5}>Color</Text>
                  <Group spacing={8}>
                    {colorOptions.map((color) => (
                      <ColorSwatch 
                        key={color} 
                        color={color} 
                        onClick={() => setNewRule({...newRule, color})}
                        style={{ 
                          cursor: 'pointer',
                          border: newRule.color === color ? '2px solid black' : 'none'
                        }}
                      />
                    ))}
                  </Group>
                </div>
              </Group>
              
              <Textarea
                label="Description"
                placeholder="Enter description"
                minRows={2}
                value={newRule.description}
                onChange={(e) => setNewRule({...newRule, description: e.target.value})}
              />
              
              <Tabs defaultValue="content">
                <Tabs.List>
                  <Tabs.Tab value="content" leftSection={<Terminal size={16} />}>Content</Tabs.Tab>
                  <Tabs.Tab value="variables" leftSection={<Brain size={16} />}>Variables</Tabs.Tab>
                  <Tabs.Tab value="tags" leftSection={<Sparkles size={16} />}>Tags</Tabs.Tab>
                </Tabs.List>
                
                <Tabs.Panel value="content" pt="md">
                  <Text size="sm" weight={500} mb={5}>Rule Content</Text>
                  <Text size="xs" color="dimmed" mb={10}>
                    Use {"{{variableName}}"} syntax to include variables in your content.                    
                  </Text>
                  <Textarea
                    value={newRule.content}
                    onChange={(e) => setNewRule({...newRule, content: e.target.value})}
                    minRows={15}
                    autosize
                    styles={{ input: { fontFamily: 'monospace' } }}
                  />
                </Tabs.Panel>
                
                <Tabs.Panel value="variables" pt="md">
                  <Paper withBorder p="md" mb="md">
                    <Text weight={500} mb="xs">Add Variable</Text>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <TextInput
                        label="Name"
                        placeholder="variableName"
                        required
                        value={newVariable.name}
                        onChange={(e) => setNewVariable({...newVariable, name: e.target.value})}
                      />
                      
                      <Select
                        label="Type"
                        placeholder="Select type"
                        required
                        value={newVariable.type}
                        onChange={(value) => setNewVariable({
                          ...newVariable, 
                          type: (value as 'text' | 'number' | 'boolean' | 'select') || 'text'
                        })}
                        data={[
                          { value: 'text', label: 'Text' },
                          { value: 'number', label: 'Number' },
                          { value: 'boolean', label: 'Boolean' },
                          { value: 'select', label: 'Select' },
                        ]}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <TextInput
                        label="Description"
                        placeholder="Brief description of the variable"
                        value={newVariable.description}
                        onChange={(e) => setNewVariable({...newVariable, description: e.target.value})}
                      />
                      
                      <TextInput
                        label="Default Value"
                        placeholder="Default value"
                        value={newVariable.default_value}
                        onChange={(e) => setNewVariable({...newVariable, default_value: e.target.value})}
                      />
                    </div>
                    
                    {newVariable.type === 'select' && (
                      <div className="mb-4">
                        <Text size="sm" weight={500} mb={5}>Options (comma-separated)</Text>
                        <TextInput
                          placeholder="Option 1, Option 2, Option 3"
                          value={newVariable.options?.join(', ') || ''}
                          onChange={(e) => setNewVariable({
                            ...newVariable,
                            options: e.target.value.split(',').map(o => o.trim()).filter(o => o)
                          })}
                        />
                      </div>
                    )}
                    
                    <Group>
                      {editingVariable ? (
                        <>
                          <Button 
                            onClick={updateVariable} 
                            leftSection={<Save size={16} />}
                          >
                            Update Variable
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={cancelEditingVariable}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button onClick={addVariable} leftSection={<Plus size={16} />}>
                          Add Variable
                        </Button>
                      )}
                    </Group>
                  </Paper>
                  
                  <Text weight={500} mb="xs">Variables</Text>
                  {newRule.variables.length === 0 ? (
                    <Text color="dimmed">No variables defined yet.</Text>
                  ) : (
                    <div className="space-y-3">
                      {newRule.variables.map((variable, index) => (
                        <Paper key={index} withBorder p="md">
                          <Group justify="space-between">
                            <div>
                              <Group spacing={8}>
                                <Text weight={500}>{`{${variable.name}}`}</Text>
                                <Badge size="xs">{variable.type}</Badge>
                              </Group>
                              <Text size="xs" color="dimmed">
                                {variable.description || 'No description'}
                              </Text>
                              <Text size="xs">
                                Default: {variable.default_value || 'None'}
                              </Text>
                              {variable.type === 'select' && variable.options && (
                                <Text size="xs">
                                  Options: {variable.options.join(', ')}
                                </Text>
                              )}
                            </div>
                            <Group spacing={8}>
                              <ActionIcon color="blue" onClick={() => startEditingVariable(variable)}>
                                <Edit size={16} />
                              </ActionIcon>
                              <ActionIcon color="red" onClick={() => removeVariable(variable.name)}>
                                <Trash size={16} />
                              </ActionIcon>
                            </Group>
                          </Group>
                        </Paper>
                      ))}
                    </div>
                  )}
                </Tabs.Panel>
                
                <Tabs.Panel value="tags" pt="md">
                  <div>
                    <Text size="sm" weight={500} mb={5}>Tags</Text>
                    <Group mb={10}>
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
                    
                    <Group>
                      {newRule.tags.map(tag => (
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
                  
                  <Divider my="lg" />
                  
                  <Switch
                    label="System Rule (cannot be deleted by users)"
                    checked={newRule.is_system}
                    onChange={(event) => setNewRule({...newRule, is_system: event.currentTarget.checked})}
                  />
                </Tabs.Panel>
              </Tabs>
              
              <Group position="right" mt={20}>
                <Button 
                  variant="default" 
                  onClick={handleCancelEditing}
                >
                  Cancel
                </Button>
                <Button
                  leftSection={editingId ? <Save size={16} /> : <Plus size={16} />}
                  onClick={() => editingId ? updateRule(editingId) : addRule()}
                >
                  {editingId ? 'Save Changes' : 'Add Rule'}
                </Button>
              </Group>
            </div>
          </Card>
        ) : (
          /* Display rule details */
          selectedRule ? (
            <div className="h-full flex flex-col">
              <Card shadow="sm" p="lg" radius="md" withBorder mb={4}>
                <Group justify="space-between">
                  <div>
                    <Group align="center">
                      <ColorSwatch color={selectedRule.color} size={16} />
                      <Text size="xl" weight={700}>{selectedRule.name}</Text>
                      {selectedRule.is_system && (
                        <Badge color="blue">System</Badge>
                      )}
                    </Group>
                    <Text size="sm" color="dimmed">{selectedRule.description}</Text>
                  </div>
                  
                  <Group>
                    <Button 
                      variant="outline" 
                      leftSection={<Edit size={16} />}
                      onClick={() => startEditing(selectedRule.id)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      leftSection={<Copy size={16} />}
                      onClick={() => duplicateRule(selectedRule.id)}
                    >
                      Duplicate
                    </Button>
                    {/*!selectedRule.is_system && */(
                      <Button 
                        variant="outline" 
                        color="red"
                        leftSection={<Trash size={16} />}
                        onClick={() => deleteRule(selectedRule.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </Group>
                </Group>
                
                <Divider my="sm" />
                
                <Group spacing={10}>
                  <Badge>{selectedRule.model}</Badge>
                  {selectedRule.tags.map(tag => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </Group>
                
                <Group position="apart" mt="xs">
                  <Text size="xs" color="dimmed">
                    Created: {new Date(selectedRule.date_created).toLocaleString()}
                  </Text>
                  <Text size="xs" color="dimmed">
                    Last modified: {new Date(selectedRule.date_modified).toLocaleString()}
                  </Text>
                </Group>
              </Card>
              
              <Tabs defaultValue={showPreview ? "preview" : "content"} flex={1}>
                <Group position="apart" mb="sm">
                  <Tabs.List>
                    <Tabs.Tab 
                      value="content" 
                      leftSection={<Terminal size={16} />}
                      onClick={() => setShowPreview(false)}
                    >
                      Content
                    </Tabs.Tab>
                    <Tabs.Tab 
                      value="preview" 
                      leftSection={<ArrowRight size={16} />}
                      onClick={() => setShowPreview(true)}
                    >
                      Preview
                    </Tabs.Tab>
                    <Tabs.Tab 
                      value="variables" 
                      leftSection={<Brain size={16} />}
                    >
                      Variables
                    </Tabs.Tab>
                  </Tabs.List>
                  
                  <Button 
                    variant="light" 
                    leftSection={<Copy size={16} />}
                    onClick={() => {
                      const content = showPreview 
                        ? getFormattedContent(selectedRule.content, previewVariables)
                        : selectedRule.content;
                      copyToClipboard(content);
                    }}
                  >
                    Copy to Clipboard
                  </Button>
                </Group>
                
                <Tabs.Panel value="content" style={{ height: 'calc(100vh - 350px)' }}>
                  <Paper withBorder p="md" style={{ height: '100%' }}>
                    <ScrollArea style={{ height: '100%' }}>
                      <pre style={{ 
                        fontFamily: 'monospace', 
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                        padding: '8px'
                      }}>
                        {selectedRule.content}
                      </pre>
                    </ScrollArea>
                  </Paper>
                </Tabs.Panel>
                
                <Tabs.Panel value="preview" style={{ height: 'calc(100vh - 350px)' }}>
                  <Paper withBorder p="md" style={{ height: '100%' }}>
                    <ScrollArea style={{ height: '100%' }}>
                      <pre style={{ 
                        fontFamily: 'monospace', 
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                        padding: '8px'
                      }}>
                        {getFormattedContent(selectedRule.content, previewVariables)}
                      </pre>
                    </ScrollArea>
                  </Paper>
                </Tabs.Panel>
                
                <Tabs.Panel value="variables" style={{ height: 'calc(100vh - 350px)' }}>
                  <ScrollArea style={{ height: '100%' }}>
                    {selectedRule.variables.length === 0 ? (
                      <Text color="dimmed" align="center" mt={20}>
                        No variables defined for this rule.
                      </Text>
                    ) : (
                      <div className="space-y-4">
                        <Text size="sm" mb="xs">
                          Modify variable values to see how they affect the output in the Preview tab.
                        </Text>
                        
                        {selectedRule.variables.map((variable, index) => (
                          <Paper key={index} withBorder p="md">
                            <Group position="apart" mb="xs">
                              <div>
                                <Group spacing={8}>
                                  <Text weight={500}>{`{${variable.name}}`}</Text>
                                  <Badge size="xs">{variable.type}</Badge>
                                </Group>
                                <Text size="xs" color="dimmed">
                                  {variable.description || 'No description'}
                                </Text>
                              </div>
                              <Tooltip label="Reset to default">
                                <ActionIcon 
                                  onClick={() => setPreviewVariables({
                                    ...previewVariables,
                                    [variable.name]: variable.default_value
                                  })}
                                >
                                  <RefreshCw size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                            
                            {variable.type === 'select' && variable.options ? (
                              <Select
                                value={previewVariables[variable.name] || variable.default_value}
                                onChange={(value) => setPreviewVariables({
                                  ...previewVariables,
                                  [variable.name]: value || variable.default_value
                                })}
                                data={variable.options.map(option => ({
                                  value: option,
                                  label: option
                                }))}
                              />
                            ) : variable.type === 'boolean' ? (
                              <Switch
                                checked={previewVariables[variable.name] === 'true'}
                                onChange={(event) => setPreviewVariables({
                                  ...previewVariables,
                                  [variable.name]: event.currentTarget.checked ? 'true' : 'false'
                                })}
                              />
                            ) : (
                              <TextInput
                                value={previewVariables[variable.name] || ''}
                                onChange={(e) => setPreviewVariables({
                                  ...previewVariables,
                                  [variable.name]: e.target.value
                                })}
                                type={variable.type === 'number' ? 'number' : 'text'}
                              />
                            )}
                          </Paper>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </Tabs.Panel>
              </Tabs>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Text color="dimmed" align="center">
                Select a rule from the sidebar or create a new one.
              </Text>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default LLMRulesPanel;