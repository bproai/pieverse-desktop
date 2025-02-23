// src/components/BrandLogo.tsx
import React, { useState, useRef, useEffect } from 'react';
import staticLogo from '../assets/logo.svg';
import brandGif from '../assets/brand.gif';

const BrandLogo = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isEnabled, setIsEnabled] = useState(true);

  const handleLogoClick = () => {
    if (!isEnabled) return;
    
    setIsPlaying(true);
    setIsEnabled(false); // Disable clicking while playing

    // Reset the GIF by forcing a reload
    if (imgRef.current) {
      imgRef.current.src = brandGif + '?play=' + new Date().getTime();
    }

    // Wait for GIF to complete before allowing next play
    setTimeout(() => {
      setIsPlaying(false);
      setIsEnabled(true);
    }, 5000); // Adjust this value to match your GIF duration
  };

  // Preload the GIF
  useEffect(() => {
    const preloadImage = new Image();
    preloadImage.src = brandGif;
  }, []);

  return (
    <div 
      className={`cursor-pointer relative w-10 h-10 overflow-hidden ${!isEnabled ? 'cursor-not-allowed' : ''}`}
      onClick={handleLogoClick}
      title={isEnabled ? "Click to animate" : "Animation playing..."}
    >
      <img
        ref={imgRef}
        src={isPlaying ? brandGif : staticLogo}
        alt="PiEVerse Logo"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-auto min-w-full min-h-full object-cover"
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