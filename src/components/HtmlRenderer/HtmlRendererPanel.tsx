// src/components/HtmlRenderer/HtmlRendererPanel.tsx
import React from 'react';
import { Card, Text, Button, Group, Tabs, Divider, Badge } from '@mantine/core';
import { FileText, Upload, Settings, MousePointer2, Menu as MenuIcon } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import HtmlRenderer from './HtmlRenderer';

interface HtmlRendererPanelProps {
  isDark: boolean;
}

export const HtmlRendererPanel: React.FC<HtmlRendererPanelProps> = ({ isDark }) => {
  const [htmlContent, setHtmlContent] = React.useState<string>('');
  const [fileName, setFileName] = React.useState<string | null>(null);

  // Load file from disk using Tauri's dialog API
  const handleLoadFile = async () => {
    try {
      // Open file dialog that accepts HTML and text files
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'HTML & Text Files',
          extensions: ['html', 'htm', 'txt', 'json']
        }]
      });

      if (selected && !Array.isArray(selected)) {
        const filePath = selected;
        
        // Use Tauri to read the file
        const fileContent = await window.__TAURI__.fs.readTextFile(filePath);
        setHtmlContent(fileContent);
        
        // Extract just the filename from the path
        const fileNameMatch = filePath.match(/[^/\\]+$/);
        setFileName(fileNameMatch ? fileNameMatch[0] : filePath);
      }
    } catch (error) {
      console.error('Error loading file:', error);
    }
  };

  // Handle content changes from the renderer
  const handleContentChange = (newContent: string) => {
    setHtmlContent(newContent);
  };

  return (
    <div className="html-renderer-panel">
      <Card shadow="sm" p="lg" mb="md" withBorder>
        <Text weight={600} size="lg" mb="sm">HTML Renderer</Text>
        
        <Group mb="md" align="center" spacing="sm">
          <Button 
            leftIcon={<Upload size={16} />} 
            onClick={handleLoadFile}
            variant="light"
            size="sm"
          >
            Load File
          </Button>
          
          <Text size="sm" color="dimmed" className="ml-2">or</Text>
          
          <Group spacing={5} className="flex items-center">
            <MousePointer2 size={14} />
            <Text size="sm" color="dimmed">Right-click to paste from clipboard</Text>
          </Group>
        </Group>
        
        {fileName && (
          <Group>
            <Badge color="blue" variant="light" className="flex items-center">
              <FileText size={14} className="mr-1" />
              <span>{fileName}</span>
            </Badge>
          </Group>
        )}
      </Card>
      
      <Tabs defaultValue="preview">
        <Tabs.List>
          <Tabs.Tab value="preview" icon={<FileText size={16} />}>
            Preview
          </Tabs.Tab>
          <Tabs.Tab value="settings" icon={<Settings size={16} />}>
            Help
          </Tabs.Tab>
        </Tabs.List>
        
        <Tabs.Panel value="preview" pt="xs">
          <HtmlRenderer 
            content={htmlContent} 
            darkMode={isDark}
            onContentChange={handleContentChange}
          />
        </Tabs.Panel>
        
        <Tabs.Panel value="settings" pt="xs">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text weight={600} size="md" mb="md">Usage Instructions</Text>
            
            <div className="space-y-4">
              <div>
                <Text weight={500} size="sm">Input Content:</Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm">Click "Load File" to open HTML, text, or JSON files</li>
                  <li className="text-sm">Right-click in the input area and select "Paste" to paste from clipboard</li>
                  <li className="text-sm">Use the "Clear" button below the input area to remove content</li>
                  <li className="text-sm">Or use the menu button (<MenuIcon size={12} className="inline" />) in the input area for more actions</li>
                </ul>
              </div>
              
              <Divider my="sm" />
              
              <div>
                <Text weight={500} size="sm">Content Types:</Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm">HTML: Standard HTML markup with tags</li>
                  <li className="text-sm">Text with Newlines: Plain text with line breaks</li>
                  <li className="text-sm">JSON: Objects with "html" or "plain_text" fields</li>
                </ul>
              </div>
              
              <Divider my="sm" />
              
              <div>
                <Text weight={500} size="sm">Settings Tab Options:</Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm">Show data attributes: Display data-* attributes in HTML</li>
                  <li className="text-sm">Normalize newlines: Convert multiple newlines to paragraph breaks</li>
                </ul>
              </div>
              
              <Divider my="sm" />
              
              <div>
                <Text weight={500} size="sm" color="dimmed">Keyboard Shortcuts:</Text>
                <ul className="list-disc pl-5 mt-1">
                    <li className="text-sm text-dimmed">Select all text: Ctrl+A (Windows/Linux) or ⌘+A (Mac)</li>
                    <li className="text-sm text-dimmed">Paste from clipboard: Ctrl+V (Windows/Linux) or ⌘+V (Mac)</li>
                    <li className="text-sm text-dimmed">Cut selected text: Ctrl+X (Windows/Linux) or ⌘+X (Mac)</li>
                    <li className="text-sm text-dimmed">Delete/Backspace: Remove selected text</li>
                </ul>
              </div>
            </div>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

export default HtmlRendererPanel;