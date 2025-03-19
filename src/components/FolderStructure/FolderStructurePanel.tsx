// src/components/FolderStructure/FolderStructurePanel.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ActionIcon,
  Collapse,
  ThemeIcon,
  useMantineTheme,
  Tabs,
  Code,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Folder, FolderOpen, FileText, Terminal, Copy, Check, RefreshCw, Filter, X } from 'lucide-react';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import * as path from '@tauri-apps/api/path';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

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
  isSelected?: boolean; // Track selection state
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
  
  // Track selected files for drag/clipboard
  const [selectedFiles, setSelectedFiles] = useState<FileNode[]>([]);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    console.log('Active tab changed to:', activeTab);
  }, [activeTab]);

  // Validate project path
  const validatePath = useCallback(async (pathStr: string) => {
    if (!pathStr) {
      setIsPathValid(false);
      return;
    }
    try {
      const isValid = await core.invoke('is_valid_path', { path: pathStr });
      setIsPathValid(!!isValid);
    } catch (error) {
      console.error('Error validating path:', error);
      setIsPathValid(false);
    }
  }, []);

  useEffect(() => {
    validatePath(projectPath);
  }, [projectPath, validatePath]);

  // Process node to add selection info
  const processNode = (node: FileNode, isRoot: boolean = false): FileNode => {
    return {
      ...node,
      isExpanded: isRoot,
      isExcluded: false,
      isSelected: false,
      children: node.children?.map(child => processNode(child, false)),
    };
  };

  // Load project structure
  const loadProjectStructure = async () => {
    if (!isPathValid) return;
    setLoading(true);
    setError(null);
    try {
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
      setFileTree(processNode(structure, true));
      setActiveTab("tree");
      setSelectedFiles([]);
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
      const text = await core.invoke('generate_structure_text', { 
        node: fileTree,
        includeFiles: includeFiles
      }) as string;
      console.log('Generated tree text:', text ? text.substring(0, 100) + '...' : 'empty');
      setTreeText(text);
      const context = `Project Structure:\n\`\`\`\n${text}\`\`\`\n\nThis is the folder structure of the project.`;
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
      return { ...node, children: node.children?.map(updateNode) };
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
          children: node.children?.map(child => updateNode({ ...child, isExcluded: !node.isExcluded }))
        };
      }
      return { ...node, children: node.children?.map(updateNode) };
    };
    setFileTree(updateNode(fileTree));
  };

  // Toggle file selection (for clipboard/drag)
  const toggleNodeSelection = (node: FileNode, event: React.MouseEvent) => {
    if (node.is_dir) return;
    event.stopPropagation();
    if (!fileTree) return;
    const updateNode = (currentNode: FileNode): FileNode => {
      if (currentNode.path === node.path) {
        const newSelectedState = !currentNode.isSelected;
        if (newSelectedState) {
          setSelectedFiles(prev => [...prev, currentNode]);
        } else {
          setSelectedFiles(prev => prev.filter(file => file.path !== currentNode.path));
        }
        return { ...currentNode, isSelected: newSelectedState };
      }
      return { ...currentNode, children: currentNode.children?.map(updateNode) };
    };
    setFileTree(updateNode(fileTree));
  };

  // Resolve full file path
  const getCorrectFilePath = async (file: FileNode): Promise<string> => {
    console.log("Original file path:", file.path, "Project path:", projectPath);
    const projectDirName = projectPath.split('/').pop() || '';
    if (file.path.startsWith(projectDirName + '/')) {
      const trimmedPath = file.path.substring(projectDirName.length + 1);
      const fullPath = await path.join(projectPath, trimmedPath);
      return fullPath;
    }
    if (file.path.startsWith('/') || file.path.includes(':')) {
      return file.path;
    } else {
      return await path.join(projectPath, file.path);
    }
  };

  // Merge selected text files and copy to clipboard using Tauri's clipboard API.
  const copySelectedFilesToClipboard = async () => {
    if (selectedFiles.length === 0) {
      notifications.show({
        title: 'No Files Selected',
        message: 'Please select at least one file first',
        color: 'blue'
      });
      return;
    }
    try {
      const contentPromises = selectedFiles.map(async (file) => {
        const fullPath = await getCorrectFilePath(file);
        try {
          const fileExists = await exists(fullPath);
          if (!fileExists) {
            console.error(`File does not exist: ${fullPath}`);
            return null;
          }
          const content = await readTextFile(fullPath);
          return { name: file.name, content };
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error);
          return null;
        }
      });
      const fileContents = (await Promise.all(contentPromises)).filter(Boolean);
      if (fileContents.length === 0) {
        notifications.show({
          title: 'Error',
          message: 'Could not read any of the selected files',
          color: 'red'
        });
        return;
      }
      let clipboardText = '';
      if (fileContents.length === 1) {
        clipboardText = fileContents[0].content;
      } else {
        clipboardText = fileContents.map(file => 
          `--- ${file.name} ---\n\n${file.content}`
        ).join('\n\n\n');
      }
      await writeText(clipboardText);
      notifications.show({
        title: 'Success',
        message: `${fileContents.length} file(s) copied to clipboard (${clipboardText.length} characters)`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error copying files to clipboard:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to copy files: ${error}`,
        color: 'red'
      });
    }
  };

  const stageFilesForDragAndDrop = async () => {
    if (selectedFiles.length === 0) {
      notifications.show({
        title: 'No Files Selected',
        message: 'Please select at least one file first',
        color: 'blue'
      });
      return;
    }
    
    try {
      // First, check if the directory exists and has files
      const dragDropExists = await core.invoke('check_drag_drop_dir_exists') as boolean;
      
      if (dragDropExists) {
        let dragDropPath = "";
        try {
          const result = await core.invoke('create_copies_for_files', {
            filePaths: [],
            projectBasePath: projectPath
          }) as string;
          // Extract path from the result text
          const pathMatch = result.match(/in\s+(.+?)$/);
          dragDropPath = pathMatch ? pathMatch[1] : "";
        } catch {}
                
        // Ask for confirmation to clear the directory
        const confirmed = window.confirm(`The drag_and_drop folder already contains files. Is it okay to remove them?\n\nPath: ${dragDropPath}`);
        if (!confirmed) {
          return;
        }
      }
      
      // Collect paths of selected files
      const filePaths = await Promise.all(selectedFiles.map(async (file) => {
        return await getCorrectFilePath(file);
      }));
      
      // Call the Rust backend to create symlinks with proper Tauri 2.0 invoke pattern
      const result = await core.invoke('create_copies_for_files', {
        filePaths,
        projectBasePath: projectPath
      }) as string;
      
      notifications.show({
        title: 'Success',
        message: result,
        color: 'green'
      });
      
      // Open the folder in the system's file explorer
      try {
        await core.invoke('open_drag_drop_dir');
      } catch (error) {
        console.error('Failed to open drag and drop folder:', error);
      }
      
      // Provide more detailed success information
      notifications.show({
        title: 'Files Ready',
        message: 'Files are now staged for drag & drop in the tmp/drag_and_drop folder',
        color: 'blue'
      });
    } catch (error) {
      console.error('Error staging files for drag and drop:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to stage files: ${error}`,
        color: 'red'
      });
    }
  };

  // Handle drag start
  const handleDragStart = async (event: React.DragEvent<HTMLDivElement>) => {
    if (selectedFiles.length === 0) return;
    console.log('Drag start with selected files:', selectedFiles);
    setIsDragging(true);
    try {
      const fileList = selectedFiles.map(f => f.name).join('\n');
      event.dataTransfer.setData('text/plain', fileList);
      if (dragPreviewRef.current) {
        const dragPreview = dragPreviewRef.current;
        dragPreview.style.display = 'flex';
        dragPreview.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`;
        event.dataTransfer.setDragImage(
          dragPreview, 
          dragPreview.offsetWidth / 2, 
          dragPreview.offsetHeight / 2
        );
        setTimeout(() => {
          dragPreview.style.display = 'none';
        }, 0);
      }
      for (const file of selectedFiles) {
        const fullPath = await getCorrectFilePath(file);
        try {
          const fileExists = await exists(fullPath);
          if (!fileExists) {
            console.error(`File does not exist: ${fullPath}`);
            continue;
          }
          const content = await readTextFile(fullPath);
          console.log(`Read ${content.length} characters from ${file.name}`);
          // For text files, we simply set the content as text data.
          event.dataTransfer.setData('text/plain', content);
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error);
        }
      }
      console.log('Drag data prepared successfully');
    } catch (error) {
      console.error("Error during drag start:", error);
      setIsDragging(false);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Render file tree nodes
  const renderNode = (node: FileNode, level: number = 0) => {
    if (node.isExcluded) return null;
    const isDirectory = node.is_dir;
    const hasChildren = isDirectory && node.children && node.children.length > 0;
    const isExpanded = node.isExpanded;
    const isSelected = node.isSelected;
    const indentSize = 20;
    let folderChildren: FileNode[] = [];
    let fileChildren: FileNode[] = [];
    if (isDirectory && isExpanded && node.children) {
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
          className={`file-node ${isSelected ? 'selected' : ''}`}
          style={{ 
            display: 'flex', 
            alignItems: 'center',
            marginBottom: '4px',
            cursor: isDirectory ? 'pointer' : 'default',
            backgroundColor: isSelected ? theme.colors.blue[2] : (selectedNodes[node.path] ? theme.colors.blue[0] : 'transparent'),
            padding: '4px 8px',
            borderRadius: '4px'
          }}
          draggable={!isDirectory && isSelected}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
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
          {isDirectory && hasChildren ? (
            <ActionIcon 
              size="xs" 
              onClick={() => toggleNodeExpansion(node.path)}
              style={{ marginRight: '4px' }}
            >
              {isExpanded ? <Terminal size={14} /> : <Terminal size={14} />}
            </ActionIcon>
          ) : (
            <div style={{ width: '22px', marginRight: '4px' }} />
          )}
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
          <Text 
            size="sm" 
            onClick={(e) => {
              if (isDirectory && hasChildren) {
                toggleNodeExpansion(node.path);
              } else if (!isDirectory) {
                toggleNodeSelection(node, e);
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
          {!isDirectory && (
            <Checkbox 
              checked={isSelected}
              onChange={(e) => {
                toggleNodeSelection(node, e.nativeEvent as unknown as React.MouseEvent);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ marginRight: '8px' }}
            />
          )}
          <ActionIcon 
            size="xs" 
            color={node.isExcluded ? "red" : "gray"} 
            variant="subtle"
            onClick={() => toggleNodeExclusion(node.path)}
            style={{ marginLeft: '4px' }}
          >
            <X size={14} />
          </ActionIcon>
        </div>
        {isDirectory && isExpanded && folderChildren.length > 0 && (
          <div>
            {folderChildren.map(child => renderNode(child, level + 1))}
          </div>
        )}
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
        {isDirectory && isExpanded && fileChildren.length > 0 && (
          <div>
            {fileChildren.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Folder selection dialog
  const selectFolder = async () => {
    try {
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

  // Copy tree text to clipboard using browser API (for non-file content)
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

  // Clear file selection
  const clearSelection = () => {
    if (!fileTree) return;
    const clearSelectionInNode = (node: FileNode): FileNode => ({
      ...node,
      isSelected: false,
      children: node.children?.map(clearSelectionInNode)
    });
    setFileTree(clearSelectionInNode(fileTree));
    setSelectedFiles([]);
  };

  return (
    <div className="folder-structure-panel">
      <div 
        ref={dragPreviewRef}
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          backgroundColor: theme.colors.blue[5],
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 9999,
          display: 'none',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
      >
        <FileText size={12} />
        <span>0 files</span>
      </div>
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
          {selectedFiles.length > 0 && (
            <Alert color="blue" title={`${selectedFiles.length} file(s) selected for transfer`} icon={<FileText size={16} />}>
                <Group position="apart" mb="xs">
                <Text size="sm">Select files in the tree view and copy or drag them as needed.</Text>
                <Group>
                    <Button variant="subtle" size="xs" onClick={clearSelection}>
                    Clear Selection
                    </Button>
                    <Button 
                    onClick={copySelectedFilesToClipboard}
                    size="xs"
                    variant="filled"
                    color="green"
                    leftSection={<Copy size={14} />}
                    >
                    Copy to Clipboard
                    </Button>
                    <Button 
                      onClick={stageFilesForDragAndDrop}
                      size="xs"
                      variant="filled"
                      color="cyan"
                      leftSection={<Folder size={14} />}
                    >
                      Stage Files for Drag & Drop
                    </Button>
                </Group>
                </Group>
                <Text size="xs" color="dimmed">
                Tip: Use Copy to Clipboard (recommended) for reliable transfer, or drag selected files for compatible targets.
                </Text>
            </Alert>
            )}
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
          {error && (
            <Alert color="red" title="Error" icon={<AlertCircle size={16} />}>
              {error}
            </Alert>
          )}
          <Card withBorder p={0} radius="md">
            <Tabs defaultValue="tree" value={activeTab} onChange={setActiveTab}>
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
                  <Group>
                    <Text weight={600}>Project Structure</Text>
                    {selectedFiles.length > 0 && (
                      <Badge color="blue">{selectedFiles.length} file(s) selected</Badge>
                    )}
                  </Group>
                  <Checkbox
                    label="Include files in text output"
                    checked={includeFiles}
                    onChange={(e) => setIncludeFiles(e.currentTarget.checked)}
                  />
                </Group>
                <ScrollArea h={500} type="auto" p="md">
                  {fileTree ? renderNode(fileTree) : (
                    <Text color="dimmed" align="center" mt="lg">
                      {loading ? "Loading project structure..." : "No project loaded"}
                    </Text>
                  )}
                </ScrollArea>
              </Tabs.Panel>
              <Tabs.Panel value="text" pt="xs">
                <Group position="apart" mb="md" p="md">
                  <Text weight={600}>Text Representation</Text>
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
                  <ActionIcon
                    color={copiedText ? "green" : "blue"}
                    variant="light"
                    onClick={copyToClipboard}
                    title="Copy as Markdown"
                    size="md"
                  >
                    {copiedText ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
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
                    Edit this text as needed before using it as context with an LLM.
                  </Text>
                </div>
              </Tabs.Panel>
            </Tabs>
          </Card>
        </Stack>
      </Card>
      <style>
        {`
          .file-node.selected {
            background-color: ${theme.colors.blue[1]} !important;
            border: 1px solid ${theme.colors.blue[5]};
          }
          .file-node:not(.selected):hover {
            background-color: ${theme.colors.gray[0]};
          }
        `}
      </style>
    </div>
  );
};

export default FolderStructurePanel;
