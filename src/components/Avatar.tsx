// src/components/Avatar.tsx
import React, { useState, useEffect, useRef } from 'react';
import './Avatar.css';

const Avatar = () => {
  const [showHelp, setShowHelp] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [expression, setExpression] = useState('neutral');
  const [blinkState, setBlinkState] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [intentResponse, setIntentResponse] = useState('');
  const dragStartRef = useRef({ x: 0, y: 0 });
  const avatarRef = useRef(null);

  // Initialize position to bottom right corner
  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 250 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight - 250 : 0 
  });

  // Process user input and determine intent
  const processIntent = (input) => {
    const text = input.toLowerCase().trim();
    
    // Simple intent matching system
    if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
      return { intent: 'greeting', response: "Hello there! How can I help you today?" };
    }
    else if (text.includes('weather')) {
      return { intent: 'weather', response: "I'd be happy to check the weather for you. Where are you located?" };
    }
    else if (text.includes('time')) {
      const now = new Date();
      return { intent: 'time', response: `The current time is ${now.toLocaleTimeString()}.` };
    }
    else if (text.includes('date') || text.includes('day')) {
      const now = new Date();
      return { intent: 'date', response: `Today is ${now.toLocaleDateString()}.` };
    }
    else if (text.includes('name')) {
      return { intent: 'name', response: "I'm your friendly anime assistant. You can call me Miku!" };
    }
    else if (text.includes('thank')) {
      return { intent: 'gratitude', response: "You're welcome! Is there anything else I can help with?" };
    }
    else if (text.includes('bye') || text.includes('goodbye')) {
      return { intent: 'farewell', response: "Goodbye! Have a wonderful day!" };
    }
    else if (text.includes('help')) {
      return { 
        intent: 'help', 
        response: "I can help with basic questions about the time, date, weather, and more. Just type your question!" 
      };
    }
    else {
      return { 
        intent: 'unknown', 
        response: "I'm not sure I understand. Could you try phrasing that differently?" 
      };
    }
  };

  // Handle submission of user input
  const handleInputSubmit = (e) => {
    e.preventDefault();
    
    if (userInput.trim() === '') return;
    
    // Process the input to determine intent
    const result = processIntent(userInput);
    
    // Set the response
    setIntentResponse(result.response);
    
    // Change expression based on intent
    switch (result.intent) {
      case 'greeting':
      case 'gratitude':
        setExpression('happy');
        break;
      case 'farewell':
        setExpression('thoughtful');
        break;
      case 'unknown':
        setExpression('thoughtful');
        break;
      default:
        setExpression('excited');
    }
    
    // Speak the response
    if ('speechSynthesis' in window) {
      const speech = new SpeechSynthesisUtterance(result.response);
      
      // Try to get the Samantha voice specifically
      const voices = window.speechSynthesis.getVoices();
      const samanthaVoice = voices.find(voice => voice.name.includes('Samantha'));
      
      if (samanthaVoice) {
        speech.voice = samanthaVoice;
      } else {
        // Fallback to any female voice if Samantha isn't available
        const femaleVoices = voices.filter(voice => 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('girl') ||
          voice.name.includes('Victoria') ||
          voice.name.includes('Tessa')
        );
        
        if (femaleVoices.length > 0) {
          speech.voice = femaleVoices[0];
        }
      }
      
      // Higher pitch and slightly faster rate for young girl voice
      speech.rate = 1.1;
      speech.pitch = 1.4;
      speech.volume = 0.8;
      
      window.speechSynthesis.speak(speech);
    }
    
    // Clear the input field
    setUserInput('');
  };

  // Separate click handler from drag functionality
  const handleClick = () => {
    // Toggle help panel
    setShowHelp(prev => !prev);
    
    // Trigger active animation
    setIsRunning(true);
    
    // Set happy expression when clicked
    setExpression('happy');
    
    // Speak when opening the panel
    if (!showHelp) {
      const message = "How can I assist you today?";
      
      // Use speech synthesis if available
      if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(message);
        
        // Try to get the Samantha voice specifically
        const voices = window.speechSynthesis.getVoices();
        const samanthaVoice = voices.find(voice => voice.name.includes('Samantha'));
        
        if (samanthaVoice) {
          speech.voice = samanthaVoice;
        } else {
          // Fallback to any female voice if Samantha isn't available
          const femaleVoices = voices.filter(voice => 
            voice.name.toLowerCase().includes('female') || 
            voice.name.toLowerCase().includes('girl') ||
            voice.name.includes('Victoria') ||
            voice.name.includes('Tessa')
          );
          
          if (femaleVoices.length > 0) {
            speech.voice = femaleVoices[0];
          }
        }
        
        // Higher pitch and slightly faster rate for young girl voice
        speech.rate = 1.1;    // Slightly faster speaking rate
        speech.pitch = 1.4;   // Higher pitch for young girl voice
        speech.volume = 0.8;
        
        window.speechSynthesis.speak(speech);
      }
      
      // Clear previous responses
      setIntentResponse('');
    }
    
    // Reset running animation after it completes
    setTimeout(() => {
      setIsRunning(false);
    }, 1000);
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setExpression('happy'); // Change back to happy after dragging
      
      // Reset to neutral after a moment
      setTimeout(() => {
        setExpression('neutral');
      }, 1000);
      
      // Remove document event listeners
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    }
  };

  const handleMouseDown = (e) => {
    // Prevent default behaviors
    e.preventDefault();
    
    // Store initial position for drag calculation
    dragStartRef.current = { 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    };
    
    // Also store the initial click position to determine if it's a drag or click
    const initialClickPos = { x: e.clientX, y: e.clientY };
    
    setIsDragging(true);
    setExpression('excited'); // Change expression while dragging
    
    // Add mouse up and move listeners
    document.addEventListener('mouseup', (upEvent) => {
      // Calculate distance moved to determine if this was a drag or click
      const distanceMoved = Math.sqrt(
        Math.pow(upEvent.clientX - initialClickPos.x, 2) + 
        Math.pow(upEvent.clientY - initialClickPos.y, 2)
      );
      
      // If the mouse barely moved, treat it as a click
      if (distanceMoved < 5) {
        handleClick();
      }
      
      handleMouseUp();
    }, { once: true });
    
    document.addEventListener('mousemove', handleMouseMove);
  };

  // Toggle speech recognition
  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      setExpression('excited');
      
      // Check if speech recognition is available
      if ('webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
          setIntentResponse("I'm listening...");
        };
        
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setUserInput(transcript);
          
          // Process the transcript immediately
          const result = processIntent(transcript);
          setIntentResponse(result.response);
          
          // Update expression based on intent
          switch (result.intent) {
            case 'greeting':
            case 'gratitude':
              setExpression('happy');
              break;
            case 'farewell':
              setExpression('thoughtful');
              break;
            case 'unknown':
              setExpression('thoughtful');
              break;
            default:
              setExpression('excited');
          }
          
          // Speak the response
          if ('speechSynthesis' in window) {
            const speech = new SpeechSynthesisUtterance(result.response);
            
            // Try to get the Samantha voice
            const voices = window.speechSynthesis.getVoices();
            const samanthaVoice = voices.find(voice => voice.name.includes('Samantha'));
            
            if (samanthaVoice) {
              speech.voice = samanthaVoice;
            } else {
              const femaleVoices = voices.filter(voice => 
                voice.name.toLowerCase().includes('female') || 
                voice.name.toLowerCase().includes('girl') ||
                voice.name.includes('Victoria') ||
                voice.name.includes('Tessa')
              );
              
              if (femaleVoices.length > 0) {
                speech.voice = femaleVoices[0];
              }
            }
            
            speech.rate = 1.1;
            speech.pitch = 1.4;
            speech.volume = 0.8;
            
            window.speechSynthesis.speak(speech);
          }
        };
        
        recognition.onerror = (event) => {
          console.error('Speech recognition error', event.error);
          setIntentResponse("Sorry, I couldn't hear you clearly. Please try typing instead.");
          setIsListening(false);
          setExpression('thoughtful');
        };
        
        recognition.onend = () => {
          setIsListening(false);
          setExpression('neutral');
        };
        
        try {
          recognition.start();
        } catch (e) {
          console.error('Speech recognition error:', e);
          setIntentResponse("Sorry, there was an error starting speech recognition. Please try typing instead.");
          setIsListening(false);
        }
      } else {
        setIntentResponse("Sorry, speech recognition isn't supported in your browser. Please type your question instead.");
        setIsListening(false);
        setExpression('thoughtful');
      }
    } else {
      setIsListening(false);
    }
  };

  // Initialize position on component mount
  useEffect(() => {
    // Set initial position to bottom right corner
    if (typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 250,
        y: window.innerHeight - 250
      });
    }
    
    // Clean up event listeners on component unmount
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Handle blinking effect
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 200);
    }, 4000);
    
    return () => clearInterval(blinkInterval);
  }, []);

  // Cycle through expressions
  useEffect(() => {
    if (!showHelp) {
      const expressionInterval = setInterval(() => {
        setExpression(current => {
          const expressions = ['neutral', 'happy', 'thoughtful', 'excited'];
          const currentIndex = expressions.indexOf(current);
          const nextIndex = (currentIndex + 1) % expressions.length;
          return expressions[nextIndex];
        });
      }, 15000);
      
      return () => clearInterval(expressionInterval);
    }
  }, [showHelp]);

  // Load voices when component mounts
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  return (
    <>
      <div 
        ref={avatarRef}
        className={`avatar-container ${isRunning ? 'running' : ''} ${isDragging ? 'dragging' : ''} expression-${expression}`} 
        onMouseDown={handleMouseDown}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: 'auto',
          bottom: 'auto',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <svg
          width="200"
          height="240"
          viewBox="0 0 200 240"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Base gradients */}
            <linearGradient id="hairGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6A3DE8" />
              <stop offset="100%" stopColor="#4924B1" />
            </linearGradient>
            
            <linearGradient id="skinGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFF5E6" />
              <stop offset="100%" stopColor="#FFE6D9" />
            </linearGradient>
            
            <linearGradient id="outfitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7068FF" />
              <stop offset="100%" stopColor="#453FD3" />
            </linearGradient>
            
            <radialGradient id="blushGradient" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#FF9E9E" />
              <stop offset="100%" stopColor="#FF9E9E" stopOpacity="0" />
            </radialGradient>
            
            {/* Filters */}
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
              <feOffset dx="0" dy="2" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="glowEffect" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>
          </defs>
          
          {/* Background aura effect */}
          <ellipse 
            cx="100" 
            cy="120" 
            rx="80" 
            ry="95" 
            fill="#C6B5FF" 
            opacity="0.2" 
            className="aura" 
            filter="url(#glowEffect)"
          />
          
          {/* Main body/outfit */}
          <path
            d="M60,140 L60,190 C60,210 100,220 100,220 C100,220 140,210 140,190 L140,140 C140,140 125,155 100,155 C75,155 60,140 60,140 Z"
            fill="url(#outfitGradient)"
            className="outfit"
          />
          
          {/* Outfit collar/details */}
          <path
            d="M70,145 C70,145 85,155 100,155 C115,155 130,145 130,145"
            stroke="#9E99FF"
            strokeWidth="3"
            fill="none"
            className="collar"
          />
          <path
            d="M90,160 L90,185 M110,160 L110,185"
            stroke="#5F57EB"
            strokeWidth="2"
            strokeDasharray="3,3"
            className="outfit-details"
          />
          
          {/* Neck */}
          <path
            d="M90,140 C90,140 94,145 100,145 C106,145 110,140 110,140 L110,150 C110,150 106,155 100,155 C94,155 90,150 90,150 Z"
            fill="url(#skinGradient)"
            className="neck"
          />
          
          {/* Head base */}
          <ellipse
            cx="100"
            cy="100"
            rx="40"
            ry="45"
            fill="url(#skinGradient)"
            className="head"
            filter="url(#softShadow)"
          />
          
          {/* Main hair */}
          <path
            d="M60,110 C60,70 70,50 100,50 C130,50 140,70 140,110
               C140,110 135,65 100,65 C65,65 60,110 60,110 Z"
            fill="url(#hairGradient)"
            className="hair-back"
          />
          
          {/* Hair front with bangs */}
          <path
            d="M63,85 C63,60 75,55 100,55 C125,55 137,60 137,85
               C137,85 132,65 100,65 C68,65 63,85 63,85
               L65,70 C65,70 80,55 100,55 C120,55 135,70 135,70
               L137,85 C137,85 145,100 135,120
               L135,85 L115,70 L85,70 L65,85 Z"
            fill="url(#hairGradient)"
            className="hair-front"
          />
          
          {/* Hair strands */}
          <path
            d="M65,100 C65,100 50,120 55,150"
            stroke="url(#hairGradient)"
            strokeWidth="6"
            fill="none"
            className="hair-strand-left"
          />
          <path
            d="M135,100 C135,100 150,120 145,150"
            stroke="url(#hairGradient)"
            strokeWidth="6"
            fill="none"
            className="hair-strand-right"
          />
          
          {/* Face features group */}
          <g className="face-features">
            {/* Eyebrows */}
            <g className="eyebrows">
              <path d="M80,83 Q85,80 90,83" stroke="#333" strokeWidth="1.5" className="eyebrow-left" />
              <path d="M110,83 Q115,80 120,83" stroke="#333" strokeWidth="1.5" className="eyebrow-right" />
            </g>
            
            {/* Eyes - base white */}
            <ellipse cx="85" cy="90" rx="7" ry={blinkState ? 0.5 : 8} fill="#FFFFFF" className="eye-left" />
            <ellipse cx="115" cy="90" rx="7" ry={blinkState ? 0.5 : 8} fill="#FFFFFF" className="eye-right" />
            
            {/* Irises - change with expression */}
            <g className="irises">
              <circle cx="85" cy="90" r={blinkState ? 0 : 3.5} fill="#9277FF" className="iris-left" />
              <circle cx="115" cy="90" r={blinkState ? 0 : 3.5} fill="#9277FF" className="iris-right" />
            </g>
            
            {/* Eye highlights */}
            <circle cx="83.5" cy="88.5" r={blinkState ? 0 : 1.5} fill="#FFFFFF" className="highlight-left" />
            <circle cx="113.5" cy="88.5" r={blinkState ? 0 : 1.5} fill="#FFFFFF" className="highlight-right" />
            
            {/* Expressions - mouths (visibility controlled by CSS) */}
            <path d="M90,110 Q100,115 110,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-neutral" />
            <path d="M90,110 Q100,120 110,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-happy" />
            <path d="M95,110 Q100,108 105,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-thoughtful" />
            <path d="M90,110 Q100,125 110,110 Z" stroke="#333" strokeWidth="1.5" fill="#FFA8A8" fillOpacity="0.4" className="mouth-excited" />
            
            {/* Blush marks */}
            <circle cx="75" cy="100" r="6" fill="url(#blushGradient)" opacity="0.6" className="blush-left" />
            <circle cx="125" cy="100" r="6" fill="url(#blushGradient)" opacity="0.6" className="blush-right" />
          </g>
          
          {/* Hair bangs overlay (after face features) */}
          <path
            d="M70,70 L85,85 M95,60 L95,75 M105,60 L105,75 M115,85 L130,70"
            stroke="url(#hairGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            className="hair-bangs"
          />
          
          {/* Hair accessory */}
          <path
            d="M120,70 L125,60 L130,70 L125,68 Z"
            fill="#FF73FA"
            stroke="#9277FF"
            strokeWidth="1"
            className="hair-accessory"
          />
          
          {/* Glowing hair highlights */}
          <path
            d="M70,90 C70,90 75,85 80,90 M120,90 C120,90 125,85 130,90"
            stroke="#FFFFFF"
            strokeWidth="2"
            opacity="0.4"
            className="hair-highlight"
          />
        </svg>
      </div>

      {showHelp && (
        <div 
          className="help-panel" 
          style={{
            position: 'fixed',
            left: `${position.x + 220}px`,
            top: `${position.y + 20}px`
          }}
        >
          <div className="help-content">
            <h2>Hello!</h2>
            
            {intentResponse ? (
              <p className="intent-response">{intentResponse}</p>
            ) : (
              <p>How can I assist you today?</p>
            )}
            
            <form onSubmit={handleInputSubmit} className="intent-form">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type your question here..."
                className="intent-input"
              />
              <div className="button-group">
                <button type="submit" className="submit-button">
                  Send
                </button>
                <button 
                  type="button" 
                  className={`voice-button ${isListening ? 'listening' : ''}`}
                  onClick={toggleListening}
                >
                  {isListening ? 'Listening...' : 'Speak'}
                </button>
                <button 
                  type="button" 
                  className="close-button"
                  onClick={() => setShowHelp(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Avatar;