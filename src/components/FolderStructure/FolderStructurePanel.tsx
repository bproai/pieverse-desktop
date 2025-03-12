// src/components/FolderStructure/FolderStructurePanel.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  Stack, 
  Alert, 
  Badge, 
  ScrollArea,
  Checkbox,
  Switch,
  ActionIcon,
  Tooltip,
  Collapse,
  ThemeIcon,
  useMantineTheme,
  Tabs,
  LoadingOverlay,
  Code,
  CopyButton,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

// Import specific icons individually
import { AlertCircle, Folder, FolderOpen, FileText, Terminal, Copy, Check, RefreshCw, Filter, Save, Download, Upload, ChevronDown, ChevronRight, File, X } from 'lucide-react';

// Import Tauri API for Tauri 2.0
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';

// Interfaces
interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  size: number;
  extension?: string;
  isExpanded?: boolean;
  isExcluded?: boolean;
}

interface FilterOptions {
  exclude_node_modules: boolean;
  exclude_git: boolean;
  exclude_target: boolean;
  exclude_build: boolean;
  exclude_hidden: boolean;
  custom_excludes: boolean;
  exclude_patterns: string;
}

const FolderStructurePanel: React.FC = () => {
  const theme = useMantineTheme();
  const [projectPath, setProjectPath] = useState<string>('');
  const [isPathValid, setIsPathValid] = useState<boolean>(false);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    exclude_node_modules: true,
    exclude_git: true,
    exclude_target: true,
    exclude_build: true,
    exclude_hidden: true,
    custom_excludes: true,
    exclude_patterns: "monaco-editor|Business Plan|lessons-learned",
  });
  const [showFilterOptions, setShowFilterOptions] = useState<boolean>(false);
  const [treeText, setTreeText] = useState<string>('');
  const [includeFiles, setIncludeFiles] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('tree');
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [llmContext, setLlmContext] = useState<string>('');

  useEffect(() => {
    console.log('Active tab changed to:', activeTab);
  }, [activeTab]);

  // Validate project path
  const validatePath = useCallback(async (path: string) => {
    if (!path) {
      setIsPathValid(false);
      return;
    }

    try {
      const isValid = await core.invoke('is_valid_path', { path });
      setIsPathValid(!!isValid);
    } catch (error) {
      console.error('Error validating path:', error);
      setIsPathValid(false);
    }
  }, []);

  // Update path validation when path changes
  useEffect(() => {
    validatePath(projectPath);
  }, [projectPath, validatePath]);

  // Modified processNode function in loadProjectStructure
  const loadProjectStructure = async () => {
    if (!isPathValid) return;
  
    setLoading(true);
    setError(null);
    try {
      // Build the filters object from your state.
      // Ensure exclude_patterns is sent as null if custom_excludes is false.
      const filters: FilterOptions = {
        exclude_node_modules: filterOptions.exclude_node_modules,
        exclude_git: filterOptions.exclude_git,
        exclude_target: filterOptions.exclude_target,
        exclude_build: filterOptions.exclude_build,
        exclude_hidden: filterOptions.exclude_hidden,
        custom_excludes: filterOptions.custom_excludes,
        exclude_patterns: filterOptions.custom_excludes ? filterOptions.exclude_patterns : null,
      };
  
      const structure = await core.invoke("get_project_structure", { 
        path: projectPath,
        filters,
      }) as FileNode;
  
      // Process the file tree as before
      const processNode = (node: FileNode, isRoot: boolean = false): FileNode => {
        return {
          ...node,
          isExpanded: isRoot, // Only expand the root node
          isExcluded: false,
          children: node.children?.map(child => processNode(child, false)),
        };
      };
  
      setFileTree(processNode(structure, true));
      setActiveTab("tree");
    } catch (error: any) {
      console.error("Error loading project structure:", error);
      setError(error.toString());
      setFileTree(null);
    } finally {
      setLoading(false);
    }
  };
  

  // Generate tree text representation
  const generateTreeText = async () => {
    if (!fileTree) return;
    
    try {
      // The parameter name is 'indentLevel' (camelCase) in the Rust function,
      // not 'indent_level' (snake_case)
      const text = await core.invoke('generate_structure_text', { 
        node: fileTree,
        indentLevel: 0,  // Changed from indent_level to indentLevel
        includeFiles: includeFiles  // Changed from include_files to includeFiles
      }) as string;
      
      console.log('Generated tree text:', text ? text.substring(0, 100) + '...' : 'empty');
      
      setTreeText(text);
      
      // Also update the LLM context with the tree text and some instructions
      const context = `Project Structure:\n\`\`\`\n${text}\`\`\`\n\nThis is the folder structure of the project. Use this information to understand the project organization and provide more relevant responses.`;
      setLlmContext(context);
    } catch (error: any) {
      console.error('Error generating tree text:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to generate tree text: ${error.toString()}`,
        color: 'red'
      });
    }
  };

  // Update tree text when fileTree or includeFiles changes
  useEffect(() => {
    if (fileTree) {
      generateTreeText();
    }
  }, [fileTree, includeFiles]);

  // Toggle node expansion
  const toggleNodeExpansion = (nodePath: string) => {
    if (!fileTree) return;
    
    const updateNode = (node: FileNode): FileNode => {
      if (node.path === nodePath) {
        return { ...node, isExpanded: !node.isExpanded };
      }
      
      return {
        ...node,
        children: node.children?.map(updateNode)
      };
    };
    
    setFileTree(updateNode(fileTree));
  };

  // Toggle node exclusion
  const toggleNodeExclusion = (nodePath: string) => {
    if (!fileTree) return;
    
    const updateNode = (node: FileNode): FileNode => {
      if (node.path === nodePath) {
        return { 
          ...node, 
          isExcluded: !node.isExcluded,
          // Exclude/include all children as well
          children: node.children?.map(child => updateNode({
            ...child,
            isExcluded: !node.isExcluded
          }))
        };
      }
      
      return {
        ...node,
        children: node.children?.map(updateNode)
      };
    };
    
    setFileTree(updateNode(fileTree));
  };

  // Select folder dialog
  const selectFolder = async () => {
    try {
      // Using Tauri 2.0 dialog plugin
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder'
      });
      
      if (selected) {
        setProjectPath(selected as string);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  // Copy tree text to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeTab === 'tree' ? treeText : llmContext)
      .then(() => {
        setCopiedText(true);
        setTimeout(() => setCopiedText(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  // Render file tree node
// Updated renderNode function with improved organization and visual dividers
const renderNode = (node: FileNode, level: number = 0) => {
    if (node.isExcluded) return null;
    
    const isDirectory = node.is_dir;
    const hasChildren = isDirectory && node.children && node.children.length > 0;
    const isExpanded = node.isExpanded;
    
    // Increase indent size
    const indentSize = 20;
    
    // Group children by type if expanded
    let folderChildren: FileNode[] = [];
    let fileChildren: FileNode[] = [];
    
    if (isDirectory && isExpanded && node.children) {
      // Sort children: directories first, then files, alphabetically within each group
      folderChildren = node.children
        .filter(child => child.is_dir)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        
      fileChildren = node.children
        .filter(child => !child.is_dir)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    
    return (
      <div key={node.path}>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center',
            marginBottom: '4px',
            cursor: 'pointer',
            backgroundColor: selectedNodes[node.path] ? theme.colors.blue[0] : 'transparent',
            padding: '4px 8px',
            borderRadius: '4px'
          }}
        >
          {/* Indentation with connecting lines */}
          {Array.from({ length: level }).map((_, i) => (
            <div 
              key={i}
              style={{
                width: indentSize,
                height: 24,
                position: 'relative',
                flexShrink: 0
              }}
            >
              {/* Vertical connecting line */}
              {i < level - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: indentSize / 2,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.15)'
                  }}
                />
              )}
              
              {/* Last level L-shaped connector */}
              {i === level - 1 && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      left: indentSize / 2,
                      top: 0,
                      height: 12,
                      width: 1,
                      backgroundColor: 'rgba(0, 0, 0, 0.15)'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: indentSize / 2,
                      top: 12,
                      width: indentSize / 2,
                      height: 1,
                      backgroundColor: 'rgba(0, 0, 0, 0.15)'
                    }}
                  />
                </>
              )}
            </div>
          ))}
          
          {/* Expand/collapse button for directories */}
          {isDirectory && hasChildren ? (
            <ActionIcon 
              size="xs" 
              onClick={() => toggleNodeExpansion(node.path)}
              style={{ marginRight: '4px' }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </ActionIcon>
          ) : (
            <div style={{ width: '22px', marginRight: '4px' }} />
          )}
          
          {/* File/folder icon */}
          <ThemeIcon 
            size="sm" 
            color={isDirectory ? "blue" : "gray"} 
            variant="light"
            style={{ marginRight: '8px' }}
            onClick={() => {
              if (isDirectory && hasChildren) {
                toggleNodeExpansion(node.path);
              }
            }}
          >
            {isDirectory ? 
              (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />) : 
              <FileText size={14} />
            }
          </ThemeIcon>
          
          {/* Node name */}
          <Text 
            size="sm" 
            onClick={() => {
              if (isDirectory && hasChildren) {
                toggleNodeExpansion(node.path);
              }
            }}
            style={{
              flexGrow: 1,
              fontWeight: isDirectory ? 600 : 400,
              color: isDirectory ? theme.colors.blue[8] : 'inherit'
            }}
          >
            {node.name}
          </Text>
          
          {/* File count badge for folders */}
          {isDirectory && hasChildren && (
            <Badge 
              size="xs" 
              variant="light" 
              color="gray"
              style={{ marginRight: '8px' }}
            >
              {node.children?.length || 0}
            </Badge>
          )}
          
          {/* Toggle include/exclude */}
          <ActionIcon 
            size="xs" 
            color={node.isExcluded ? "red" : "gray"} 
            variant="subtle"
            onClick={() => toggleNodeExclusion(node.path)}
            style={{ marginLeft: '8px' }}
          >
            <X size={14} />
          </ActionIcon>
        </div>
        
        {/* Render folder children first */}
        {isDirectory && isExpanded && folderChildren.length > 0 && (
          <div>
            {folderChildren.map(child => renderNode(child, level + 1))}
          </div>
        )}
        
        {/* Add a divider between folders and files if both exist */}
        {isDirectory && isExpanded && folderChildren.length > 0 && fileChildren.length > 0 && (
          <div 
            style={{
              paddingLeft: `${(level + 1) * indentSize + 30}px`,
              margin: '4px 0',
            }}
          >
            <div 
              style={{
                height: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.07)',
                width: '30%'
              }}
            />
          </div>
        )}
        
        {/* Then render file children */}
        {isDirectory && isExpanded && fileChildren.length > 0 && (
          <div>
            {fileChildren.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-structure-panel">
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Card.Section p="md" className="border-b">
          <Group position="apart">
            <Group>
              <Folder size={20} />
              <Text size="xl" fw={700}>Project Structure for LLM Context</Text>
            </Group>
            <Group>
              <Button 
                variant="light" 
                size="sm" 
                leftSection={<Filter size={14} />}
                onClick={() => setShowFilterOptions(!showFilterOptions)}
              >
                {showFilterOptions ? "Hide Filters" : "Show Filters"}
              </Button>
            </Group>
          </Group>
        </Card.Section>

        <Stack spacing="md" mt="md">
          {/* Path selection */}
          <Group position="apart" align="end">
            <TextInput
              label="Project Path"
              placeholder="Select or enter project directory path"
              value={projectPath}
              onChange={(e) => setProjectPath(e.currentTarget.value)}
              style={{ flexGrow: 1 }}
              error={projectPath && !isPathValid ? "Invalid path" : ""}
            />
            <Button 
              onClick={selectFolder}
              leftSection={<Folder size={14} />}
              variant="outline"
            >
              Browse
            </Button>
            <Button 
              onClick={loadProjectStructure}
              leftSection={<RefreshCw size={14} />}
              loading={loading}
              disabled={!isPathValid}
            >
              Load
            </Button>
          </Group>

          {/* Filter options */}
          <Collapse in={showFilterOptions}>
            <Card withBorder p="md" radius="md">
              <Text weight={600} mb="md">Filter Options</Text>
              <Stack spacing="xs">
                <Checkbox
                  label="Exclude node_modules folders"
                  checked={filterOptions.exclude_node_modules}
                  onChange={(e) => setFilterOptions({...filterOptions, exclude_node_modules: e.currentTarget.checked})}
                />
                <Checkbox
                  label="Exclude .git folders"
                  checked={filterOptions.exclude_git}
                  onChange={(e) => setFilterOptions({...filterOptions, exclude_git: e.currentTarget.checked})}
                />
                <Checkbox
                  label="Exclude target folders (Rust build outputs)"
                  checked={filterOptions.exclude_target}
                  onChange={(e) => setFilterOptions({...filterOptions, exclude_target: e.currentTarget.checked})}
                />
                <Checkbox
                  label="Exclude build/dist folders"
                  checked={filterOptions.exclude_build}
                  onChange={(e) => setFilterOptions({...filterOptions, exclude_build: e.currentTarget.checked})}
                />
                <Checkbox
                  label="Exclude hidden files (starting with .)"
                  checked={filterOptions.exclude_hidden}
                  onChange={(e) => setFilterOptions({...filterOptions, exclude_hidden: e.currentTarget.checked})}
                />
                <Checkbox
                  label="Use custom pattern exclusions"
                  checked={filterOptions.custom_excludes}
                  onChange={(e) => setFilterOptions({...filterOptions, custom_excludes: e.currentTarget.checked})}
                />
                {filterOptions.custom_excludes && (
                  <TextInput
                    label="Custom exclude patterns (regex, separate with |)"
                    placeholder="e.g. \.bak$|\.tmp$|logs/"
                    value={filterOptions.exclude_patterns}
                    onChange={(e) => setFilterOptions({...filterOptions, exclude_patterns: e.currentTarget.value})}
                  />
                )}
              </Stack>
            </Card>
          </Collapse>

          {/* Error message */}
          {error && (
            <Alert color="red" title="Error" icon={<AlertCircle size={16} />}>
              {error}
            </Alert>
          )}

          {/* Main content */}
          <Card withBorder p={0} radius="md">
            <Tabs defaultValue="tree">
                <Tabs.List>
                <Tabs.Tab value="tree" icon={<Folder size={16} />}>
                    Folder Tree
                </Tabs.Tab>
                <Tabs.Tab value="text" icon={<FileText size={16} />}>
                    Text Representation
                </Tabs.Tab>
                <Tabs.Tab value="llm" icon={<Terminal size={16} />}>
                    LLM Context
                </Tabs.Tab>
                </Tabs.List>
                
                <Tabs.Panel value="tree" pt="xs">
                <Group position="apart" mb="md" p="md">
                    <Text weight={600}>Project Structure</Text>
                    <Checkbox
                    label="Include files in text output"
                    checked={includeFiles}
                    onChange={(e) => setIncludeFiles(e.currentTarget.checked)}
                    />
                </Group>
                
                <ScrollArea h={500} type="auto" p="md">
                    {fileTree ? (
                    renderNode(fileTree)
                    ) : (
                    <Text color="dimmed" align="center" mt="lg">
                        {loading ? "Loading project structure..." : "No project loaded"}
                    </Text>
                    )}
                </ScrollArea>
                </Tabs.Panel>

                <Tabs.Panel value="text" pt="xs">
                <Group position="apart" mb="md" p="md">
                    <Text weight={600}>Text Representation</Text>
                    <CopyButton value={treeText} timeout={2000}>
                    {({ copied, copy }) => (
                        <Button 
                        color={copied ? 'teal' : 'blue'}
                        onClick={copy}
                        leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                        size="sm"
                        >
                        {copied ? 'Copied' : 'Copy'}
                        </Button>
                    )}
                    </CopyButton>
                </Group>
                
                <ScrollArea h={500} type="auto" p="md">
                    <Code block sx={{ fontSize: '12px', lineHeight: 1.5 }}>
                    {treeText || "No project structure generated yet."}
                    </Code>
                </ScrollArea>
                </Tabs.Panel>

                <Tabs.Panel value="llm" pt="xs">
                <Group position="apart" mb="md" p="md">
                    <Text weight={600}>LLM Context</Text>
                    <CopyButton value={llmContext} timeout={2000}>
                    {({ copied, copy }) => (
                        <Button 
                        color={copied ? 'teal' : 'blue'}
                        onClick={copy}
                        leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                        size="sm"
                        >
                        {copied ? 'Copied' : 'Copy to Clipboard'}
                        </Button>
                    )}
                    </CopyButton>
                </Group>
                
                <div style={{ padding: '0 16px 16px 16px' }}>
                    <Textarea
                    value={llmContext}
                    onChange={(e) => setLlmContext(e.currentTarget.value)}
                    minRows={15}
                    maxRows={20}
                    autosize
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                    
                    <Text size="xs" color="dimmed" mt="sm">
                    Edit this text as needed before using it as context with an LLM. The folder structure is 
                    formatted to be clear and informative for the model.
                    </Text>
                </div>
                </Tabs.Panel>
            </Tabs>
          </Card>
        </Stack>
      </Card>
    </div>
  );
};

export default FolderStructurePanel;