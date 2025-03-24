// src/utils/imageUtils.ts
import { Globe } from 'lucide-react';

/**
 * Validates favicon URL safety
 * @param url Favicon URL to validate
 * @returns Boolean indicating if URL appears safe
 */
export const isValidFaviconUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    
    try {
      const parsedUrl = new URL(url);
      
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }
      
      // Check for common image extensions
      const validExtensions = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];
      const hasValidExtension = validExtensions.some(ext => 
        parsedUrl.pathname.toLowerCase().endsWith(ext)
      );
      
      // List of explicitly trusted domains and patterns
      const trustedDomains = [
        'cdn.oaistatic.com',  // Trusted OpenAI domain
        'claude.ai',          // Claude domain
        'favicon.ico',
        'google.com/s2/favicons',
        'www.google.com/s2/favicons',
        'icons.duckduckgo.com',
        'icon.horse',
        'favicons.githubusercontent.com',
        'anthropic.com'
      ];
      
      // Explicitly trusted full URLs
      const trustedUrls = [
        'https://claude.ai/favicon.ico',
        'https://cdn.oaistatic.com/assets/favicon-miwirzcw.ico'
      ];
      
      const isTrustedDomain = trustedDomains.some(domain => 
        parsedUrl.hostname.includes(domain)
      );
      
      const isTrustedUrl = trustedUrls.includes(url);
      
      return hasValidExtension || isTrustedDomain || isTrustedUrl;
    } catch (e) {
      return false;
    }
  };

/**
 * Creates a secure favicon URL or returns null if invalid
 * @param url Original favicon URL
 * @returns Safe URL or null if invalid
 */
export const getSafeFaviconUrl = (url: string | null | undefined): string | null => {
  if (!url || !isValidFaviconUrl(url)) {
    return null;
  }
  
  // Optional: You could proxy through a known service
  // return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}`;
  
  return url;
};