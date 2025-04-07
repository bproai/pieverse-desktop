// src/components/VSCodeIntegration/diffParser.ts

export interface ParsedAiDiff {
    filePath?: string;
    fromCode: string[];  // Changed to array for multiple hunks
    toCode: string[];    // Changed to array for multiple hunks
    description?: string;
  }
  
  /**
   * Detects if text is in unified diff format
   */
  export function isUnifiedDiff(text: string): boolean {
    // A unified diff typically starts with --- a/ and +++ b/ lines followed by @@ markers
    return /^---\s+a\/.*\n\+\+\+\s+b\/.*(\n@@.*@@.*)+/m.test(text);
  }
  
  /**
   * Extracts file path from unified diff
   */
  export function extractFilePathFromDiff(diff: string): string | undefined {
    const filePathMatch = diff.match(/\+\+\+\s+b\/([^\n]+)/);
    return filePathMatch ? filePathMatch[1].trim() : undefined;
  }
  
  /**
   * Parses AI-generated code suggestions from text
   * Handles formats like "From this/To this" commonly used by AI assistants
   * Now supports multiple hunks
   */
  export function parseAiSuggestion(text: string): ParsedAiDiff | null {
    // Extract file path if mentioned in text
    let filePath: string | undefined;
    const filePathMatch = text.match(/(?:In|File|Path):\s*([^\n,]+)/i);
    if (filePathMatch) {
      filePath = filePathMatch[1].trim();
    }
    
    // Look for the From this/To this pattern - now supporting multiple pairs
    const fromToRegex = /From this:([\s\S]*?)To this:([\s\S]*?)(?=From this:|$)/gi;
    let fromBlocks: string[] = [];
    let toBlocks: string[] = [];
    let match;
    
    while ((match = fromToRegex.exec(text)) !== null) {
      fromBlocks.push(match[1].trim());
      toBlocks.push(match[2].trim());
    }
    
    if (fromBlocks.length > 0 && toBlocks.length > 0) {
      return {
        filePath,
        fromCode: fromBlocks,
        toCode: toBlocks,
        description: extractDescription(text)
      };
    }
    
    // Try other patterns if the primary pattern isn't found
    // Check for code blocks pairs
    const codeBlocksResult = extractCodeBlockPairs(text);
    if (codeBlocksResult.fromBlocks.length > 0) {
      return {
        filePath,
        fromCode: codeBlocksResult.fromBlocks,
        toCode: codeBlocksResult.toBlocks,
        description: extractDescription(text)
      };
    }
    
    // Try to find line-by-line changes (+/-)
    const addRemoveResult = extractAddRemoveLines(text);
    if (addRemoveResult.fromBlocks.length > 0) {
      return {
        filePath,
        fromCode: addRemoveResult.fromBlocks,
        toCode: addRemoveResult.toBlocks,
        description: extractDescription(text)
      };
    }
    
    return null;
  }
  
  /**
   * Extract code block pairs
   */
  function extractCodeBlockPairs(text: string): { fromBlocks: string[], toBlocks: string[] } {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push(match[1].trim());
    }
    
    const fromBlocks: string[] = [];
    const toBlocks: string[] = [];
    
    // If we have an even number of code blocks, assume they are pairs
    if (codeBlocks.length >= 2 && codeBlocks.length % 2 === 0) {
      for (let i = 0; i < codeBlocks.length; i += 2) {
        fromBlocks.push(codeBlocks[i]);
        toBlocks.push(codeBlocks[i + 1]);
      }
    }
    
    return { fromBlocks, toBlocks };
  }
  
  /**
   * Extract add/remove line pairs
   */
  function extractAddRemoveLines(text: string): { fromBlocks: string[], toBlocks: string[] } {
    const fromBlocks: string[] = [];
    const toBlocks: string[] = [];
    
    // Split into sections based on empty lines
    const sections = text.split(/\n\s*\n/);
    
    for (const section of sections) {
      // Check if section has + or - lines
      if (/^[\s]*[+-]/.test(section)) {
        const fromLines: string[] = [];
        const toLines: string[] = [];
        
        // Process the lines
        section.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('-')) {
            fromLines.push(trimmed.substring(1).trim());
          } else if (trimmed.startsWith('+')) {
            toLines.push(trimmed.substring(1).trim());
          } else if (trimmed.length > 0 && !trimmed.startsWith('//')) {
            // Context line (appears in both)
            fromLines.push(trimmed);
            toLines.push(trimmed);
          }
        });
        
        if (fromLines.length > 0 && toLines.length > 0) {
          fromBlocks.push(fromLines.join('\n'));
          toBlocks.push(toLines.join('\n'));
        }
      }
    }
    
    return { fromBlocks, toBlocks };
  }
  
  /**
   * Extract description/context from the AI suggestion
   */
  function extractDescription(fullText: string): string | undefined {
    // Remove code blocks
    let textWithoutCode = fullText.replace(/```[\w]*\n[\s\S]*?```/g, '');
    
    // Remove From this/To this blocks
    textWithoutCode = textWithoutCode.replace(/From this:[\s\S]*?To this:[\s\S]*?(?=From this:|$)/gi, '');
    
    // Clean up the result
    textWithoutCode = textWithoutCode.trim();
    
    if (textWithoutCode.length > 0) {
      // Limit description length for UI
      return textWithoutCode.length > 100 
        ? textWithoutCode.substring(0, 100) + '...' 
        : textWithoutCode;
    }
    return undefined;
  }
  
  /**
   * Convert a unified diff to ParsedAiDiff format
   */
  export function convertUnifiedDiffToAiDiff(diffContent: string, filePath?: string): ParsedAiDiff | null {
    // This function extracts fromCode and toCode from a unified diff format
    const hunks = diffContent.match(/@@.*?@@([\s\S]*?)(?=@@|$)/g);
    
    if (!hunks || hunks.length === 0) {
      return null;
    }
    
    const fromBlocks: string[] = [];
    const toBlocks: string[] = [];
    
    // Process each hunk
    hunks.forEach(hunk => {
      const fromLines: string[] = [];
      const toLines: string[] = [];
      const hunkLines = hunk.split('\n').slice(1); // Skip the @@ line
      
      hunkLines.forEach(line => {
        if (line.startsWith('+')) {
          // Added line (only in "to" version)
          toLines.push(line.substring(1));
        } else if (line.startsWith('-')) {
          // Removed line (only in "from" version)
          fromLines.push(line.substring(1));
        } else if (line.startsWith(' ')) {
          // Context line (in both versions)
          fromLines.push(line.substring(1));
          toLines.push(line.substring(1));
        }
      });
      
      // If we extracted content successfully for this hunk
      if (fromLines.length > 0 && toLines.length > 0) {
        fromBlocks.push(fromLines.join('\n'));
        toBlocks.push(toLines.join('\n'));
      }
    });
    
    // If we extracted content successfully
    if (fromBlocks.length > 0 && toBlocks.length > 0) {
      return {
        filePath: filePath || extractFilePathFromDiff(diffContent),
        fromCode: fromBlocks,
        toCode: toBlocks,
        description: "Converted from unified diff"
      };
    }
    
    return null;
  }
  
  /**
   * Read from clipboard and parse AI suggestion
   */
  export async function parseClipboardAiSuggestion(): Promise<ParsedAiDiff | null> {
    try {
      // Use browser's native clipboard API instead of Tauri's API
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        return null;
      }
      
      return parseAiSuggestion(clipboardText);
    } catch (error) {
      console.error('Error parsing clipboard:', error);
      return null;
    }
  }