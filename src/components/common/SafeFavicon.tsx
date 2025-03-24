// src/components/common/SafeFavicon.tsx
import React from 'react';
import { Globe } from 'lucide-react';
import { getSafeFaviconUrl } from '../../utils/imageUtils';

interface SafeFaviconProps {
  url: string | null | undefined;
  size?: number;
  className?: string;
}

export const SafeFavicon: React.FC<SafeFaviconProps> = ({
  url,
  size = 16,
  className = '',
}) => {
  const safeUrl = getSafeFaviconUrl(url);
  
  if (!safeUrl) {
    return <Globe size={size} className={className} />;
  }
  
  return (
    <div 
      style={{ 
        width: `${size}px`, 
        height: `${size}px`, 
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      className={className}
    >
      <img 
        src={safeUrl}
        alt="Favicon"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        onError={(e) => {
          // Replace with fallback on error
          e.currentTarget.style.display = 'none';
          // Add globe icon as fallback
          const parent = e.currentTarget.parentElement;
          if (parent) {
            const fallbackIcon = document.createElement('span');
            parent.appendChild(fallbackIcon);
            // We'll use a simpler approach than direct innerHTML manipulation
            const globe = document.createElement('div');
            globe.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
            parent.replaceChild(globe.firstChild!, fallbackIcon);
          }
        }}
        loading="lazy" // Lazy load favicons
      />
    </div>
  );
};