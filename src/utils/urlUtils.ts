// src/utils/urlUtils.ts
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Safely validates and opens a URL using system browser
 * @param url URL to open
 * @returns Promise that resolves when URL is opened or rejects on error
 */
export const safeOpenUrl = async (url: string): Promise<void> => {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.error("Unsafe URL protocol:", parsedUrl.protocol);
      throw new Error(`Unsafe URL protocol: ${parsedUrl.protocol}`);
    }
    
    // Now safely open the URL using Tauri's plugin-opener
    await openUrl(url);
  } catch (e) {
    console.error("Failed to open URL:", e);
    throw e;
  }
};

/**
 * Safely opens a URL in a new browser tab using window.open
 * @param url URL to open
 */
export const safeOpenInNewTab = (url: string): void => {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.error("Unsafe URL protocol:", parsedUrl.protocol);
      return;
    }
    
    // Now safely open the URL
    window.open(url, '_blank');
  } catch (e) {
    console.error("Invalid URL:", e);
  }
};

/**
 * Format URL for display (hostname only)
 * @param url URL to format
 * @returns Hostname part of the URL
 */
export const formatUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
};