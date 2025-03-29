// src/components/HtmlRenderer/HtmlRendererPanel.tsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Button, Group, Tabs, Divider, Badge, Select, Loader, TextInput } from '@mantine/core';
import { FileText, Upload, Settings, MousePointer2, Menu as MenuIcon, MessageSquare, Database, ChevronDown, Search, X, RefreshCw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { core } from '@tauri-apps/api';
import HtmlRenderer from './HtmlRenderer';
import { notifications } from '@mantine/notifications';

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
  const [newestTimestamp, setNewestTimestamp] = useState<string | null>(null);
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);
  const [hasMoreRecords, setHasMoreRecords] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');
  const [isFiltering, setIsFiltering] = useState<boolean>(false);
  const [hasNewRecords, setHasNewRecords] = useState<boolean>(false);
  const pageSize = 50; // Records per page

  // Check for new records periodically
  useEffect(() => {
    if (!qaAnswersLoaded || !newestTimestamp) return;
    
    const checkNewRecordsInterval = setInterval(() => {
      checkForNewRecords();
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(checkNewRecordsInterval);
  }, [qaAnswersLoaded, newestTimestamp]);
  
  // Function to check for new records
  const checkForNewRecords = () => {
    if (!newestTimestamp) return;
    
    const whereClause = isFiltering && filterText 
      ? `WHERE (LOWER(q.question) LIKE LOWER('%${filterText}%') OR LOWER(a.answer) LIKE LOWER('%${filterText}%'))` 
      : '';
    
    const timeClause = `${whereClause ? 'AND' : 'WHERE'} q.timestamp > '${newestTimestamp}'`;
    
    core.invoke('sqlite_execute_query', {
      query: `
        SELECT COUNT(*) as new_count
        FROM qa_answers a
        LEFT JOIN qa_questions q ON a.question_id = q.id
        ${whereClause}
        ${timeClause}
      `
    }).then(result => {
      if (Array.isArray(result) && result.length > 0) {
        const newCount = result[0]?.new_count || 0;
        if (newCount > 0) {
          setHasNewRecords(true);
          console.log(`${newCount} new records available`);
          notifications.show({
            title: 'New Records Available',
            message: `${newCount} new records have been added. Click to load.`,
            color: 'blue',
            onClick: () => {
              loadNewerQaAnswers();
              setHasNewRecords(false);
            }
          });

        }
      }
    }).catch(error => {
      console.error("Error checking for new records:", error);
    });
  };

  // Function to load QA answers with cursor-based pagination and filtering
  const loadQaAnswers = (direction = 'initial', filter = '') => {
    setIsLoadingQa(true);
    
    // Build WHERE clause for filtering with case-insensitive matching
    let whereClause = filter 
      ? `WHERE (LOWER(q.question) LIKE LOWER('%${filter}%') OR LOWER(a.answer) LIKE LOWER('%${filter}%'))` 
      : '';
    
    // Add timestamp condition based on direction
    let timeClause = '';
    if (direction === 'older' && oldestTimestamp) {
      timeClause = `${whereClause ? 'AND' : 'WHERE'} q.timestamp < '${oldestTimestamp}'`;
    } else if (direction === 'newer' && newestTimestamp) {
      timeClause = `${whereClause ? 'AND' : 'WHERE'} q.timestamp > '${newestTimestamp}'`;
    }
    
    // Use a timeout to ensure UI isn't blocked
    setTimeout(() => {
      core.invoke('sqlite_execute_query', {
        query: `
          SELECT 
            a.id as answer_id,
            a.answer,
            q.question,
            q.id as question_id,
            q.platform,
            q.timestamp,
            (SELECT COUNT(*) FROM qa_answers a 
             LEFT JOIN qa_questions q ON a.question_id = q.id
             ${whereClause}) as total_count
          FROM qa_answers a
          LEFT JOIN qa_questions q ON a.question_id = q.id
          ${whereClause}
          ${timeClause}
          ORDER BY q.timestamp DESC
          LIMIT ${pageSize};
        `
      })
      .then(result => {
        if (Array.isArray(result) && result.length > 0) {
          // Get total count from first record
          const totalCount = result[0]?.total_count || 0;
          
          // Get timestamps to track position in result set
          const timestamps = result.map(item => item.timestamp).filter(Boolean);
          const resultNewestTimestamp = timestamps.length > 0 ? timestamps[0] : null;
          const resultOldestTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
          
          // Check if we have more records to load
          const fetchedCount = direction === 'initial' 
            ? result.length 
            : qaData.length + result.length;
          setHasMoreRecords(totalCount > fetchedCount);
          
          // Process the results to ensure IDs are strings and filter out nulls
          const processedData = result
            .filter(item => item && item.answer_id !== null && item.answer !== null)
            .map(item => {
              // Truncate question and answer if too long (more than 70 chars)
              const truncatedQuestion = item.question && item.question.length > 70 
                ? item.question.substring(0, 70) + '...' 
                : item.question || '';
              
              const truncatedAnswer = item.answer && item.answer.length > 70
                ? item.answer.substring(0, 70) + '...'
                : item.answer;
              
              return {
                ...item,
                answer_id: String(item.answer_id), // Ensure ID is a string
                truncatedQuestion,
                truncatedAnswer
              };
            });
          
          // Generate unique IDs for each item
          const uniqueData = processedData.map((item, index) => ({
            ...item,
            answer_id: `${item.answer_id}_${direction}_${index}`
          }));
          
          // Update the data based on direction
          if (direction === 'initial') {
            setQaData(uniqueData);
            // Set newest timestamp from the first result
            if (resultNewestTimestamp) {
              setNewestTimestamp(resultNewestTimestamp);
            }
          } else if (direction === 'older') {
            setQaData(prev => [...prev, ...uniqueData]);
          } else if (direction === 'newer') {
            setQaData(prev => [...uniqueData, ...prev]);
            // Update newest timestamp if newer records were loaded
            if (resultNewestTimestamp) {
              setNewestTimestamp(resultNewestTimestamp);
            }
          }
          
          // Set oldest timestamp from the last result
          if (resultOldestTimestamp) {
            setOldestTimestamp(resultOldestTimestamp);
          }
          
          setQaAnswersLoaded(true);
          setHasNewRecords(false);
          console.log(`Loaded QA answers (${direction}) successfully:`, uniqueData);
        } else {
          console.log("No QA answers found in database or end of results reached");
          setHasMoreRecords(false);
          
          // If filtering resulted in no results, show a message
          if (filter && direction === 'initial') {
            setQaData([]);
          }
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

  // Function to load more (older) records
  const loadMoreQaAnswers = () => {
    loadQaAnswers('older', isFiltering ? filterText : '');
  };
  
  // Function to load newer records
  const loadNewerQaAnswers = () => {
    loadQaAnswers('newer', isFiltering ? filterText : '');
  };
  
  // Function to refresh all data
  const refreshQaAnswers = () => {
    setNewestTimestamp(null);
    setOldestTimestamp(null);
    loadQaAnswers('initial', isFiltering ? filterText : '');
  };
  
  // Apply filter to loaded data
  const applyFilter = () => {
    if (filterText.trim()) {
      setIsFiltering(true);
      setNewestTimestamp(null);
      setOldestTimestamp(null);
      loadQaAnswers('initial', filterText.trim());
    }
  };
  
  // Clear filter and reload data
  const clearFilter = () => {
    setFilterText('');
    setIsFiltering(false);
    setNewestTimestamp(null);
    setOldestTimestamp(null);
    loadQaAnswers('initial', '');
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
    
    // Create options with guaranteed unique string values and display both truncated question and answer
    return qaData
      .filter(item => item && item.answer_id)
      .map((item, index) => {
        // Try to parse the answer and extract plain_text if available
        let displayAnswer = item.truncatedAnswer;
        try {
          // Check if the answer string looks like JSON
          if (item.answer && item.answer.trim().startsWith('{') && item.answer.includes('plain_text')) {
            const parsedAnswer = JSON.parse(item.answer);
            if (parsedAnswer && parsedAnswer.plain_text) {
              // Create a new truncated answer from the plain_text
              const plainText = parsedAnswer.plain_text;
              displayAnswer = plainText.length > 70 
                ? plainText.substring(0, 70) + '...' 
                : plainText;
            }
          }
        } catch (e) {
          // Not valid JSON or no plain_text property, use the original truncated answer
        }
        
        // Format the timestamp (assuming it's in the format from your screenshot)
        const timestamp = item.timestamp || "";
        const formattedDate = timestamp ? `[${timestamp.substring(0, 16)}] ` : "";
        
        return {
          value: item.answer_id,
          label: item.truncatedQuestion 
            ? `${formattedDate}Q: ${item.truncatedQuestion} - A: ${displayAnswer}`
            : `${formattedDate}Answer ${index + 1}: ${displayAnswer}`
        };
      });
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
              onClick={() => loadQaAnswers('initial')}
              variant="light"
              color="teal"
              size="sm"
              loading={isLoadingQa}
            >
              Load Prompt & Answer Database
            </Button>
          )}
        </Group>
        
        {/* QA Answers dropdown - only shown if loaded */}
        {qaData.length > 0 && (
          <div style={{ width: '100%' }}>
            <Group mb="md" position="apart">
              <Select
                label="Load Prompt & Answer Database"
                placeholder="Select a Q&A pair"
                icon={<MessageSquare size={16} />}
                data={getSelectOptions()}
                onChange={handleQaSelect}
                style={{ width: '90%' }}
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
              
              <Button
                variant="subtle"
                size="xs"
                onClick={refreshQaAnswers}
                title="Refresh Database"
                style={{ marginTop: '22px' }}
              >
                <RefreshCw size={16} />
              </Button>
            </Group>
            
            {/* New Records Notification */}
            {hasNewRecords && (
              <Group mb="md" position="center">
                <Button
                  variant="light"
                  size="xs"
                  color="blue"
                  onClick={loadNewerQaAnswers}
                >
                  Load New Records
                </Button>
              </Group>
            )}
            
            {/* Filter controls */}
            <Group mb="md">
              <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
                <TextInput
                  placeholder="Filter by keyword..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.currentTarget.value)}
                  icon={<Search size={14} />}
                  rightSection={
                    filterText && 
                    <div style={{ cursor: 'pointer' }} onClick={() => setFilterText('')}>
                      <X size={14} />
                    </div>
                  }
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      backgroundColor: isDark ? '#25262b' : '#ffffff',
                      color: isDark ? '#c1c2c5' : '#212529',
                      borderColor: isDark ? '#373A40' : '#ced4da'
                    }
                  }}
                  autoComplete="off"
                  spellCheck="false"
                  autoCorrect="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      applyFilter();
                    }
                  }}
                />
                <Button
                  variant="light"
                  size="xs"
                  onClick={applyFilter}
                  disabled={!filterText.trim()}
                >
                  Search
                </Button>
                {isFiltering && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={clearFilter}
                    color="gray"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </Group>
            
            {isFiltering && (
              <Group mb="md">
                <Badge color="blue">
                  Filtered results: "{filterText}"
                </Badge>
              </Group>
            )}
            
            {/* Load More button */}
            {hasMoreRecords && (
              <Group position="center" mb="md">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={loadMoreQaAnswers}
                  loading={isLoadingQa}
                  leftIcon={<ChevronDown size={14} />}
                >
                  Load More Records
                </Button>
                <Text size="xs" color="dimmed">
                  {qaData.length} records loaded {isFiltering ? "(filtered)" : ""}
                </Text>
              </Group>
            )}
          </div>
        )}
        
        {qaAnswersLoaded && qaData.length === 0 && isFiltering && (
          <Text color="dimmed" align="center" size="sm" mt="md" mb="md">
            No results found for "{filterText}". Try a different search term.
          </Text>
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
      
      <Tabs 
  defaultValue="preview" // Add a default value
  value={activeTab} 
  onChange={setActiveTab}
  style={{ flex: 1, display: 'flex', flexDirection: 'column' }} // Add proper styling
>
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
                    Click "Load Prompt & Answer Database" to access answers from database
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Select an answer from the dropdown to load it
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Use the search box to filter answers by keywords
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Click the refresh button to check for new entries
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
                  Content Export:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    "Copy Source" - Copy the raw HTML/Markdown content
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    "Copy as Text" - Extract only the plain text without formatting
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    "Copy as Rich Text" - Preserve formatting when pasting into Word, email, etc.
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    "Copy as Markdown" - Convert content to Markdown format
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Right-click on images to download them directly
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
                    Markdown: GitHub Flavored Markdown with code syntax highlighting
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
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Show HTML source: View raw HTML instead of rendered content
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
                  Database Features:
                </Text>
                <ul className="list-disc pl-5 mt-1">
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Pagination: Load additional records with "Load More Records"
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Search: Filter entries by text in questions or answers
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    New records: Notifications appear when new entries are added
                  </li>
                  <li className="text-sm" style={{ color: isDark ? '#ADB5BD' : '#6c757d' }}>
                    Refresh: Update the database contents with latest entries
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
                  <li className="text-sm" style={{ color: isDark ? '#909296' : '#6c757d' }}>
                    Enter: Apply filter when search box is focused
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