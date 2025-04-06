// src/components/VSCodeIntegration/aiDiffParser.ts

export interface ParsedAiDiff {
    filePath?: string;
    fromCode: string;
    toCode: string;
    description?: string;
  }
  
  /**
   * Parses AI-generated code suggestions from text
   * Handles formats like "From this/To this" commonly used by AI assistants
   */
  export function parseAiSuggestion(text: string): ParsedAiDiff | null {
    // Extract file path if mentioned
    let filePath: string | undefined;
    const filePathMatch = text.match(/In ([^,]+),|(?:File|Path):\s*([^\n]+)/i);
    if (filePathMatch) {
      filePath = (filePathMatch[1] || filePathMatch[2]).trim();
    }
    
    // Look for the From this/To this pattern
    const fromToRegex = /From this:([\s\S]*?)To this:([\s\S]*?)(?:\n\n|$)/i;
    const fromToMatch = text.match(fromToRegex);
    
    if (fromToMatch) {
      return {
        filePath,
        fromCode: fromToMatch[1].trim(),
        toCode: fromToMatch[2].trim(),
        description: extractDescription(text, fromToMatch[0])
      };
    }
    
    // Try other patterns if the primary pattern isn't found
    // Check for code blocks
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push(match[1].trim());
    }
    
    if (codeBlocks.length === 2) {
      return {
        filePath,
        fromCode: codeBlocks[0],
        toCode: codeBlocks[1],
        description: extractDescription(text, codeBlocks.join(''))
      };
    }
    
    // Try to find line-by-line changes (+/-)
    const addRemoveLines = text.split('\n').filter(line => 
      line.trim().startsWith('+') || line.trim().startsWith('-')
    );
    
    if (addRemoveLines.length > 0) {
      const fromLines: string[] = [];
      const toLines: string[] = [];
      
      // Process the lines
      text.split('\n').forEach(line => {
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
      
      return {
        filePath,
        fromCode: fromLines.join('\n'),
        toCode: toLines.join('\n'),
        description: extractDescription(text, addRemoveLines.join('\n'))
      };
    }
    
    return null;
  }
  
  /**
   * Extract description/context from the AI suggestion
   */
  function extractDescription(fullText: string, diffContent: string): string | undefined {
    // Remove diff content to get description
    const textWithoutDiff = fullText
      .replace(diffContent, '')
      .replace(/```[\w]*\n[\s\S]*?```/g, '') // Remove any code blocks
      .trim();
    
    if (textWithoutDiff.length > 0) {
      // Limit description length for UI
      return textWithoutDiff.length > 100 
        ? textWithoutDiff.substring(0, 100) + '...' 
        : textWithoutDiff;
    }
    return undefined;
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