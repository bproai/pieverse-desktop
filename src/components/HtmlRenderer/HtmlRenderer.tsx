// src/components/HtmlRenderer/HtmlRenderer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Card, Textarea, Switch, Group, Button, Text, Select, Tabs, Code, Menu, ActionIcon, Tooltip } from '@mantine/core';
import { Trash, Copy, Info, Menu as MenuIcon, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './HtmlRenderer.css';

interface HtmlRendererProps {
  content: string;
  className?: string;
  darkMode?: boolean;
  onContentChange?: (content: string) => void;
}

/**
 * Enhanced HTML Renderer with clear instructions and buttons
 * Now with Markdown support
 */
export const HtmlRenderer: React.FC<HtmlRendererProps> = ({ 
  content = '', 
  className = '',
  darkMode = false,
  onContentChange
}) => {
  const [htmlInput, setHtmlInput] = useState<string>(content);
  const [showDataAttributes, setShowDataAttributes] = useState<boolean>(false);
  const [renderMode, setRenderMode] = useState<'html' | 'text-format' | 'json' | 'markdown'>('html');
  const [error, setError] = useState<string | null>(null);
  const [jsonData, setJsonData] = useState<any>(null);
  const [showSource, setShowSource] = useState<boolean>(false);
  const [normalizeNewlines, setNormalizeNewlines] = useState<boolean>(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showInstructions, setShowInstructions] = useState<boolean>(true);

  // Update internal state when content prop changes
  useEffect(() => {
    setHtmlInput(content);
    detectContentType(content);
  }, [content]);

  // When component mounts, detect content type
  useEffect(() => {
    detectContentType(content);
  }, []);

  // Hide instructions when user starts typing
  useEffect(() => {
    if (htmlInput.trim().length > 0) {
      setShowInstructions(false);
    } else {
      setShowInstructions(true);
    }
  }, [htmlInput]);

  // Handle clearing content
  const handleClear = () => {
    setHtmlInput('');
    if (onContentChange) {
      onContentChange('');
    }
    setError(null);
    setJsonData(null);
    // Focus back on the textarea after clearing
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Detect the type of content
  const detectContentType = (content: string) => {
    if (!content || !content.trim()) return;
    
    // Check if it's JSON first
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        // Check if it has html or plain_text properties
        if (parsed.html || parsed.plain_text) {
          setJsonData(parsed);
          setRenderMode('json');
          return;
        }
      }
    } catch (e) {
      // Not JSON, continue checking
    }
    
    // If it contains HTML tags, it's likely HTML
    if (/<[a-z][\s\S]*>/i.test(content)) {
      setRenderMode('html');
      return;
    }
    
    // If it contains Markdown patterns, suggest markdown mode
    if (/#{1,6}\s|\*\*.*\*\*|\*.*\*|`.*`|!\[.*\]\(.*\)|\[.*\]\(.*\)|(?:^|\n)>|(?:^|\n)[-*+]\s|(?:^|\n)\d+\.\s/.test(content)) {
      setRenderMode('markdown');
      return;
    }
    
    // Default to text format
    setRenderMode('text-format');
  };

  // Handle input changes with two-way binding
  const handleInputChange = (newValue: string) => {
    setHtmlInput(newValue);
    detectContentType(newValue);
    setError(null);
    
    // Propagate changes back to parent if callback provided
    if (onContentChange) {
      onContentChange(newValue);
    }
  };

  // Basic sanitization function to protect against XSS
  const sanitizeHtml = (html: string): string => {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/g, '');
  };

  // Process HTML to handle data attributes
  const processHtml = (html: string): string => {
    if (!showDataAttributes) {
      // Remove data attributes if not needed
      return html.replace(/data-\w+="[^"]*"/g, '');
    }
    return html;
  };

  // Handle all newline variations and normalize them
  const normalizeNewlinesInText = (text: string): string => {
    if (!text) return '';
    
    // First replace escaped newlines with a special marker
    let normalized = text.replace(/\\n/g, '\n');
    
    // If enabled, normalize consecutive newlines into paragraph breaks
    if (normalizeNewlines) {
      // Replace sequences of 3 or more newlines with a special separator
      normalized = normalized.replace(/\n{3,}/g, '\n\n---SECTION---\n\n');
      
      // Replace sequences of 2 newlines with paragraph breaks
      normalized = normalized.replace(/\n\n/g, '\n\n');
    }
    
    return normalized;
  };

  // Format text with newlines into HTML
  const formatTextWithNewlines = (text: string): string => {
    if (!text) return '';
    
    // Normalize all newline formats
    const normalized = normalizeNewlinesInText(text);
    
    // Split by newlines
    const lines = normalized.split('\n').map(line => line.trim());
    
    // Process lines into paragraphs and headings
    let formattedHtml = '';
    let isInList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines but preserve section breaks
      if (!line) {
        if (lines[i-1] === '---SECTION---') {
          formattedHtml += '<hr class="section-break"/>';
        }
        continue;
      }
      
      // Skip our special section marker
      if (line === '---SECTION---') {
        continue;
      }
      
      // Check if this could be a heading
      // Headings are usually short, don't end with punctuation, and often follow empty lines
      const isPreviousLineEmpty = i === 0 || !lines[i-1] || lines[i-1] === '---SECTION---';
      const isLikelyHeading = line.length < 100 && 
                              !line.match(/[.,:;!?]$/) && 
                              isPreviousLineEmpty;
      
      if (isLikelyHeading) {
        formattedHtml += `<h3 class="auto-detected-heading">${line}</h3>`;
      } else {
        // Check if this might be a list item
        if (line.match(/^[•\-\*]\s/) || line.match(/^\d+\.\s/)) {
          if (!isInList) {
            // Start a new list
            isInList = true;
            const isOrdered = line.match(/^\d+\.\s/) ? true : false;
            formattedHtml += isOrdered ? '<ol>' : '<ul>';
          }
          
          // Add the list item, stripping the bullet or number
          const itemContent = line.replace(/^[•\-\*]\s/, '').replace(/^\d+\.\s/, '');
          formattedHtml += `<li>${itemContent}</li>`;
        } else {
          // Close any open list
          if (isInList) {
            formattedHtml += lines[i-1].match(/^\d+\.\s/) ? '</ol>' : '</ul>';
            isInList = false;
          }
          
          formattedHtml += `<p>${line}</p>`;
        }
      }
    }
    
    // Close any open list at the end
    if (isInList) {
      formattedHtml += lines[lines.length-1].match(/^\d+\.\s/) ? '</ol>' : '</ul>';
    }
    
    return formattedHtml;
  };

  // Process JSON data to extract the right content
  const processJsonContent = (): string => {
    if (!jsonData) return '';
    
    // Select which field to use
    if (jsonData.html && jsonData.html.trim()) {
      // If the html field contains actual HTML tags
      if (/<[a-z][\s\S]*>/i.test(jsonData.html)) {
        return processHtml(sanitizeHtml(jsonData.html));
      } else {
        // Otherwise treat it as text with newlines
        return formatTextWithNewlines(jsonData.html);
      }
    } else if (jsonData.plain_text) {
      return formatTextWithNewlines(jsonData.plain_text);
    }
    
    return '';
  };

  // Process userStyle tags in the content
  const processUserStyleTags = (content: string): string => {
    // Replace <userStyle>...</userStyle> with spans
    return content.replace(/<userStyle>(.*?)<\/userStyle>/g, 
      (match, p1) => {
        const styleValue = p1.trim();
        const styleClass = styleValue.toLowerCase().replace(/\s+/g, '-');
        return `<span class="user-style-tag user-style-${styleClass}">${styleValue}</span>`;
      }
    );
  };

  // Render content based on the selected mode
  const renderContent = () => {
    try {
      if (!htmlInput || !htmlInput.trim()) {
        return <Text color="dimmed">No content to display</Text>;
      }
      
      if (showSource) {
        // Show the source code regardless of mode
        let sourceContent = '';
        
        switch (renderMode) {
          case 'html':
            sourceContent = processHtml(sanitizeHtml(htmlInput));
            break;
          
          case 'text-format':
            sourceContent = formatTextWithNewlines(htmlInput);
            break;
          
          case 'json':
            sourceContent = processJsonContent();
            break;
            
          case 'markdown':
            sourceContent = htmlInput;
            break;
          
          default:
            sourceContent = htmlInput;
        }
        
        return (
          <div className="source-view">
            <Code block className="html-source">
              {sourceContent}
            </Code>
          </div>
        );
      }
      
      // Render the content according to selected mode
      switch (renderMode) {
        case 'html':
          return (
            <div 
              className={`html-preview ${className} ${darkMode ? 'dark-mode' : ''}`}
              dangerouslySetInnerHTML={{ __html: processHtml(sanitizeHtml(htmlInput)) }} 
            />
          );
        
        case 'text-format':
          return (
            <div 
              className={`html-preview ${className} ${darkMode ? 'dark-mode' : ''}`}
              dangerouslySetInnerHTML={{ __html: formatTextWithNewlines(htmlInput) }} 
            />
          );
        
        case 'json':
          return (
            <div 
              className={`html-preview ${className} ${darkMode ? 'dark-mode' : ''}`}
              dangerouslySetInnerHTML={{ __html: processJsonContent() }} 
            />
          );
          
        case 'markdown':
          // Create a container that will auto-process <userStyle> tags
          const processedHtml = processUserStyleTags(htmlInput);
          
          return (
            <div className={`markdown-preview ${className} ${darkMode ? 'dark-mode' : ''}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={darkMode ? tomorrow : prism}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Allow HTML to pass through for our custom tags
                  p({node, children, ...props}) {
                    // Check if the content contains our userStyle span
                    if (String(children).includes('<span class="user-style-tag')) {
                      return (
                        <p 
                          {...props} 
                          dangerouslySetInnerHTML={{ 
                            __html: String(children).replace(
                              /<span class="user-style-tag.*?<\/span>/g, 
                              match => match
                            )
                          }} 
                        />
                      );
                    }
                    return <p {...props}>{children}</p>;
                  }
                }}
              >
                {htmlInput}
              </ReactMarkdown>
            </div>
          );
        
        default:
          return (
            <div 
              className={`html-preview ${className} ${darkMode ? 'dark-mode' : ''}`}
              dangerouslySetInnerHTML={{ __html: htmlInput }} 
            />
          );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error rendering content';
      setError(errorMessage);
      return <div className="text-red-500">Error rendering content: {errorMessage}</div>;
    }
  };

  // Get rendered content for copying
  const getRenderedContent = (): string => {
    switch (renderMode) {
      case 'html':
        return processHtml(sanitizeHtml(htmlInput));
      
      case 'text-format':
        return formatTextWithNewlines(htmlInput);
      
      case 'json':
        return processJsonContent();
      
      case 'markdown':
        return htmlInput; // Return the original markdown
      
      default:
        return '';
    }
  };

  // Copy content to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(htmlInput);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Copy rendered HTML to clipboard
  const copyRenderedHtml = async () => {
    try {
      await navigator.clipboard.writeText(getRenderedContent());
    } catch (err) {
      console.error('Failed to copy rendered content:', err);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder className="mb-4">
      <div className="space-y-4">
        <Tabs defaultValue="input">
          <Tabs.List>
            <Tabs.Tab value="input">Input</Tabs.Tab>
            <Tabs.Tab value="output">Output</Tabs.Tab>
            <Tabs.Tab value="settings">Settings</Tabs.Tab>
          </Tabs.List>
          
          <Tabs.Panel value="input" pt="xs">
            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <Text size="sm" weight={500}>Content Input</Text>
                {htmlInput && (
                  <Button 
                    size="xs" 
                    variant="subtle" 
                    color="red"
                    onClick={handleClear}
                    leftIcon={<Trash size={12} />}
                  >
                    Clear
                  </Button>
                )}
              </div>
              
              <Textarea
                placeholder="Paste your HTML, Markdown, formatted text, or JSON..."
                value={htmlInput}
                onChange={(e) => handleInputChange(e.currentTarget.value)}
                minRows={8}
                maxRows={20}
                className="mb-2"
                autosize
                ref={textareaRef}
                styles={{
                  input: {
                    backgroundColor: darkMode ? '#25262b' : '#ffffff',
                    color: darkMode ? '#c1c2c5' : '#212529',
                    borderColor: darkMode ? '#373A40' : '#ced4da',
                    fontFamily: renderMode === 'markdown' ? 'monospace' : 'inherit' 
                  }
                }}
              />
              
              {htmlInput && (
                <div className="absolute top-8 right-2">
                  <Menu shadow="md" width={200}>
                    <Menu.Target>
                      <ActionIcon size="lg" variant="light" className="ml-2">
                        <MenuIcon size={16} />
                      </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Item leftSection={<Copy size={14} />} onClick={copyToClipboard}>
                        Copy to Clipboard
                      </Menu.Item>
                      <Menu.Item leftSection={<Trash size={14} />} onClick={handleClear} color="red">
                        Clear Content
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </div>
              )}
              
              {showInstructions && (
                <div className={`mt-2 p-3 rounded border ${darkMode ? 'bg-blue-900 text-blue-200 border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                  <Text size="sm" className="flex items-center">
                    <Info size={14} className="mr-2" />
                    <span>
                      <strong>Tip:</strong> Right-click in the input area to paste content from clipboard. 
                      Use the Clear button above or select all text (Ctrl+A or ⌘+A) then delete to remove content.
                    </span>
                  </Text>
                </div>
              )}
            </div>
            
            <Group position="apart" mt="md">
              <Select
                label="Render Mode"
                value={renderMode}
                onChange={(value: 'html' | 'text-format' | 'json' | 'markdown') => setRenderMode(value)}
                data={[
                  { value: 'html', label: 'HTML' },
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'text-format', label: 'Text with Newlines' },
                  { value: 'json', label: 'JSON with HTML/Text' }
                ]}
                styles={{
                  input: {
                    backgroundColor: darkMode ? '#25262b' : '#ffffff',
                    color: darkMode ? '#c1c2c5' : '#212529',
                    borderColor: darkMode ? '#373A40' : '#ced4da'
                  },
                  label: {
                    color: darkMode ? '#c1c2c5' : '#212529'
                  }
                }}
              />
            </Group>
          </Tabs.Panel>
          
          <Tabs.Panel value="output" pt="xs">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            
            <Group position="apart" mb="md">
              <Switch
                label={renderMode === 'markdown' ? "Show Markdown source" : "Show HTML source"}
                checked={showSource}
                onChange={(e) => setShowSource(e.currentTarget.checked)}
                styles={{
                  label: {
                    color: darkMode ? '#c1c2c5' : '#212529'
                  }
                }}
              />
              
              <Button 
                size="sm" 
                variant="light" 
                onClick={copyRenderedHtml}
              >
                Copy {renderMode === 'markdown' ? 'Rendered Content' : 'Rendered HTML'}
              </Button>
            </Group>
            
            <Card
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              className="render-preview-container transition-colors"
              style={{ 
                backgroundColor: darkMode ? '#1A1B1E' : '#ffffff',
                borderColor: darkMode ? '#373A40' : '#dee2e6'
              }}
            >
              <Text weight={600} size="sm" className="mb-2" style={{ color: darkMode ? '#c1c2c5' : '#212529' }}>
                Rendered Output:
              </Text>
              <div className="p-4 border rounded" style={{ 
                borderColor: darkMode ? '#373A40' : '#dee2e6',
                backgroundColor: darkMode ? '#25262b' : '#ffffff' 
              }}>
                {renderContent()}
              </div>
            </Card>
          </Tabs.Panel>
          
          <Tabs.Panel value="settings" pt="xs">
            <Card 
              shadow="sm" 
              padding="md" 
              radius="md" 
              withBorder
              style={{ 
                backgroundColor: darkMode ? '#1A1B1E' : '#ffffff',
                borderColor: darkMode ? '#373A40' : '#dee2e6'
              }}
            >
              <Text weight={600} size="md" mb="md" style={{ color: darkMode ? '#c1c2c5' : '#212529' }}>
                Renderer Settings
              </Text>
              
              <div className="space-y-4">
                {renderMode === 'html' && (
                  <Switch
                    label="Show data attributes"
                    description="Display data-* attributes in HTML content"
                    checked={showDataAttributes}
                    onChange={(e) => setShowDataAttributes(e.currentTarget.checked)}
                    styles={{
                      label: {
                        color: darkMode ? '#c1c2c5' : '#212529'
                      },
                      description: {
                        color: darkMode ? '#909296' : '#6c757d'
                      }
                    }}
                  />
                )}
                
                {(renderMode === 'text-format' || renderMode === 'json') && (
                  <Switch
                    label="Normalize newlines"
                    description="Convert multiple newlines into paragraph breaks"
                    checked={normalizeNewlines}
                    onChange={(e) => setNormalizeNewlines(e.currentTarget.checked)}
                    styles={{
                      label: {
                        color: darkMode ? '#c1c2c5' : '#212529'
                      },
                      description: {
                        color: darkMode ? '#909296' : '#6c757d'
                      }
                    }}
                  />
                )}
                
                <div className="mt-4">
                  <Text size="sm" weight={500} mb="xs" style={{ color: darkMode ? '#c1c2c5' : '#212529' }}>
                    Content Type Information
                  </Text>
                  <Text size="sm" style={{ color: darkMode ? '#909296' : '#6c757d' }}>
                    Current render mode: <span style={{ fontWeight: 600 }}>{renderMode}</span>
                    {renderMode === 'json' && jsonData && (
                      <>
                        <br />
                        JSON contains: {jsonData.html ? 'HTML content' : ''} 
                        {jsonData.html && jsonData.plain_text ? ' and ' : ''}
                        {jsonData.plain_text ? 'Plain text content' : ''}
                      </>
                    )}
                    {renderMode === 'markdown' && (
                      <>
                        <br />
                        Supports GitHub Flavored Markdown and special &lt;userStyle&gt; tags.
                      </>
                    )}
                  </Text>
                </div>
              </div>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </div>
    </Card>
  );
};

export default HtmlRenderer;