// src/components/VSCodeIntegration/VSCodeIntegrationPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  NumberInput,
  Stack, 
  Alert, 
  Badge, 
  Code,
  Tabs,
  Tooltip,
  ActionIcon,
  Collapse,
  Checkbox
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Code as CodeIcon, RefreshCw, CheckCircle, MessageSquare, FileCode, Eraser, X, Folder, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import VSCodeChat from './VSCodeChat';
import VSCodeDiagnosticsPanel from './VSCodeDiagnosticsPanel';
import VSCodeTerminalPanel from './VSCodeTerminalPanel';
import Editor, { loader } from '@monaco-editor/react';
import { Clipboard } from 'lucide-react'; // Add to your existing lucide-react imports
import { applyPatch, parsePatch, createPatch } from 'diff';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { isUnifiedDiff, parseAiSuggestion, extractFilePathFromDiff, convertUnifiedDiffToAiDiff } from './diffParser';


loader.config({
  paths: {
    vs: './monaco-editor/vs'
  }
});

const getLanguageFromExtension = (ext: string): string => {
  switch (ext.toLowerCase()) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
};

interface VSCodeStatus {
  isRunning: boolean;
  port: number;
}

interface CodeDiffRequest {
  originalFile: string;
  suggestedContent: string;
  description: string;
}

