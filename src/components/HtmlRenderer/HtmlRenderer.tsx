// src/components/HtmlRenderer/HtmlRenderer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Card, Textarea, Switch, Group, Button, Text, Select, Tabs, Code, Menu, ActionIcon } from '@mantine/core';
import { Trash, Copy, Info, Menu as MenuIcon, Settings, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './HtmlRenderer.css';
import { core } from '@tauri-apps/api'; // Using core.invoke for commands
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { refreshCurrentBucket } from '../S3Lite/S3LitePanel';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { Notifications } from '@mantine/notifications';

interface HtmlRendererProps {
  content: string;
  className?: string;
  darkMode?: boolean;
  onContentChange?: (content: string) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  url?: string; // New prop for URL
  currentBucket?: string;
}

/**
 * Enhanced HTML Renderer with clear instructions and buttons
 * Now with Markdown support
 */
export const HtmlRenderer: React.FC<HtmlRendererProps> = ({ 
  content = '', 
  className = '',
  darkMode = false,
  onContentChange,
  activeTab,
  setActiveTab,
  url = '', // Default to empty string
  currentBucket = ''
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
  const [internalTab, setInternalTab] = useState("input");
  const currentTab = activeTab || internalTab;


  const [imageMenu, setImageMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    image: null as HTMLImageElement | null
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const handleKeyDown = (e) => {
      // Check for Cmd+V or Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        console.log('Paste shortcut detected directly on textarea');
        // Since this is detected directly on the textarea, you could just let the 
        // default behavior happen and then update your state after
        setTimeout(() => {
          setHtmlInput(textarea.value);
          if (onContentChange) {
            onContentChange(textarea.value);
          }
        }, 0);
      }
    };
    
    textarea.addEventListener('keydown', handleKeyDown);
    return () => {
      textarea.removeEventListener('keydown', handleKeyDown);
    };
  }, [textareaRef.current]);

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

  // Add this function to handle right-clicks on images
  const handleImageContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    
    // Check if the click was on an image
    if (target.tagName === 'IMG') {
      // Prevent default browser context menu
      event.preventDefault();
      
      // Show our custom menu
      setImageMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        image: target as HTMLImageElement
      });
    }
  };

  // Function to handle downloading the image
  const handleDownloadImage = async () => {
    if (!imageMenu.image) return;
    
    try {
      // Get image source
      let imageSrc = imageMenu.image.src;
      
      // If it's a remote URL, fetch and convert to data URL
      if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
        try {
          const response = await fetch(imageSrc);
          console.log("Response content type:", response.headers.get("content-type"));

          const blob = await response.blob();
          console.log("Fetched blob type:", blob.type);
                    
          // Convert to base64
          const reader = new FileReader();
          imageSrc = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error("Failed to fetch remote image:", error);
        }
      }
      
      // Generate filename from alt text or path
      const altText = imageMenu.image.alt || '';
      const pathParts = imageMenu.image.src.split('/');
      const filename = altText 
        ? `${altText.replace(/\s+/g, '_').toLowerCase()}`
        : (pathParts[pathParts.length - 1] || 'image.png');
      
      console.log("Image filename:", filename);
      // Call Tauri command to download the image using core.invoke
      await core.invoke('download_image', {
        imageData: imageSrc,
        filename
      });
    } catch (error: any) {
      if (error&&error === "Save operation cancelled") {
        console.log(error);
      } else {
        console.error("Error downloading image:", error);
      }
    }
    
    // Close the menu
    setImageMenu(prev => ({ ...prev, visible: false }));
  };

  // Add this to close the menu when clicking outside
  const handleCloseMenu = () => {
    setImageMenu(prev => ({ ...prev, visible: false }));
  };


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
              onContextMenu={handleImageContextMenu}
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
              onContextMenu={handleImageContextMenu}
            />
          );
          
        case 'markdown':
          // Create a container that will auto-process <userStyle> tags
          const processedHtml = processUserStyleTags(htmlInput);
          
          return (
            <div className={`markdown-preview ${className} ${darkMode ? 'dark-mode' : ''}`}
              onContextMenu={handleImageContextMenu}>
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

    // Add a new utility function to convert HTML to Markdown
  const htmlToMarkdown = (html: string): string => {
    try {
      // Simple conversion of common HTML elements to Markdown
      let markdown = html
        // Replace headers
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
        .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
        .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
        .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
        
        // Replace paragraphs
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        
        // Replace line breaks
        .replace(/<br\s*\/?>/gi, '\n')
        
        // Replace bold and italic
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
        .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
        
        // Replace links
        .replace(/<a[^>]*href="(.*?)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        
        // Replace unordered lists
        .replace(/<ul[^>]*>(.*?)<\/ul>/gis, '$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
        
        // Replace ordered lists
        .replace(/<ol[^>]*>(.*?)<\/ol>/gis, '$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '1. $1\n')
        
        // Replace code blocks
        .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        
        // Replace blockquotes
        .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '> $1\n\n')
        
        // Replace horizontal rules
        .replace(/<hr[^>]*>/gi, '---\n\n')
        
        // Handle images
        .replace(/<img[^>]*src="(.*?)"[^>]*alt="(.*?)"[^>]*>/gi, '![$2]($1)')
        .replace(/<img[^>]*alt="(.*?)"[^>]*src="(.*?)"[^>]*>/gi, '![$1]($2)')
        .replace(/<img[^>]*src="(.*?)"[^>]*>/gi, '![]($1)');
        
      // Remove remaining HTML tags
      markdown = markdown.replace(/<[^>]*>/g, '');
      
      // Decode HTML entities
      markdown = markdown
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
      
      // Normalize spaces and newlines
      markdown = markdown
        .replace(/\n{3,}/g, '\n\n')  // Normalize excessive newlines
        .trim();
      
      return markdown;
    } catch (error) {
      console.error('Error converting HTML to Markdown:', error);
      return html; // Return original content if conversion fails
    }
  };

  const generateTimestamp = (): string => {
    const now = new Date();
    return now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  };
  

  const saveImageToBucket = async () => {
    if (!imageMenu.image || !currentBucket) return;
    
    try {
      // Get image source
      let imageSrc = imageMenu.image.src;
      
      // If it's a remote URL, fetch and convert to data URL
      if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
        try {
          const response = await fetch(imageSrc);
          console.log("Response content type:", response.headers.get("content-type"));
  
          const blob = await response.blob();
          console.log("Fetched blob type:", blob.type);
                  
          // Convert to base64
          const reader = new FileReader();
          imageSrc = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error("Failed to fetch remote image:", error);
        }
      }
      
      // Extract a reasonable filename
      let fileName = 'image.png'; // Default name
      
      // Try to get a good filename from alt text first
      const altText = imageMenu.image.alt || '';
      if (altText && altText.length < 50) {
        fileName = `${altText.replace(/\s+/g, '_').toLowerCase()}`;
        // Add extension if missing
        if (!fileName.includes('.')) {
          fileName += '.png';
        }
      } else {
        // Try to extract from URL path
        let urlPath = '';
        
        // Handle data URLs and normal URLs differently
        if (imageMenu.image.src.startsWith('data:')) {
          // For data URLs, use the default name
          fileName = 'image.png';
        } else if (imageMenu.image.src.startsWith('s3://')) {
          // For tauri URLs, get the last part
          const s3Parts = imageMenu.image.src.split('/');
          if (s3Parts.length > 1) {
            fileName = s3Parts[s3Parts.length - 1];
          }
        } else {
          // For standard URLs
          try {
            const url = new URL(imageMenu.image.alt);
            urlPath = url.pathname;
          } catch (e) {
            // If URL parsing fails, just use the raw src
            urlPath = imageMenu.image.src;
          }
          
          // Extract filename from path
          const pathParts = urlPath.split('/').filter(part => part.length > 0);
          if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            
            // Check if the last part looks like a filename (has an extension or no weird chars)
            if (
              lastPart.includes('.') || 
              !/[?#&=]/.test(lastPart)
            ) {
              fileName = lastPart;
              
              // Remove query parameters if any
              if (fileName.includes('?')) {
                fileName = fileName.split('?')[0];
              }
            }
          }
        }
      }
      
      // Ensure the filename has a valid extension
    // Check if the filename is "generated_image" (ignoring extensions)
    // If so, add a timestamp suffix (YYYYMMDD_HHMMSS)
    if (fileName.match(/^generated_image(\.[a-zA-Z0-9]+)?$/)) {
      // Extract extension if present
      const extension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
      // Generate timestamp
      const timestamp = generateTimestamp();
      // Create new filename with timestamp
      fileName = `generated_image_${timestamp}${extension}`;
      console.log(`Added timestamp to generated_image: ${fileName}`);
    }
    
    // Ensure the filename has a valid extension
    if (!fileName.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) {
      // If no valid extension, add .png as default
      fileName += '.png';
    }
      
      // // Prompt user to confirm or change the filename
      // const userFileName = await save({
      //   title: `Save to Bucket ${currentBucket}`,
      //   filters: [{
      //     name: 'Image Files',
      //     extensions: ['png', 'jpg', 'gif', 'webp', 'svg', 'bmp']
      //   }],
      //   defaultPath: fileName,
      // });

      const userFileName = fileName;
      
      console.log("userFileName", userFileName)
      // If user cancels, abort
      if (!userFileName) {
        return;
      }
      
      // Final filename - ensure it has an extension
      const finalFileName = userFileName.includes('.') 
        ? userFileName 
        : `${userFileName}.png`;
      
      console.log(`Saving image to bucket: ${currentBucket}, filename: ${finalFileName}`);
      
      // Extract base64 data - strip the prefix if it exists
      let base64Data = imageSrc;
      
      if (base64Data.startsWith('data:')) {
        base64Data = base64Data.split(',')[1];
      }
      
      // Determine the mime type
      let mimeType = 'image/png'; // Default
      
      if (imageSrc.startsWith('data:')) {
        const mimeMatch = imageSrc.match(/data:(.*?);/);
        if (mimeMatch && mimeMatch[1]) {
          mimeType = mimeMatch[1];
        }
      } else {
        // Try to determine from file extension
        const ext = finalFileName.split('.').pop()?.toLowerCase() || '';
        switch (ext) {
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg';
            break;
          case 'png':
            mimeType = 'image/png';
            break;
          case 'gif':
            mimeType = 'image/gif';
            break;
          case 'webp':
            mimeType = 'image/webp';
            break;
          case 'svg':
            mimeType = 'image/svg+xml';
            break;
          case 'bmp':
            mimeType = 'image/bmp';
            break;
        }
      }
      
      // Call the S3Lite upload function
      await core.invoke('s3_upload', {
        bucket: currentBucket,
        key: finalFileName,
        dataBase64: base64Data,
        mimeType: mimeType
      });
  
      // Refresh the S3LitePanel
      if (typeof refreshCurrentBucket === 'function') {
        await refreshCurrentBucket();
      }
      
      console.log(`Image saved successfully to bucket "${currentBucket}" as "${finalFileName}"`);
      
      // Show success notification
      Notifications.show({
        title: 'Image Saved',
        message: `Saved to "${currentBucket}" as "${finalFileName}"`,
        color: 'green'
      });
    } catch (error) {
      console.error("Error saving image to bucket:", error);
      
      // Show error notification
      notifications.show({
        title: 'Save Failed',
        message: `Failed to save image: ${error}`,
        color: 'red'
      });
    }
    
    // Close the menu
    setImageMenu(prev => ({ ...prev, visible: false }));
  };


  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder className="mb-4">
      <div className="space-y-4">
      <Tabs 
        value={currentTab}
        onChange={(value) => {
          setInternalTab(value);
          if (setActiveTab) {
            setActiveTab(value);
          }
        }}
      >
          <Tabs.List>
            <Tabs.Tab value="input">Input</Tabs.Tab>
            <Tabs.Tab value="output">Output</Tabs.Tab>
            <Tabs.Tab value="settings">Settings</Tabs.Tab>
          </Tabs.List>
          
          <Tabs.Panel value="input" pt="xs">
            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <Text size="sm" weight={500}>Content Input</Text>
                {/* Display URL if it exists */}
                {url && (
                  <Text size="sm" className="truncate max-w-md">
                    <a href={url} target="_blank" rel="noopener noreferrer" 
                      className="text-blue-500 hover:underline flex items-center">
                      <ExternalLink size={12} className="mr-1" />
                      {url}
                    </a>
                  </Text>
                )}
                <Group spacing="xs">
                  {/* Add the paste button here */}
                  <Button 
                    size="xs" 
                    variant="light" 
                    onClick={async () => {
                      try {
                        const text = await readText();
                        if (textareaRef.current && text) {
                          const textarea = textareaRef.current;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const value = textarea.value;
                          
                          const newValue = value.substring(0, start) + text + value.substring(end);
                          setHtmlInput(newValue);
                          if (onContentChange) {
                            onContentChange(newValue);
                          }
                          
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(start + text.length, start + text.length);
                          }, 0);
                        }
                      } catch (err) {
                        console.error('Failed to paste:', err);
                      }
                    }}
                  >
                    Paste
                  </Button>
                  
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
                </Group>
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
                        <strong>Tip:</strong> Use the Paste button or Cmd+V (Ctrl+V) to paste content. 
                        Use the Clear button or select all text (Ctrl+A or ⌘+A) then delete to remove content.
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

              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  // Function to extract text from the rendered content
                  const contentContainer = document.querySelector('.render-preview-container .rounded');
                  if (contentContainer) {
                    const textContent = contentContainer.textContent || '';
                    navigator.clipboard.writeText(textContent)
                      .then(() => {
                        console.log('Copied output box text content');
                      })
                      .catch(err => {
                        console.error('Failed to copy output box content:', err);
                      });
                  }
                }}
              >
                Copy Output Text
              </Button>

              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  let markdownContent;
                  
                  // If we're already in markdown mode, use the original content
                  if (renderMode === 'markdown') {
                    markdownContent = htmlInput;
                  } else {
                    // For HTML, JSON, or text-format modes, convert the rendered HTML to Markdown
                    const container = document.querySelector('.render-preview-container .rounded');
                    if (container) {
                      const renderedHtml = container.innerHTML;
                      markdownContent = htmlToMarkdown(renderedHtml);
                    } else {
                      markdownContent = htmlToMarkdown(getRenderedContent());
                    }
                  }
                  
                  // Copy to clipboard
                  if (markdownContent) {
                    navigator.clipboard.writeText(markdownContent)
                      .then(() => {
                        console.log('Copied as Markdown');
                      })
                      .catch(err => {
                        console.error('Failed to copy as Markdown:', err);
                      });
                  }
                }}
              >
                Copy as Markdown
              </Button>



              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  // Copy rendered content as rich text (HTML)
                  const contentContainer = document.querySelector('.render-preview-container .rounded');
                  if (contentContainer) {
                    // Create a temporary element to hold the formatted content
                    const tempElem = document.createElement('div');
                    tempElem.innerHTML = contentContainer.innerHTML;
                    
                    // Apply basic styling for better appearance when pasted
                    tempElem.style.fontFamily = 'inherit';
                    tempElem.style.fontSize = 'inherit';
                    tempElem.style.color = 'inherit';
                    
                    // Select the element content
                    document.body.appendChild(tempElem);
                    const range = document.createRange();
                    range.selectNode(tempElem);
                    const selection = window.getSelection();
                    
                    if (selection) {
                      selection.removeAllRanges();
                      selection.addRange(range);
                      
                      try {
                        // Execute the copy command to copy the selected HTML
                        document.execCommand('copy');
                        console.log('Copied as rich text');
                      } catch (err) {
                        console.error('Failed to copy as rich text:', err);
                        // Fallback to copying as HTML
                        navigator.clipboard.writeText(tempElem.innerHTML)
                          .then(() => console.log('Copied as HTML (fallback)'))
                          .catch(err => console.error('Clipboard fallback failed:', err));
                      } finally {
                        // Clean up
                        selection.removeAllRanges();
                        document.body.removeChild(tempElem);
                      }
                    }
                  }
                }}
                title="Copy with formatting for pasting into Word, email, etc."
              >
                Copy as Rich Text
              </Button>

              {/* Add URL display after Copy as Rich Text */}
              {url && (
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-500 hover:underline text-sm ml-2"
                  title={url}
                >
                  <ExternalLink size={14} className="mr-1" />
                  <span className="truncate max-w-xs">{url}</span>
                </a>
              )}

              


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

      {imageMenu.visible && (
      <>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 998
          }}
          onClick={handleCloseMenu}
        />
        <div
          style={{
            position: 'fixed',
            zIndex: 999,
            left: imageMenu.x,
            top: imageMenu.y,
            backgroundColor: darkMode ? '#1A1B1E' : 'white',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button 
                size="xs" 
                variant="light" 
                leftIcon={<span>💾</span>}
                onClick={handleDownloadImage}
              >
                Download Image
              </Button>
              
              {currentBucket && (
                <Button 
                  size="xs" 
                  variant="light" 
                  leftIcon={<span>📤</span>}
                  onClick={saveImageToBucket}
                >
                  Save to Bucket {currentBucket}
                </Button>
              )}
            </div>
        </div>
      </>
    )}
    </Card>
  );
};

export default HtmlRenderer;