// src/components/BrandLogo.tsx
import React, { useState, useRef, useEffect } from 'react';
import staticLogo from '../assets/logo.svg';
import brandGif from '../assets/brand.gif';

interface BrandLogoProps {
  isDark: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ isDark }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isEnabled, setIsEnabled] = useState(true);

  const handleLogoClick = () => {
    if (!isEnabled) return;
    
    setIsPlaying(true);
    setIsEnabled(false);

    if (imgRef.current) {
      imgRef.current.src = brandGif + '?play=' + new Date().getTime();
    }

    setTimeout(() => {
      setIsPlaying(false);
      setIsEnabled(true);
    }, 5000);
  };

  useEffect(() => {
    const preloadImage = new Image();
    preloadImage.src = brandGif;
  }, []);

  return (
    <div 
      className={`
        cursor-pointer relative w-10 h-10 overflow-hidden rounded-md 
        ${!isEnabled ? 'cursor-not-allowed' : ''}
        ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
        transition-colors duration-200
      `}
      onClick={handleLogoClick}
      title={isEnabled ? "Click to animate" : "Animation playing..."}
    >
      <img
        ref={imgRef}
        src={isPlaying ? brandGif : staticLogo}
        alt="PiEVerse Logo"
        className={`
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
          h-full w-auto min-w-full min-h-full object-cover
          ${isDark ? 'brightness-110' : ''}
          transition-all duration-200
        `}
        onLoad={() => {
          if (isPlaying) {
            console.log('Animation started');
          }
        }}
      />
    </div>
  );
};

export default BrandLogo;