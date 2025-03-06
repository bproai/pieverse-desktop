// src/components/BrandLogo.tsx
import React, { useState, useRef, useEffect } from 'react';
import staticLogo from '../assets/logo.svg';
import brandGif from '../assets/brand.gif';
import * as Tone from 'tone';
import { invoke } from '@tauri-apps/api/core';

interface BrandLogoProps {
  isDark: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ isDark }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const leadSynthRef = useRef<Tone.Synth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Debug function
  const debugLog = (message: string, error?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[BrandLogo] ${message}`, error || '');
    }
  };

  // Detect if we're running in Tauri production mode
  const isTauriProduction = () => {
    return window.__TAURI__ !== undefined;
  };

  // Initialize Tone.js instruments for development
  // or audio element for production
  useEffect(() => {
    let isMounted = true;
    
    // For development or when not in Tauri production
    if (!isTauriProduction()) {
      debugLog('Initializing Tone.js in development mode');
      
      const initAudio = async () => {
        try {
          // Master volume control - extremely quiet
          const masterVolume = new Tone.Volume(+3);
          masterVolume.toDestination();
          
          // Create a polyphonic synthesizer with softer settings
          const polysynth = new Tone.PolySynth(Tone.Synth, {
            volume: -6,
            envelope: {
              attack: 0.05,
              decay: 0.1,
              sustain: 0.2,
              release: 1
            }
          });
          
          // Create a cleaner, brighter synth for the final notes
          const leadSynth = new Tone.Synth({
            volume: -6,
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
          const reverb = new Tone.Reverb(1.5);
          
          await reverb.generate(); // Generate the reverb impulse
          
          polysynth.connect(reverb);
          leadSynth.connect(reverb);
          reverb.connect(masterVolume);
          
          if (isMounted) {
            synthRef.current = polysynth;
            leadSynthRef.current = leadSynth;
            reverbRef.current = reverb;
            setAudioInitialized(true);
            debugLog('Audio initialized successfully');
          }
        } catch (error) {
          debugLog('Failed to initialize audio', error);
          if (isMounted) {
            setAudioInitialized(false);
          }
        }
      };
      
      initAudio();
    } else {
      // In Tauri production, we'll use HTMLAudioElement instead
      debugLog('Running in Tauri production mode, using native audio');
      setAudioInitialized(true);
      
      // Make sure the audio element exists
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 0.2; // Set volume to 20%
      }
      
      // Check if brand sound exists
      invoke<boolean>('check_brand_sound_exists')
        .then(exists => {
          debugLog(`Brand sound file exists: ${exists}`);
        })
        .catch(err => {
          debugLog('Error checking brand sound file:', err);
        });
    }
    
    return () => {
      isMounted = false;
      
      // Clean up audio resources
      if (!isTauriProduction()) {
        if (synthRef.current) {
          debugLog('Disposing polysynth');
          synthRef.current.dispose();
        }
        if (leadSynthRef.current) {
          debugLog('Disposing lead synth');
          leadSynthRef.current.dispose();
        }
        if (reverbRef.current) {
          debugLog('Disposing reverb');
          reverbRef.current.dispose();
        }
        
        // Reset master volume
        Tone.Destination.volume.value = 0;
      } else if (audioRef.current) {
        debugLog('Cleaning up audio element');
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      debugLog('Audio cleanup complete');
    };
  }, []);

  // Create a global key handler to toggle sound with 'M' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && 
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setSoundEnabled(prev => !prev);
        debugLog('Sound toggled via key press');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save sound preference to localStorage
  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem('pieverse-sound-enabled');
      if (savedPreference !== null) {
        setSoundEnabled(savedPreference === 'true');
        debugLog(`Loaded sound preference: ${savedPreference}`);
      }
    } catch (e) {
      debugLog('Error loading sound preference', e);
    }
  }, []);
  
  useEffect(() => {
    try {
      localStorage.setItem('pieverse-sound-enabled', String(soundEnabled));
      debugLog(`Saved sound preference: ${soundEnabled}`);
    } catch (e) {
      debugLog('Error saving sound preference', e);
    }
  }, [soundEnabled]);

  // Play recording in Tauri production mode using asset protocol
  const playTauriAudio = async () => {
    try {
      debugLog('Starting Tauri audio playback');
      
      // Get the path to the audio file from Tauri backend
      const soundPath = await invoke<string>('get_brand_sound_path');
      debugLog(`Playing brand sound from: ${soundPath}`);
      
      if (audioRef.current) {
        // Use the asset protocol to access the file
        audioRef.current.src = `asset://localhost/${soundPath}`;
        audioRef.current.volume = 0.2; // Set volume to 20%
        
        try {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              debugLog('Error playing audio in Tauri:', error);
            });
          }
          debugLog('Audio playback started');
        } catch (error) {
          debugLog('Exception during audio playback:', error);
        }
      } else {
        debugLog('Audio element not available');
      }
    } catch (error) {
      debugLog('Error accessing brand sound:', error);
      
      // Fallback to synthesized sound if file can't be accessed
      if (!isTauriProduction()) {
        await playToneJSSound();
      }
    }
  };

  // Play sound using Tone.js (for development)
  const playToneJSSound = async () => {
    if (!soundEnabled || !audioInitialized) {
      debugLog(`Sound not played: enabled=${soundEnabled}, initialized=${audioInitialized}`);
      return;
    }
    
    try {
      debugLog('Starting audio context...');
      
      // This must be called in response to a user action
      // It starts the audio context
      await Tone.start();
      
      debugLog('Audio context started, playing sound...');
      
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
        
        debugLog('Sound sequence triggered');
      } else {
        debugLog('Sound refs not available:', { 
          synth: !!synthRef.current, 
          leadSynth: !!leadSynthRef.current 
        });
      }
    } catch (error) {
      debugLog('Audio playback was prevented', error);
      
      // Try to reinitialize audio
      if (synthRef.current === null || leadSynthRef.current === null) {
        setAudioInitialized(false);
      }
    }
  };

  // Unified function to play brand sound
  const playBrandSound = async () => {
    if (!soundEnabled) {
      debugLog('Sound is disabled, not playing');
      return;
    }
    
    if (isTauriProduction()) {
      await playTauriAudio();
    } else {
      await playToneJSSound();
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    if (!isEnabled) {
      debugLog('Click ignored: animation already playing');
      return;
    }
    
    // Check if Alt/Option key or Command key is pressed to toggle sound setting
    if (e.altKey || e.metaKey) {
      setSoundEnabled(prev => !prev);
      debugLog('Sound toggled via modifier key');
      return;
    }
    
    debugLog('Logo clicked, starting animation');
    setIsPlaying(true);
    setIsEnabled(false);

    if (imgRef.current) {
      imgRef.current.src = brandGif + '?play=' + new Date().getTime();
      debugLog('Animation source updated');
    }

    // Play the synthesized sound
    playBrandSound();

    setTimeout(() => {
      debugLog('Animation completed');
      setIsPlaying(false);
      setIsEnabled(true);
    }, 5000); // Match with your animation duration
  };

  useEffect(() => {
    // Preload the animated GIF
    const preloadImage = new Image();
    preloadImage.src = brandGif;
    debugLog('Animation preloaded');
  }, []);

  return (
    <>
      {/* Hidden audio element for production playback */}
      <audio 
        ref={audioRef}
        style={{ display: 'none' }}
        preload="auto"
        onError={(e) => debugLog('Audio element error:', e)}
      />
      
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
            ? `Click to animate${soundEnabled ? ' with sound' : ' (sound off)'}. Option+Click or press M to toggle sound.` 
            : "Animation playing..."
        }
      >
        <img
          ref={imgRef}
          src={isPlaying ? brandGif : staticLogo}
          alt="PieVerse Logo"
          className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
            h-full w-auto min-w-full min-h-full object-cover
            ${isDark ? 'brightness-110' : ''}
            transition-all duration-200
          `}
          onLoad={() => {
            if (isPlaying) {
              debugLog('Animation loaded');
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
    </>
  );
};

export default BrandLogo;