const VSCodeIntegrationPanel: React.FC = () => {
  const [port, setPort] = useState<number>(3001);
  const [status, setStatus] = useState<VSCodeStatus>({ isRunning: false, port: 3001 });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('diff');
  
  // Test diff parameters
  const [originalFile, setOriginalFile] = useState<string>('');
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [description, setDescription] = useState<string>('Suggested change');

  const [isConnectionOpen, setIsConnectionOpen] = useState(true);

  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');

  const [statusInfo, setStatusInfo] = useState<string | null>(null);

  const [showNotifications, setShowNotifications] = useState<boolean>(true);


  const handleParseSuggestion = async () => {
    setLoading(true);
    
    try {
      // Use Tauri's clipboard-manager plugin instead of browser API
      const clipboardText = await readText();
      
      if (!clipboardText) {
        showNotificationIfEnabled(
          'Error',
          'Clipboard is empty',
          'red'
        );
        setLoading(false);
        return;
      }
      
      console.log("Starting to parse clipboard text");
      
      // First, check if it's a text-pattern AI suggestion
      const parsedAiSuggestion = parseAiSuggestion(clipboardText);
      
      if (parsedAiSuggestion) {
        console.log("Detected text-based AI suggestion format with", parsedAiSuggestion.fromCode.length, "code blocks");
        
        // Set description if available
        if (parsedAiSuggestion.description) {
          setDescription(parsedAiSuggestion.description);
        }
        
        // If we have a file path, try to load and patch the file
        if (parsedAiSuggestion.filePath) {
          setOriginalFile(parsedAiSuggestion.filePath);
          
          // Load the original file
          const fileContent = await findAndLoadFile(parsedAiSuggestion.filePath);
          if (!fileContent) {
            showNotificationIfEnabled(
              'Error',
              'Could not load the original file',
              'red'
            );
            // Still set the suggested content to the "to" code from the first hunk
            if (parsedAiSuggestion.toCode.length > 0) {
              setSuggestedContent(parsedAiSuggestion.toCode[0]);
            }
            setLoading(false);
            return;
          }
          
          console.log("File loaded successfully, length:", fileContent.length);
          
          // Apply each hunk in order
          let modifiedContent = fileContent;
          let successCount = 0;
          
          for (let i = 0; i < parsedAiSuggestion.fromCode.length; i++) {
            const fromCode = parsedAiSuggestion.fromCode[i];
            const toCode = parsedAiSuggestion.toCode[i];
            
            console.log(`Processing hunk ${i+1} of ${parsedAiSuggestion.fromCode.length}`);
            console.log(`From code: ${fromCode.substring(0, 50)}...`);
            
            // First try exact matching
            let foundMatch = false;
            if (modifiedContent.includes(fromCode)) {
              console.log(`Found exact match for hunk ${i+1}`);
              // Simple string replacement for exact matches
              modifiedContent = modifiedContent.replace(fromCode, toCode);
              foundMatch = true;
              successCount++;
            } 
            // If exact match fails, try normalized matching
            else {
              console.log("No exact match, trying normalized matching");
              
              // More lenient normalized matching that ignores whitespace and comments
              const normalizedContent = normalizeCode(modifiedContent);
              const normalizedFromCode = normalizeCode(fromCode);
              
              if (normalizedContent.includes(normalizedFromCode)) {
                console.log(`Found normalized match for hunk ${i+1}`);
                const normalizedStartIndex = normalizedContent.indexOf(normalizedFromCode);
                
                // Find the actual start and end in the modified content
                const actualStartIndex = findActualCodeStart(modifiedContent, normalizedContent, normalizedStartIndex);
                const actualEndIndex = findActualCodeEnd(modifiedContent, actualStartIndex);
                
                // Check if we found reasonable boundaries
                if (actualEndIndex > actualStartIndex) {
                  const originalSegment = modifiedContent.substring(actualStartIndex, actualEndIndex);
                  console.log(`Original segment (${originalSegment.length} chars): ${originalSegment.substring(0, 50)}...`);
                  
                  // Replace the code block
                  modifiedContent = 
                    modifiedContent.substring(0, actualStartIndex) + 
                    toCode + 
                    modifiedContent.substring(actualEndIndex);
                  
                  foundMatch = true;
                  successCount++;
                } else {
                  console.log(`Invalid code boundaries detected: start=${actualStartIndex}, end=${actualEndIndex}`);
                }
              }
            }
            
            // If still no match, try a more aggressive matching strategy
            if (!foundMatch) {
              console.log(`Attempting fuzzy match for hunk ${i+1}`);
              
              // Split into lines for more flexible matching
              const contentLines = modifiedContent.split('\n');
              const fromLines = fromCode.trim().split('\n');
              
              // Search for the first line of the "from" block
              const firstFromLine = fromLines[0].trim();
              let matchStartLine = -1;
              
              for (let lineIdx = 0; lineIdx < contentLines.length; lineIdx++) {
                if (contentLines[lineIdx].trim() === firstFromLine) {
                  // Found potential match start
                  let matchFound = true;
                  
                  // Try to match subsequent lines
                  for (let j = 1; j < fromLines.length; j++) {
                    if (lineIdx + j >= contentLines.length || 
                        contentLines[lineIdx + j].trim() !== fromLines[j].trim()) {
                      matchFound = false;
                      break;
                    }
                  }
                  
                  if (matchFound) {
                    matchStartLine = lineIdx;
                    break;
                  }
                }
              }
              
              if (matchStartLine >= 0) {
                console.log(`Found fuzzy match at line ${matchStartLine}`);
                
                // Replace the matched lines with the "to" lines
                const toLines = toCode.trim().split('\n');
                const beforeLines = contentLines.slice(0, matchStartLine);
                const afterLines = contentLines.slice(matchStartLine + fromLines.length);
                
                modifiedContent = [...beforeLines, ...toLines, ...afterLines].join('\n');
                
                successCount++;
              } else {
                console.log(`Could not find match for hunk ${i+1}`);
              }
            }
          }
          
          // Set the final result
          setSuggestedContent(modifiedContent);
          
          // Show appropriate notification based on success
          if (successCount === parsedAiSuggestion.fromCode.length) {
            showNotificationIfEnabled(
              'Success',
              `All ${successCount} code blocks found and replaced successfully`,
              'green'
            );
          } else if (successCount > 0) {
            showNotificationIfEnabled(
              'Partial Success',
              `Applied ${successCount} of ${parsedAiSuggestion.fromCode.length} code blocks`,
              'blue'
            );
          } else {
            showNotificationIfEnabled(
              'Warning',
              'Could not find any matching code blocks in file',
              'yellow'
            );
          }
        } else {
          // No file path, just use the "to" code from the first hunk
          console.log("No file path in AI suggestion");
          if (parsedAiSuggestion.toCode.length > 0) {
            setSuggestedContent(parsedAiSuggestion.toCode.join('\n\n'));
          }
          
          showNotificationIfEnabled(
            'Info',
            'No file path detected. Using suggested code only.',
            'blue'
          );
        }
      } 
      // If not a text pattern, check if it's a unified diff
      else if (isUnifiedDiff(clipboardText)) {
        // This part remains the same as your original implementation
        console.log("Detected unified diff format, using Unix patch");
        
        // Extract file path from the diff
        const filePath = extractFilePathFromDiff(clipboardText);
        
        if (filePath) {
          console.log("Found file path:", filePath);
          setOriginalFile(filePath);
          
          // Load the original file
          const fileContent = await findAndLoadFile(filePath);
          if (!fileContent) {
            showNotificationIfEnabled(
              'Error',
              'Could not load the original file',
              'red'
            );
            setLoading(false);
            return;
          }
          
          console.log("File loaded successfully, length:", fileContent.length);
          
          try {
            // Try to apply the patch using our backend command
            const patchLevel = 1;
            const result = await core.invoke('apply_unix_patch', { 
              filePath,
              diffContent: clipboardText,
              stripLevel: patchLevel
            });
            
            // If we got here, patch was successful
            console.log("Patch applied successfully");
            setSuggestedContent(result as string);
            showNotificationIfEnabled(
              'Success',
              'Diff applied successfully',
              'green'
            );
          } catch (patchError) {
            console.error("Error applying patch:", patchError);
            
            // If the patch failed with -p1, try with -p0
            try {
              console.log("Trying alternative patch level -p0");
              const result = await core.invoke('apply_unix_patch', { 
                filePath,
                diffContent: clipboardText,
                stripLevel: 0
              });
              
              console.log("Patch applied successfully with -p0");
              setSuggestedContent(result as string);
              showNotificationIfEnabled(
                'Success',
                'Diff applied successfully with alternative patch level',
                'green'
              );
            } catch (retryError) {
              // Both patch attempts failed
              console.error("Error applying patch (retry):", retryError);
              
              // Since unified diff failed, try to convert it to a text-matching format
              console.log("Attempting to convert unified diff to text-matching format");
              
              // Convert unified diff to text-matching format
              const convertedDiff = convertUnifiedDiffToAiDiff(clipboardText, filePath);
              
              if (convertedDiff && convertedDiff.fromCode.length > 0 && convertedDiff.toCode.length > 0) {
                // Apply each hunk using the same robust algorithm as above
                let modifiedContent = fileContent;
                let successCount = 0;
                
                for (let i = 0; i < convertedDiff.fromCode.length; i++) {
                  const fromCode = convertedDiff.fromCode[i];
                  const toCode = convertedDiff.toCode[i];
                  
                  // First try exact matching
                  let foundMatch = false;
                  if (modifiedContent.includes(fromCode)) {
                    // Simple string replacement for exact matches
                    modifiedContent = modifiedContent.replace(fromCode, toCode);
                    foundMatch = true;
                    successCount++;
                  } 
                  // If exact match fails, try normalized matching
                  else {
                    // Normalized matching that ignores whitespace and comments
                    const normalizedContent = normalizeCode(modifiedContent);
                    const normalizedFromCode = normalizeCode(fromCode);
                    
                    if (normalizedContent.includes(normalizedFromCode)) {
                      const normalizedStartIndex = normalizedContent.indexOf(normalizedFromCode);
                      
                      // Find the actual start and end in the modified content
                      const actualStartIndex = findActualCodeStart(modifiedContent, normalizedContent, normalizedStartIndex);
                      const actualEndIndex = findActualCodeEnd(modifiedContent, actualStartIndex);
                      
                      // Check if we found reasonable boundaries
                      if (actualEndIndex > actualStartIndex) {
                        // Replace the code block
                        modifiedContent = 
                          modifiedContent.substring(0, actualStartIndex) + 
                          toCode + 
                          modifiedContent.substring(actualEndIndex);
                        
                        foundMatch = true;
                        successCount++;
                      }
                    }
                  }
                  
                  // If still no match, try line-by-line matching
                  if (!foundMatch) {
                    // Split into lines for more flexible matching
                    const contentLines = modifiedContent.split('\n');
                    const fromLines = fromCode.trim().split('\n');
                    
                    // Search for the first line of the "from" block
                    const firstFromLine = fromLines[0].trim();
                    let matchStartLine = -1;
                    
                    for (let lineIdx = 0; lineIdx < contentLines.length; lineIdx++) {
                      if (contentLines[lineIdx].trim() === firstFromLine) {
                        // Found potential match start
                        let matchFound = true;
                        
                        // Try to match subsequent lines
                        for (let j = 1; j < fromLines.length; j++) {
                          if (lineIdx + j >= contentLines.length || 
                              contentLines[lineIdx + j].trim() !== fromLines[j].trim()) {
                            matchFound = false;
                            break;
                          }
                        }
                        
                        if (matchFound) {
                          matchStartLine = lineIdx;
                          break;
                        }
                      }
                    }
                    
                    if (matchStartLine >= 0) {
                      // Replace the matched lines with the "to" lines
                      const toLines = toCode.trim().split('\n');
                      const beforeLines = contentLines.slice(0, matchStartLine);
                      const afterLines = contentLines.slice(matchStartLine + fromLines.length);
                      
                      modifiedContent = [...beforeLines, ...toLines, ...afterLines].join('\n');
                      
                      successCount++;
                    }
                  }
                }
                
                // Set the final result
                setSuggestedContent(modifiedContent);
                
                // Show appropriate notification based on success
                if (successCount === convertedDiff.fromCode.length) {
                  showNotificationIfEnabled(
                    'Success',
                    `Unified diff converted and all ${successCount} hunks applied using text matching`,
                    'green'
                  );
                } else if (successCount > 0) {
                  showNotificationIfEnabled(
                    'Partial Success',
                    `Unified diff converted and ${successCount} of ${convertedDiff.fromCode.length} hunks applied`,
                    'blue'
                  );
                } else {
                  showNotificationIfEnabled(
                    'Error',
                    'Could not find any matching code blocks after converting diff',
                    'red'
                  );
                }
              } else {
                setSuggestedContent(fileContent);
                showNotificationIfEnabled(
                  'Error',
                  'Failed to extract code blocks from unified diff',
                  'red'
                );
              }
            }
          }
        } else {
          console.log("No file path found in the diff");
          showNotificationIfEnabled(
            'Error',
            'Could not extract file path from the diff',
            'red'
          );
        }
      } else {
        console.log("Clipboard content is not in a recognized format");
        showNotificationIfEnabled(
          'Error',
          'The clipboard content is not in a recognized format (neither text-match nor unified diff)',
          'yellow'
        );
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      showNotificationIfEnabled(
        'Clipboard Access Error',
        `Unable to read clipboard: ${error}`,
        'red'
      );
    } finally {
      setLoading(false);
    }
  };

  
  // Function to normalize code by removing whitespace and comments
  const normalizeCode = (code: string): string => {
    return code
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\s+/g, ''); // Remove all whitespace
  };
  
  // Find the start of the code block
  const findActualCodeStart = (originalText: string, normalizedText: string, normalizedIndex: number): number => {
    // First get approximate position
    let originalIndex = 0;
    let normalizedCounter = 0;
    
    while (normalizedCounter < normalizedIndex && originalIndex < originalText.length) {
      // Skip comments and whitespace
      if (originalText.substr(originalIndex, 2) === '//') {
        // Skip to end of line
        while (originalIndex < originalText.length && originalText[originalIndex] !== '\n') {
          originalIndex++;
        }
        continue;
      }
      
      if (originalText.substr(originalIndex, 2) === '/*') {
        // Skip to end of comment
        while (originalIndex < originalText.length && 
               (originalIndex + 1 >= originalText.length || 
                originalText.substr(originalIndex, 2) !== '*/')) {
          originalIndex++;
        }
        originalIndex += 2; // Skip the */
        continue;
      }
      
      // Skip whitespace
      if (/\s/.test(originalText[originalIndex])) {
        originalIndex++;
        continue;
      }
      
      originalIndex++;
      normalizedCounter++;
    }
    
    // Now look backward for the start of a statement
    // Typical statement starters include: use, fn, struct, impl, etc.
    // We'll also look for line break + indentation patterns
    let startIndex = originalIndex;
    
    while (startIndex > 0) {
      // If we hit a clear statement start marker like a semicolon followed by a newline
      if (originalText[startIndex-1] === ';' && 
          (startIndex === originalText.length || originalText[startIndex] === '\n')) {
        // Move to the next line
        while (startIndex < originalText.length && originalText[startIndex] !== '\n') {
          startIndex++;
        }
        startIndex++; // Move past the newline
        
        // Skip any indentation
        while (startIndex < originalText.length && /[ \t]/.test(originalText[startIndex])) {
          startIndex++;
        }
        
        return startIndex;
      }
      
      // Look for common start patterns like "use " or "fn " at the beginning of a line
      const lineStart = startIndex === 0 || originalText[startIndex-1] === '\n';
      if (lineStart) {
        // Check if this line starts a statement
        const restOfLine = originalText.substring(startIndex, startIndex + 20); // Look ahead 20 chars
        if (/^(use|fn|struct|enum|impl|trait|mod|pub|const|let|static)\b/.test(restOfLine)) {
          return startIndex;
        }
      }
      
      startIndex--;
    }
    
    return originalIndex; // Fallback to approximate position
  };
  
  // Find the end of the code block
  const findActualCodeEnd = (originalText: string, startIndex: number): number => {
    let endIndex = startIndex;
    let braceCount = 0;
    
    // First, determine what kind of statement we're looking at
    const restOfText = originalText.substring(startIndex, startIndex + 20);
    const isUseStatement = /^use\b/.test(restOfText);
    
    if (isUseStatement) {
      // For use statements, look for the ending semicolon
      while (endIndex < originalText.length) {
        if (originalText[endIndex] === '{') {
          braceCount++;
        } else if (originalText[endIndex] === '}') {
          braceCount--;
        } else if (originalText[endIndex] === ';' && braceCount <= 0) {
          // Found the ending semicolon
          return endIndex + 1; // Include the semicolon
        }
        
        endIndex++;
      }
    } else {
      // For other statements, look for a balanced ending brace pattern
      let foundOpenBrace = false;
      
      while (endIndex < originalText.length) {
        if (originalText[endIndex] === '{') {
          foundOpenBrace = true;
          braceCount++;
        } else if (originalText[endIndex] === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            // Found the closing brace
            // Look for a semicolon that might follow the closing brace
            let semicolonIndex = endIndex + 1;
            while (semicolonIndex < originalText.length && /\s/.test(originalText[semicolonIndex])) {
              semicolonIndex++;
            }
            
            if (semicolonIndex < originalText.length && originalText[semicolonIndex] === ';') {
              return semicolonIndex + 1; // Include the semicolon
            }
            
            return endIndex + 1; // Include the closing brace
          }
        } else if (!foundOpenBrace && originalText[endIndex] === ';') {
          // This is a single-line statement without braces
          return endIndex + 1; // Include the semicolon
        }
        
        endIndex++;
      }
    }
    
    return endIndex;
  };

  const findAndLoadFile = async (filePath: string): Promise<string | null> => {
    try {
      let content = null;
      
      // First try the exact path
      if (await exists(filePath)) {
        content = await readTextFile(filePath);
        return content;
      }
      
      // If not found, try within the project path if we have one
      if (projectPath) {
        const fullPath = `${projectPath}/${filePath}`;
        if (await exists(fullPath)) {
          content = await readTextFile(fullPath);
          setOriginalFile(fullPath); // Update with full path
          return content;
        }
        
        // Try src directory if it exists
        const srcPath = `${projectPath}/src/${filePath}`;
        if (await exists(srcPath)) {
          content = await readTextFile(srcPath);
          setOriginalFile(srcPath); // Update with full path
          return content;
        }
      }
      
      // File not found in any expected location
      return null;
    } catch (error) {
      console.error('Error finding/loading file:', error);
      return null;
    }
  };
  
  // Add the keyboard shortcut hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+V or Cmd+Shift+V for "Parse AI Suggestion"
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'v') {
        handleParseSuggestion();
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Force a resize event when the connection panel visibility changes
    // This helps the Monaco editor recalculate its dimensions
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300); // Short delay to allow the collapse animation to finish
  }, [isConnectionOpen]);

  const showNotificationIfEnabled = (title: string, message: string, color: string = 'blue') => {
    if (showNotifications) {
      notifications.show({
        title,
        message,
        color
      });
    }
    
    // Always log to console for debugging
    console.log(`${title}: ${message}`);
  };

  const browseForFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Select Original File',
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }, {
          name: 'Text Files',
          extensions: ['txt', 'md', 'js', 'ts', 'html', 'css', 'json', 'py', 'jsx', 'tsx']
        }, {
          name: 'Source Code',
          extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb']
        }]
      });
      
      if (selected && typeof selected === 'string') {
        console.log('Selected file:', selected);
        setOriginalFile(selected);
        
        // Load the file content into Suggested Content using Tauri 2.0 API
        try {
          const fileExists = await exists(selected);
          if (!fileExists) {
            throw new Error(`File does not exist: ${selected}`);
          }
          
          const fileContent = await readTextFile(selected);
          setSuggestedContent(fileContent);
          
          notifications.show({
            title: 'Success',
            message: `File loaded successfully: ${selected.split('/').pop()}`,
            color: 'green'
          });
        } catch (readError) {
          console.error('Error reading file content:', readError);
          notifications.show({
            title: 'Error',
            message: `Could not read file content: ${readError}`,
            color: 'red'
          });
        }
      } else {
        console.log('No file selected or multiple selection returned', selected);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to open file browser: ${error}`,
        color: 'red'
      });
    }
  };

  const validateAndLoadFile = async (filePath: string) => {
    if (!filePath.trim()) return;
    
    try {
      console.log('Validating file path:', filePath);
      
      // Check if file exists using Tauri's FS API
      const fileExists = await exists(filePath);
      if (!fileExists) {
        notifications.show({
          title: 'Error',
          message: `File does not exist: ${filePath}`,
          color: 'red'
        });
        return;
      }
      
      // If file exists, load its content
      const fileContent = await readTextFile(filePath);
      setSuggestedContent(fileContent);
      
      notifications.show({
        title: 'Success',
        message: `File loaded successfully: ${filePath.split('/').pop() || filePath.split('\\').pop()}`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error validating or loading file:', error);
      notifications.show({
        title: 'Error',
        message: `Could not load file: ${error}`,
        color: 'red'
      });
    }
  };

  const resetSuggestedContent = () => {
    setSuggestedContent('');
  };

  const resetForm = () => {
    setOriginalFile('');
    setSuggestedContent('');
    setDescription('Suggested change');
  };
  
  // Fetch current server status
  const fetchStatus = async () => {
    try {
      const [isRunning, currentPort] = await core.invoke('get_vscode_ws_status') as [boolean, number];
      setStatus({ isRunning, port: currentPort });
      if (isRunning) {
        setPort(currentPort);
      }
    } catch (error: any) {
      console.error('Error fetching VS Code connection status:', error);
      setError(error.toString());
    }
  };

  useEffect(() => {
    // Check if your application has a way to detect dark mode
    // This is an example - adapt it to your app's dark mode detection method
    const isDarkMode = document.body.classList.contains('dark-mode') || 
                       window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    setColorScheme(isDarkMode ? 'dark' : 'light');
    
    // Optional: listen for changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setColorScheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Load status on component mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Start the WebSocket server
  const startServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('start_vscode_ws_server', { port });
      notifications.show({
        title: 'Success',
        message: `VS Code WebSocket server started. Connect your extension to ws://localhost:${port}`,
        color: 'green'
      });
      setStatus({ isRunning: true, port: port });
      fetchStatus(); // Refresh status to get the actual port
    } catch (error: any) {
      console.error('Error starting VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to start VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Stop the WebSocket server
  const stopServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await core.invoke('stop_vscode_ws_server');
      await fetchStatus(); // Immediately fetch updated status
      notifications.show({
        title: 'Success',
        message: 'VS Code WebSocket server stopped',
        color: 'blue'
      });
    } catch (error: any) {
      console.error('Error stopping VS Code WebSocket server:', error);
      setError(error.toString());
      notifications.show({
        title: 'Error',
        message: `Failed to stop VS Code WebSocket server: ${error}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };


  // Send a test diff to VS Code
  const sendTestDiff = async () => {
    if (!originalFile) {
      notifications.show({
        title: 'Error',
        message: 'Please enter an original file path',
        color: 'red'
      });
      return;
    }

    if (!suggestedContent) {
      notifications.show({
        title: 'Error',
        message: 'Please enter suggested content',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      // Create the diff request object
      const diffRequest: CodeDiffRequest = {
        originalFile,
        suggestedContent,
        description
      };
      
      // Debug logging
      console.log('Sending diff request with:', JSON.stringify(diffRequest, null, 2));
      
      // First check if the server is running
      const isRunning = await core.invoke('get_vscode_ws_status') as [boolean, number];
      console.log('Server status before sending diff:', isRunning);
      
      try {
        // Try to invoke the command with verbose logging
        console.log('Invoking send_code_diff_to_vscode with request:', diffRequest);
        await core.invoke('send_code_diff_to_vscode', { 
          diffRequest: {
            original_file: originalFile,
            suggested_content: suggestedContent,
            description
          }
        });
        
        notifications.show({
          title: 'Success',
          message: 'Diff sent to VS Code extension',
          color: 'green'
        });
      } catch (commandError: any) {
        // More detailed error logging
        console.error('Invoke error details:', {
          message: commandError.message,
          stack: commandError.stack,
          fullError: commandError
        });
        
        // Show error notification
        notifications.show({
          title: 'Error',
          message: `Failed to send diff: ${commandError}`,
          color: 'red'
        });
        
        // Show a more detailed error message to help debugging
        setError(`Detailed error: ${JSON.stringify({
          message: commandError.message || commandError.toString(),
          errorType: typeof commandError,
          diffRequest
        }, null, 2)}`);
      }
    } catch (error: any) {
      console.error('Error in sendTestDiff function:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to prepare diff: ${error}`,
        color: 'red'
      });
      setError(`Error preparing diff request: ${error.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const language = originalFile
  ? getLanguageFromExtension(originalFile.split('.').pop() || 'plaintext')
  : 'markdown';

// Modify the component return statement to consolidate the cards and give more space to Suggested Content

// First, remove the bottom card entirely and integrate its content into the top section
// Then increase the height of the Suggested Content textarea

  return (
    <div
      className="vscode-integration-panel"
      style={{ height: isConnectionOpen ? 'calc(100vh)' : 'calc(100%+10px)',
        display: 'flex', flexDirection: 'column', padding: '0 0 8px 0' }}
    >
      <Card
        shadow="sm"
        p="lg"
        radius="md"
        withBorder
        style={{ flex: 1, display: 'flex', flexDirection: 'column', height:  isConnectionOpen ? 'calc(100%)' : 'calc(100% + 20px)'}}
      >
        <Card.Section p="md" className="border-b">
          <Group justify="space-between">
            <Group>
              <CodeIcon size={20} />
              <Text size="xl" fw={700}>VS Code Integration</Text>
            </Group>
            <Badge 
              color={status.isRunning ? 'green' : 'gray'}
              variant="filled"
            >
              {status.isRunning ? 'Connected' : 'Disconnected'}
            </Badge>
          </Group>
        </Card.Section>
        
        <Stack gap="md" mt="md">
          <Group justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setIsConnectionOpen(!isConnectionOpen)}>
            <Text size="sm" fw={600}>VS Code Extension Connection</Text>
            <ActionIcon variant="transparent">
              {isConnectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </ActionIcon>
          </Group>

          <Collapse in={isConnectionOpen}>
            <div>
              <Alert 
                icon={<AlertCircle size={16} />} 
                color="blue" 
                title="VS Code Extension Connection"
              >
                <Text size="sm">
                  Configure the connection to the VS Code diff-extension. Make sure you have the PieVerse Diff Extension installed in VS Code and 
                  that it's configured to connect to the correct WebSocket port.
                </Text>
                
                <Text size="sm" mt="md" fw={600}>
                  VS Code Extension Settings:
                </Text>
                <Code block>
                  {`{"pieverse-diff.websocketUrl": "ws://localhost:${status.port}"}`}
                </Code>
              </Alert>

              {/* WebSocket Port and Server Control Group */}
              <Group align="end" mt="md">
                <NumberInput
                  label="WebSocket Port"
                  description={status.isRunning 
                    ? `Active connection URL: ws://localhost:${status.port}`
                    : "Port for VS Code extension to connect to"}
                  value={port}
                  onChange={(value: string | number) => setPort(typeof value === 'number' ? value : 3001)}
                  min={1024}
                  max={65535}
                  disabled={status.isRunning}
                />
                
                {!status.isRunning ? (
                  <Button 
                    onClick={startServer}
                    loading={loading}
                    leftSection={<RefreshCw size={14} />}
                  >
                    Start Server
                  </Button>
                ) : (
                  <Button 
                    onClick={stopServer}
                    loading={loading}
                    color="red"
                    leftSection={<AlertCircle size={14} />}
                  >
                    Stop Server
                  </Button>
                )}
                
                <Button 
                  variant="outline"
                  onClick={fetchStatus}
                  leftSection={<RefreshCw size={14} />}
                >
                  Refresh Status
                </Button>
                
                {/* Add the checkbox with proper alignment */}
                <Checkbox
                  label="Show Notifications"
                  checked={showNotifications}
                  onChange={(e) => setShowNotifications(e.currentTarget.checked)}
                  style={{ marginBottom: '6px' }} /* This aligns just the checkbox with buttons */
                />
              </Group>
          </div>
        </Collapse>

        {error && (
          <Alert color="red" title="Error" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        )}
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs
            defaultValue="diff"
            value={activeTab}
            onChange={setActiveTab}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          >
            <Tabs.List>
              <Tabs.Tab value="diff" leftSection={<FileCode size={16} />}>
                Diff
              </Tabs.Tab>
              <Tabs.Tab value="chat" leftSection={<MessageSquare size={16} />}>
                Chat
              </Tabs.Tab>
              <Tabs.Tab value="diagnostics" leftSection={<AlertCircle size={16} />}>
                Diagnostics
              </Tabs.Tab>
              <Tabs.Tab value="terminal" leftSection={<Terminal size={16} />}>
                Terminal
              </Tabs.Tab>
              {/* <Tabs.Tab value="debug" leftSection={<AlertCircle size={16} />}>
                Debug
              </Tabs.Tab> */}
            </Tabs.List>

            <Tabs.Panel value="diff" p="md" style={{ flex: 1 }}>
              <Card
                withBorder
                p="lg"
                mt="md"
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  height: isConnectionOpen ? 'calc(100% - 15px)' : 'calc(100% + 9px)',
                  flex: 1,
                  transition: 'height 0.3s ease'
                }}
              >
                  {/* Card contents remain the same... */}                  
                {/* Fixed-height section for inputs */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <Stack gap="sm">
                    <TextInput
                      label={
                        <Tooltip label="Path to the original file that will be modified">
                          <Text size="sm" style={{ cursor: 'help' }}>Original File Path</Text>
                        </Tooltip>
                      }
                      placeholder="/path/to/your/file.js"
                      value={originalFile}
                      onChange={(e) => setOriginalFile(e.currentTarget.value)}
                      onBlur={() => {
                        if (originalFile.trim()) {
                          validateAndLoadFile(originalFile);
                        }
                      }}
                      onPaste={(e) => {
                        // Allow default paste behavior to update the input value
                        setTimeout(() => {
                          // Check if the pasted content looks like a file path
                          const value = e.currentTarget.value;
                          if (value && (value.includes('/') || value.includes('\\'))) {
                            validateAndLoadFile(value);
                          }
                        }, 100);
                      }}
                      rightSection={
                        <ActionIcon
                          onClick={browseForFile}
                          variant="subtle"
                          size="lg"
                          title="Browse for file"
                          style={{ marginRight: '8px' }}
                          color="blue"
                        >
                          <Folder size={16} />
                        </ActionIcon>
                      }
                      rightSectionWidth={50}
                      styles={{ section: { pointerEvents: 'auto' } }}
                    />
                    
                    <TextInput
                      label={
                        <Tooltip label="Description of the proposed change">
                          <Text size="sm" style={{ cursor: 'help' }}>Description</Text>
                        </Tooltip>
                      }
                      placeholder="Refactor function for better performance"
                      value={description}
                      onChange={(e) => setDescription(e.currentTarget.value)}
                    />
                  </Stack>
                </div>
                
                {/* Editor that takes available space but allows room for buttons */}
                <div style={{ 
                  flex: 1, 
                  minHeight: '150px',
                  height: isConnectionOpen ? 'auto' : 'auto', // Adjust this value based on your layout
                  transition: 'height 0.3s ease'
                }}>
                  <Editor
                    key={language}
                    height={isConnectionOpen ? 'calc(97% + 6px)' : 'calc(93% + 10px)'}
                    language={language}
                    value={suggestedContent}
                    onChange={(value) => setSuggestedContent(value || '')}
                    theme={colorScheme === 'dark' ? 'vs-dark' : 'light'} // Add this line
                    options={{
                      wordWrap: 'on',
                      minimap: { enabled: false },
                      automaticLayout: true,
                      fontSize: 14
                    }}
                  />
                </div>
                                
                {/* Button group with minimal margin to maximize editor space */}
                <Group justify="space-between" mt="12px">
                    <Group>
                      <Button 
                        onClick={sendTestDiff}
                        loading={loading}
                        disabled={!status.isRunning}
                        title={!status.isRunning ? "WebSocket server is not running. Start the server to enable this button." : ""}
                      >
                        Send Diff
                      </Button>
                      
                      <Button
                        variant="outline"
                        color="cyan"
                        onClick={handleParseSuggestion}
                        loading={loading}
                        leftSection={<Clipboard size={14} />}
                        title="Parse AI suggestion from clipboard and populate 'Suggested change' form"
                      >
                        Parse AI Suggestion from clipboard
                      </Button>
                      
                      <Button
                        variant="outline"
                        color="blue"
                        onClick={async () => {
                          try {
                            const clipboardText = await readText();
                            if (clipboardText) {
                              setSuggestedContent(clipboardText);
                              showNotificationIfEnabled(
                                'Success',
                                'Clipboard content pasted',
                                'green'
                              );
                            } else {
                              showNotificationIfEnabled(
                                'Error',
                                'Clipboard is empty',
                                'red'
                              );
                            }
                          } catch (error) {
                            console.error('Failed to read clipboard:', error);
                            showNotificationIfEnabled(
                              'Clipboard Access Error',
                              `Unable to read clipboard: ${error}`,
                              'red'
                            );
                          }
                        }}
                        leftSection={<Clipboard size={14} />}
                        title="Paste clipboard content directly without processing"
                      >
                        Paste Clipboard
                      </Button>
                  </Group>
                  
                  <Group gap="xs">
                    <Button
                      variant="subtle"
                      color="red"
                      onClick={resetSuggestedContent}
                      leftSection={<X size={14} />}
                      size="sm"
                    >
                      Clear Content Only
                    </Button>
                    
                    <Button
                      variant="outline"
                      color="gray"
                      onClick={resetForm}
                      leftSection={<Eraser size={14} />}
                    >
                      Reset All Fields
                    </Button>
                  </Group>
                </Group>
              </Card>
            </Tabs.Panel>
            
            <Tabs.Panel value="chat" p="md">
              <VSCodeChat isServerRunning={status.isRunning} />
            </Tabs.Panel>

            <Tabs.Panel value="diagnostics" p="md">
              <VSCodeDiagnosticsPanel isServerRunning={status.isRunning} 
              isConnectionOpen={isConnectionOpen}
              />
            </Tabs.Panel>

            <Tabs.Panel value="terminal" p="md">
              <VSCodeTerminalPanel isServerRunning={status.isRunning}
              isConnectionOpen={isConnectionOpen}
              />
            </Tabs.Panel>
            
            {/* <Tabs.Panel value="debug" p="md">
              <Card withBorder p="md" mt="md">
                <Text fw={600} mb="md">Debug Information</Text>
                <Stack gap="md">
                  <Alert 
                    icon={<AlertCircle size={16} />} 
                    color="blue" 
                    title="Debug Mode"
                  >
                    This panel shows debug information to help diagnose connection issues.
                  </Alert>
                  
                  {statusInfo && (
                    <Alert 
                      color="blue" 
                      title="Status Information" 
                      icon={<CheckCircle size={16} />}
                      withCloseButton
                      onClose={() => setStatusInfo(null)}
                    >
                      {statusInfo}
                    </Alert>
                  )}

                  <Text size="sm" fw={600}>Current Request Payload:</Text>
                  <Code block>
                    {JSON.stringify({
                      originalFile,
                      suggestedContent: suggestedContent.length > 100 
                        ? suggestedContent.substring(0, 100) + '...' 
                        : suggestedContent,
                      description
                    }, null, 2)}
                  </Code>
                  
                  <Text size="sm" fw={600}>Connection Status:</Text>
                  <Code block>
                    {JSON.stringify(status, null, 2)}
                  </Code>
                  
                  {error && (
                    <>
                      <Text size="sm" fw={600} color="red">Error Details:</Text>
                      <Code block>
                        {error}
                      </Code>
                    </>
                  )}
                  
                  <Group>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const wsStatus = await core.invoke('get_vscode_ws_status');
                          setStatusInfo(`WebSocket Status: ${JSON.stringify(wsStatus, null, 2)}`);
                          setError(null); // Clear any existing errors
                        } catch (e: any) {
                          setError(`Failed to get status: ${e.toString()}`);
                          setStatusInfo(null);
                        }
                      }}
                    >
                      Check WebSocket Status
                    </Button>
                    
                    <Button
                      variant="outline"
                      color="yellow"
                      onClick={async () => {
                        try {
                          // Just invoke the send_code_diff_to_vscode command directly with test data
                          const testData = {
                            diffRequest: {
                              originalFile: "/test/file.js",
                              suggestedContent: "// Test content",
                              description: "Test description"
                            }
                          };
                          await core.invoke('send_code_diff_to_vscode', testData);
                          setError(`Test diff sent successfully with: ${JSON.stringify(testData, null, 2)}`);
                        } catch (e: any) {
                          setError(`Failed to send test diff: ${e.toString()}`);
                        }
                      }}
                    >
                      Send Test Data
                    </Button>
                  </Group>
                </Stack>
              </Card>
            </Tabs.Panel> */}
          </Tabs>
        </div>
      </Stack>
    </Card>
  </div>
);
};

export default VSCodeIntegrationPanel;