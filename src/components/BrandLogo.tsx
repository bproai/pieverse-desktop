// src/components/BrandLogo.tsx
import React, { useState, useRef, useEffect } from 'react';
import staticLogo from '../assets/logo.svg';
import brandGif from '../assets/brand.gif';
import * as Tone from 'tone';

interface BrandLogoProps {
  isDark: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ isDark }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const leadSynthRef = useRef<Tone.Synth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);

  // Initialize Tone.js instruments
  useEffect(() => {
    // Master volume control - much quieter (-24 decibels is very quiet)
    const masterVolume = new Tone.Volume(+6); // Reduce volume by 24 decibels
    masterVolume.toDestination();
    
    // Create a polyphonic synthesizer with softer settings
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      volume: -12, // Additional reduction at synth level
      envelope: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.2,
        release: 1
      }
    });
    
    // Create a cleaner, brighter synth for the final notes (also quieter)
    leadSynthRef.current = new Tone.Synth({
      volume: -12, // Additional reduction at synth level
      oscillator: {
        type: "sine"
      },
      envelope: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.2,
        release: 1
      }
    });
    
    // Add some reverb for a more professional sound
    reverbRef.current = new Tone.Reverb(1.5);
    
    if (synthRef.current && leadSynthRef.current && reverbRef.current) {
      // Connect everything through the volume control
      synthRef.current.connect(reverbRef.current);
      leadSynthRef.current.connect(reverbRef.current);
      reverbRef.current.connect(masterVolume);
    }
    
    // Clean up on unmount
    return () => {
      if (synthRef.current) synthRef.current.dispose();
      if (leadSynthRef.current) leadSynthRef.current.dispose();
      if (reverbRef.current) reverbRef.current.dispose();
      // Clean up volume node too
      Tone.Destination.volume.value = 0; // Reset master volume
    };
  }, []);

  // Create a global key handler to toggle sound with 'M' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && 
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setSoundEnabled(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save sound preference to localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem('pieverse-sound-enabled');
    if (savedPreference !== null) {
      setSoundEnabled(savedPreference === 'true');
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem('pieverse-sound-enabled', String(soundEnabled));
  }, []);

  const playBrandSound = async () => {
    if (!soundEnabled) return;
    
    try {
      // Wait for user interaction before starting audio context
      await Tone.start();
      
      // Set the base time
      const now = Tone.now();
      
      // Play the startup sound sequence
      if (synthRef.current && leadSynthRef.current) {
        // First note - soft intro
        synthRef.current.triggerAttackRelease("G4", "8n", now);
        
        // Rising melody
        synthRef.current.triggerAttackRelease("C5", "8n", now + 0.3);
        synthRef.current.triggerAttackRelease("E5", "8n", now + 0.6);
        leadSynthRef.current.triggerAttackRelease("G5", "4n", now + 0.9);
        
        // Final chord - bright resolution
        synthRef.current.triggerAttackRelease(["C5", "E5"], "2n", now + 1.5);
        leadSynthRef.current.triggerAttackRelease("C6", "2n", now + 1.5);
      }
    } catch (error) {
      console.warn('Audio playback was prevented:', error);
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    if (!isEnabled) return;
    
    // Check if Alt key is pressed to toggle sound setting
    if (e.altKey || e.metaKey) {
      setSoundEnabled(prev => !prev);
      return;
    }
    
    setIsPlaying(true);
    setIsEnabled(false);

    if (imgRef.current) {
      imgRef.current.src = brandGif + '?play=' + new Date().getTime();
    }

    // Play the synthesized sound
    playBrandSound();

    setTimeout(() => {
      setIsPlaying(false);
      setIsEnabled(true);
    }, 5000); // Match with your animation duration
  };

  useEffect(() => {
    // Preload the animated GIF
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
        group
      `}
      onClick={handleLogoClick}
      title={
        isEnabled 
          ? `Click to animate${soundEnabled ? ' with sound' : ' (sound off)'}. Alt+Click or press M to toggle sound.` 
          : "Animation playing..."
      }
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
      
      {/* Sound indicator */}
      <div className={`
        absolute bottom-0 right-0 w-3 h-3 rounded-full 
        ${soundEnabled ? 'bg-green-500' : 'bg-red-500'}
        opacity-0 group-hover:opacity-70 transition-opacity duration-200
      `} />
    </div>
  );
};

export default BrandLogo;