// src/components/HtmlRenderer/HtmlRendererPanel.tsx
import React, { useState } from 'react';
import { Card, Text, Button, Group, Tabs, Divider, Badge, Select, Loader } from '@mantine/core';
import { FileText, Upload, Settings, MousePointer2, Menu as MenuIcon, MessageSquare, Database } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { core } from '@tauri-apps/api';
import HtmlRenderer from './HtmlRenderer';

interface HtmlRendererPanelProps {
  isDark: boolean;
}

export const HtmlRendererPanel: React.FC<HtmlRendererPanelProps> = ({ isDark }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [qaData, setQaData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('preview');
  const [isLoadingQa, setIsLoadingQa] = useState(false);
  const [qaAnswersLoaded, setQaAnswersLoaded] = useState(false);

  // Function to load QA answers only when button is clicked
  const loadQaAnswers = () => {
    setIsLoadingQa(true);
    
    // Use a timeout to ensure UI isn't blocked
    setTimeout(() => {
      core.invoke('sqlite_execute_query', {
        query: `SELECT id as answer_id, answer FROM qa_answers LIMIT 50;`
      })
      .then(result => {
        if (Array.isArray(result) && result.length > 0) {
          // Process the results to ensure IDs are strings and filter out nulls
          const processedData = result
            .filter(item => item && item.answer_id !== null && item.answer !== null)
            .map(item => ({
              ...item,
              answer_id: String(item.answer_id) // Ensure ID is a string
            }));
          
          // Add index to answer_id to ensure uniqueness
          const uniqueData = processedData.map((item, index) => ({
            ...item,
            answer_id: `${item.answer_id}_${index}`
          }));
          
          setQaData(uniqueData);
          setQaAnswersLoaded(true);
          console.log("Loaded QA answers successfully:", uniqueData);
        } else {
          console.log("No QA answers found in database");
        }
      })
      .catch(error => {
        console.log("Error loading QA answers:", error);
      })
      .finally(() => {
        setIsLoadingQa(false);
      });
    }, 100);
  };

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
        const fileContent = await readTextFile(filePath);
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
  
  // Handle selecting an answer
  const handleQaSelect = (id: string) => {
    const selectedItem = qaData.find(item => item.answer_id === id);
    if (selectedItem) {
      setHtmlContent(selectedItem.answer);
      setActiveTab('preview');
    }
  };

  // Create select options from the QA data
  const getSelectOptions = () => {
    if (!qaData || qaData.length === 0) return [];
    
    // Create options with guaranteed unique string values
    return qaData
      .filter(item => item && item.answer_id)
      .map((item, index) => ({
        value: item.answer_id,
        label: `Answer ${index + 1}`
      }));
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
          Document Renderer
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
          
          {/* Button to load QA answers on demand */}
          {!qaAnswersLoaded && (
            <Button
              leftIcon={<Database size={16} />}
              onClick={loadQaAnswers}
              variant="light"
              color="teal"
              size="sm"
              loading={isLoadingQa}
            >
              Load QA Answers
            </Button>
          )}
        </Group>
        
        {/* QA Answers dropdown - only shown if loaded */}
        {qaData.length > 0 && (
          <Group mb="md">
            <Select
              label="Load QA Answer"
              placeholder="Select an answer"
              icon={<MessageSquare size={16} />}
              data={getSelectOptions()}
              onChange={handleQaSelect}
              style={{ width: '100%' }}
              styles={{
                input: {
                  backgroundColor: isDark ? '#25262b' : '#ffffff',
                  color: isDark ? '#c1c2c5' : '#212529',
                  borderColor: isDark ? '#373A40' : '#ced4da'
                },
                label: {
                  color: isDark ? '#c1c2c5' : '#212529'
                }
              }}
            />
          </Group>
        )}
        
        {fileName && (
          <Group>
            <Badge color="blue" variant="light" className="flex items-center">
              <FileText size={14} className="mr-1" />
              <span>{fileName}</span>
            </Badge>
          </Group>
        )}
      </Card>
      
      <Tabs value={activeTab} onTabChange={setActiveTab}>
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
                    Click "Load QA Answers" to access answers from database
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Select an answer from the dropdown to load it
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