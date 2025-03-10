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
      <Card 
        shadow="sm" 
        p="lg" 
        mb="md" 
        withBorder
        style={{ 
          backgroundColor: isDark ? '#1A1B1E' : '#ffffff',
          borderColor: isDark ? '#373A40' : '#dee2e6' 
        }}
      >
        <Text 
          weight={600} 
          size="lg" 
          mb="sm"
          style={{ color: isDark ? '#E9ECEF' : '#212529' }}
        >
          HTML Renderer
        </Text>
        
        <Group mb="md" align="center" spacing="sm">
          <Button 
            leftIcon={<Upload size={16} />} 
            onClick={handleLoadFile}
            variant="light"
            size="sm"
          >
            Load File
          </Button>
          
          <Text size="sm" style={{ color: isDark ? '#909296' : '#6c757d' }} className="ml-2">or</Text>
          
          <Group spacing={5} className="flex items-center">
            <MousePointer2 size={14} style={{ color: isDark ? '#909296' : '#6c757d' }} />
            <Text size="sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>Right-click to paste from clipboard</Text>
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
          <Tabs.Tab value="help" icon={<Settings size={16} />}>
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
        
        <Tabs.Panel value="help" pt="xs">
          <Card 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder
            style={{ 
              backgroundColor: isDark ? '#1A1B1E' : '#ffffff',
              borderColor: isDark ? '#373A40' : '#dee2e6' 
            }}
          >
            <Text 
              weight={600} 
              size="md" 
              mb="md"
              style={{ color: isDark ? '#E9ECEF' : '#212529' }}
            >
              Usage Instructions
            </Text>
            
            <div className="space-y-4">
              <div>
                <Text 
                  weight={500} 
                  size="sm"
                  style={{ color: isDark ? '#C1C2C5' : '#495057' }}
                >
                  Input Content:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Click "Load File" to open HTML, text, or JSON files
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Right-click in the input area and select "Paste" to paste from clipboard
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Use the "Clear" button below the input area to remove content
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Or use the menu button (<MenuIcon size={12} className="inline" />) in the input area for more actions
                  </li>
                </ul>
              </div>
              
              <Divider my="sm" color={isDark ? '#373A40' : '#e9ecef'} />
              
              <div>
                <Text 
                  weight={500} 
                  size="sm"
                  style={{ color: isDark ? '#C1C2C5' : '#495057' }}
                >
                  Content Types:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    HTML: Standard HTML markup with tags
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Text with Newlines: Plain text with line breaks
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    JSON: Objects with "html" or "plain_text" fields
                  </li>
                </ul>
              </div>
              
              <Divider my="sm" color={isDark ? '#373A40' : '#e9ecef'} />
              
              <div>
                <Text 
                  weight={500} 
                  size="sm"
                  style={{ color: isDark ? '#C1C2C5' : '#495057' }}
                >
                  Settings Tab Options:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Show data attributes: Display data-* attributes in HTML
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Normalize newlines: Convert multiple newlines to paragraph breaks
                  </li>
                </ul>
              </div>
              
              <Divider my="sm" color={isDark ? '#373A40' : '#e9ecef'} />
              
              <div>
                <Text 
                  weight={500} 
                  size="sm" 
                  style={{ color: isDark ? '#909296' : '#6c757d' }}
                >
                  Keyboard Shortcuts:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>
                    Select all text: Ctrl+A (Windows/Linux) or ⌘+A (Mac)
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>
                    Paste from clipboard: Ctrl+V (Windows/Linux) or ⌘+V (Mac)
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>
                    Cut selected text: Ctrl+X (Windows/Linux) or ⌘+X (Mac)
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>
                    Delete/Backspace: Remove selected text
                  </li>
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