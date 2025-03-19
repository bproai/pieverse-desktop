// src/components/ContextBuilder/ContextBuilderPanel.tsx
import React, { useState } from 'react';
import { 
  Text, 
  Card, 
  Tabs, 
  Button, 
  TextInput, 
  Textarea, 
  Group, 
  Stack,
  Badge,
  Select,
  ActionIcon
} from '@mantine/core';
import { Upload, FileText, Plus, Database, FolderTree, Copy, Check, Brain, BookOpen } from 'lucide-react';

const ContextBuilderPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>('files');
  const [contextSections, setContextSections] = useState<Array<{id: string, title: string, content: string}>>([
    { id: '1', title: 'Project Overview', content: 'This is a Tauri + React application that...' }
  ]);
  const [finalContext, setFinalContext] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleAddSection = () => {
    const newId = String(Date.now());
    setContextSections([...contextSections, { 
      id: newId, 
      title: `Section ${contextSections.length + 1}`, 
      content: '' 
    }]);
  };

  const handleUpdateSection = (id: string, field: 'title' | 'content', value: string) => {
    setContextSections(contextSections.map(section => 
      section.id === id ? { ...section, [field]: value } : section
    ));
  };

  const handleRemoveSection = (id: string) => {
    setContextSections(contextSections.filter(section => section.id !== id));
  };

  const generateFinalContext = () => {
    const combinedContext = contextSections
      .map(section => `# ${section.title}\n\n${section.content}`)
      .join('\n\n');
    
    setFinalContext(combinedContext);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(finalContext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="context-builder-panel">
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Card.Section p="md" className="border-b">
          <Group position="apart">
            <Text size="xl" fw={700}>Context Builder</Text>
            <Button 
              variant="light" 
              size="sm" 
              leftSection={<Plus size={14} />}
              onClick={handleAddSection}
            >
              Add Section
            </Button>
          </Group>
        </Card.Section>

        <Stack spacing="md" mt="md">
          <Tabs defaultValue="files" value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="files" icon={<FileText size={16} />}>
                Files
              </Tabs.Tab>
              <Tabs.Tab value="database" icon={<Database size={16} />}>
                Database
              </Tabs.Tab>
              <Tabs.Tab value="structure" icon={<FolderTree size={16} />}>
                Project Structure
              </Tabs.Tab>
              <Tabs.Tab value="llm-rules" icon={<Brain size={16} />}>
                LLM Rules
              </Tabs.Tab>
              <Tabs.Tab value="references" icon={<BookOpen size={16} />}>
                References
              </Tabs.Tab>
              <Tabs.Tab value="editor" icon={<FileText size={16} />}>
                Context Editor
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="files" pt="md">
              <Card withBorder p="md" radius="md">
                <Group position="center" style={{ minHeight: '150px' }}>
                  <Stack align="center" spacing="xs">
                    <Upload size={48} />
                    <Text size="sm">Drag and drop files or</Text>
                    <Button variant="outline" size="sm">Browse Files</Button>
                    <Text size="xs" color="dimmed">Selected files will be added as context sections</Text>
                  </Stack>
                </Group>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="database" pt="md">
              <Card withBorder p="md" radius="md">
                <Text>Database schema and sample data will be shown here</Text>
                <Select
                  label="Select Database"
                  placeholder="Choose a database connection"
                  data={[
                    { value: 'mysql', label: 'MySQL' },
                    { value: 'mongodb', label: 'MongoDB' },
                    { value: 'sqlite', label: 'SQLite' }
                  ]}
                  mt="md"
                />
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="structure" pt="md">
              <Card withBorder p="md" radius="md">
                <Text>Project structure will be shown here</Text>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="llm-rules" pt="md">
              <Card withBorder p="md" radius="md">
                <Text>LLM Rules will be shown here</Text>
                <Text size="sm" color="dimmed" mt="md">
                  You can include model rules, system prompts, and custom instructions to include in your context.
                </Text>
                <Select
                  label="Select Rule Category"
                  placeholder="Choose a rule category"
                  data={[
                    { value: 'system', label: 'System Prompts' },
                    { value: 'instructions', label: 'Custom Instructions' },
                    { value: 'persona', label: 'AI Personas' }
                  ]}
                  mt="md"
                />
              </Card>
            </Tabs.Panel>            

            <Tabs.Panel value="references" pt="md">
              <Card withBorder p="md" radius="md">
                <Text>References will be shown here</Text>
                <Text size="sm" color="dimmed" mt="md">
                  You can include documentation references, API specifications, and other reference materials to add to your context.
                </Text>
                <Group position="apart" mt="md">
                  <Select
                    label="Select Reference Category"
                    placeholder="Choose a reference category"
                    style={{ width: '300px' }}
                    data={[
                      { value: 'apis', label: 'API References' },
                      { value: 'docs', label: 'Documentation' },
                      { value: 'specs', label: 'Specifications' },
                      { value: 'custom', label: 'Custom References' }
                    ]}
                  />
                  <Button variant="outline" size="sm" mt="lg">
                    Import Reference
                  </Button>
                </Group>
              </Card>
            </Tabs.Panel>            

            <Tabs.Panel value="editor" pt="md">
              <Stack spacing="md">
                {contextSections.map((section) => (
                  <Card key={section.id} withBorder p="md" radius="md">
                    <Group position="apart" mb="xs">
                      <TextInput
                        placeholder="Section Title"
                        value={section.title}
                        onChange={(e) => handleUpdateSection(section.id, 'title', e.currentTarget.value)}
                        style={{ flexGrow: 1 }}
                      />
                      <Button 
                        variant="subtle" 
                        color="red" 
                        size="xs"
                        onClick={() => handleRemoveSection(section.id)}
                      >
                        Remove
                      </Button>
                    </Group>
                    <Textarea
                      placeholder="Section Content"
                      value={section.content}
                      onChange={(e) => handleUpdateSection(section.id, 'content', e.currentTarget.value)}
                      minRows={3}
                      autosize
                    />
                  </Card>
                ))}

                <Group position="center" mt="md">
                  <Button onClick={generateFinalContext}>Generate Context</Button>
                </Group>

                {finalContext && (
                  <Card withBorder p="md" radius="md">
                    <Group position="apart" mb="md">
                      <Text fw={600}>Final Context</Text>
                      <ActionIcon
                        color={copied ? "green" : "blue"}
                        variant="light"
                        onClick={copyToClipboard}
                        title="Copy to Clipboard"
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </ActionIcon>
                    </Group>
                    <Textarea
                      value={finalContext}
                      onChange={(e) => setFinalContext(e.currentTarget.value)}
                      minRows={10}
                      autosize
                      readOnly={false}
                    />
                    <Group position="right" mt="xs">
                      <Badge color="blue">{finalContext.length} characters</Badge>
                    </Group>
                  </Card>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Card>
    </div>
  );
};

export default ContextBuilderPanel;