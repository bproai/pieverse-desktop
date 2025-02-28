// src/components/Avatar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { core } from '@tauri-apps/api'; // Using core.invoke for commands
import './Avatar.css';

const Avatar = () => {
  // Main states
  const [showHelp, setShowHelp] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [expression, setExpression] = useState('neutral');
  const [blinkState, setBlinkState] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [intentResponse, setIntentResponse] = useState('');

  // NEW: Toggle for using the OpenAI model vs. rule-based
  const [useOpenAIModel, setUseOpenAIModel] = useState(false);

  // API key state and custom modal state
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('whisper_api_key') || '';
  });
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Media recording and audio playback states
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordedAudioData, setRecordedAudioData] = useState(null);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const avatarRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Initialize position to bottom right corner
  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 250 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight - 250 : 0 
  });

    // Add these state variables near the top of your Avatar component
  const [modelType, setModelType] = useState('regular'); // 'regular', 'openai', or 'realtime'
  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const rtcAudioElement = useRef(null);

  // Add this useEffect to clean up WebRTC resources on unmount
  useEffect(() => {
    return () => {
      // Close WebRTC connection when component unmounts
      stopRealtimeSession();
    };
  }, []);

  // Add these WebRTC functions

  const startRealtimeSession = async () => {
    try {
      const key = ensureApiKey();
      if (!key) {
        setIntentResponse("API key is required for real-time mode.");
        return;
      }

      setIntentResponse("Starting real-time session...");
      setExpression('excited');

      // Create a new WebRTC peer connection
      const pc = new RTCPeerConnection();
      setPeerConnection(pc);

      // Set up audio element for the model's response
      if (!rtcAudioElement.current) {
        rtcAudioElement.current = document.createElement('audio');
        rtcAudioElement.current.autoplay = true;
      }

      // Handle incoming audio stream
      pc.ontrack = (event) => {
        console.log("Received audio track from OpenAI");
        rtcAudioElement.current.srcObject = event.streams[0];
      };

      // Get microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Add the microphone track to the peer connection
      micStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, micStream);
      });

      // Create data channel for sending/receiving messages
      const dc = pc.createDataChannel("openai-events");
      setDataChannel(dc);

      // Handle data channel events
      dc.onopen = () => {
        console.log("Data channel opened");
        // Wait 500ms before updating the UI state to allow the connection to fully initiate
        setTimeout(() => {
          setIsRealtimeActive(true);
          setIntentResponse("Real-time session started! You can speak or type normally.");
          setExpression('happy');
        }, 500);
      };
      

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Received message:", message);
          
          // Handle different message types
          if (message.type === "response.done" && message.response?.output) {
            // Extract text response
            const textOutputs = message.response.output.filter(o => o.type === "text");
            if (textOutputs.length > 0) {
              setIntentResponse(textOutputs[0].text);
              // No need to speak text as we're using the audio stream
            }
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      };

      dc.onerror = (error) => {
        console.error("Data channel error:", error);
        setIntentResponse("Connection error occurred. Try again.");
        setExpression('thoughtful');
      };

      dc.onclose = () => {
        console.log("Data channel closed");
        setIsRealtimeActive(false);
        setExpression('neutral');
      };

      // Create an offer to start the connection
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send the offer to OpenAI
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model =
        modelType === "realtime-mini" ? "gpt-4o-mini-realtime-preview" : "gpt-4o-realtime-preview";
          
      try {
        const response = await fetch(`${baseUrl}?model=${model}`, {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/sdp",
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
        }
        
        const answerSdp = await response.text();
        const answer = {
          type: "answer",
          sdp: answerSdp,
        };
        
        await pc.setRemoteDescription(answer);
        console.log("WebRTC connection established");
        
        // Initial setup message to OpenAI
        setTimeout(() => {
          if (dc.readyState === "open") {
            sendRealtimeMessage("Hello, I'm ready to chat!");
          }
        }, 1000);
        
      } catch (error) {
        console.error("Error connecting to OpenAI:", error);
        setIntentResponse(`Connection failed: ${error.message}`);
        setExpression('thoughtful');
        stopRealtimeSession();
      }
    } catch (error) {
      console.error("Error setting up WebRTC:", error);
      setIntentResponse(`WebRTC setup failed: ${error.message}`);
      setExpression('thoughtful');
      stopRealtimeSession();
    }
  };

  const stopRealtimeSession = () => {
    if (dataChannel) {
      dataChannel.close();
    }
    
    if (peerConnection) {
      peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.close();
    }
    
    setDataChannel(null);
    setPeerConnection(null);
    setIsRealtimeActive(false);
    setIntentResponse("Real-time session ended.");
  };

  const sendRealtimeMessage = (text) => {
    if (!dataChannel || dataChannel.readyState !== "open") {
      setIntentResponse("Real-time connection not ready. Try again.");
      return;
    }
    
    // Format message according to OpenAI's real-time API expectations
    const message = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: text,
          },
        ],
      },
      event_id: crypto.randomUUID(),
    };
    
    dataChannel.send(JSON.stringify(message));
    
    // Request a response
    const responseRequest = {
      type: "response.create",
      event_id: crypto.randomUUID(),
    };
    
    dataChannel.send(JSON.stringify(responseRequest));
  };

  // Modify the real-time microphone handler
  const handleRealtimeMicToggle = async () => {
    try {
      const key = ensureApiKey();
      if (!key) {
        setIntentResponse("API key is required for real-time mode.");
        return;
      }
      if (!isRealtimeActive) {
        // Update message based on the selected realtime variant
        if (modelType === "realtime-mini") {
          setIntentResponse("Starting realtime mini session...");
        } else {
          setIntentResponse("Starting real-time session...");
        }
        await startRealtimeSession();
  
        // Set up voice activity detection using the Web Audio API
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const THRESHOLD = 30; // Adjust this threshold as needed
  
        const detectVoice = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avg > THRESHOLD) {
            console.log("Voice activity detected.");
            // Additional logic for streaming speech chunks can be added here.
          }
          requestAnimationFrame(detectVoice);
        };
        detectVoice();
      } else {
        // Toggle microphone mute/unmute in the realtime session.
        if (peerConnection) {
          const senders = peerConnection.getSenders();
          const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = !audioSender.track.enabled;
            setIntentResponse(
              audioSender.track.enabled ? "Microphone activated" : "Microphone muted"
            );
          }
        }
      }
    } catch (error: any) {
      console.error("Error in realtime mic toggle:", error);
      setIntentResponse(`Realtime error: ${error.message}`);
    }
  };
  

  // Modified handleInputSubmit to support real-time mode
  const handleRealtimeInputSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim() === '') return;
    
    sendRealtimeMessage(userInput);
    setIntentResponse(`You: ${userInput}`);
    setUserInput('');
  }; 
  
  // --- Custom Modal for API Key ---
  // Modified ensureApiKey: show modal if no key exists.
  const handleApiKeySave = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      localStorage.setItem('whisper_api_key', apiKeyInput.trim());
      setShowApiModal(false);
      setApiKeyInput('');
    }
  };

  const ensureApiKey = () => {
    console.log("ensureApiKey called, apiKey:", apiKey);
    if (!apiKey || apiKey.trim() === "") {
      console.log("No API key found, showing custom modal");
      setShowApiModal(true);
      return null;
    }
    return apiKey;
  };

  // --- Audio Playback Functions ---
  const playRecordedAudio = async () => {
    if (audioUrl && audioRef.current) {
      setIsPlaying(true);
      // setIntentResponse(`DEBUG: ${audioUrl}`);
      
      try {
        // Stop any current playback
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        
        // Handle different URL types
        if (audioUrl.startsWith('asset://') || !audioUrl.startsWith('blob:')) {
          // For Tauri asset URLs, use them directly
          console.log(`Using file URL directly: ${audioUrl}`);
          audioRef.current.src = audioUrl;
        }
        
        // Ensure the audio is loaded
        await audioRef.current.load();
        
        // Start playback with explicit promise handling
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Error playing audio:', error);
            setIntentResponse(`Playback error: ${error.message}`);
            setIsPlaying(false);
          });
        }
      } catch (error) {
        console.error('Exception during playback:', error);
        setIsPlaying(false);
      }
    } else {
      setIntentResponse("Using Tauri backend file for playback");
      try {
        const filePath = await core.invoke('play_last_recording');
        console.log(`Playing recording from file: ${filePath}`);
        
        // Use the proper Tauri asset protocol
        // Use the file path directly with asset protocol
        const fileUrl = `asset://localhost/${filePath}`;
        
        setAudioUrl(fileUrl);
        
        setTimeout(async () => {
          if (audioRef.current) {
            try {
              audioRef.current.src = fileUrl;
              await audioRef.current.load();
              setIsPlaying(true);
              audioRef.current.play();
            } catch (e) {
              console.error('Error playing audio from file:', e);
              setIntentResponse("Couldn't play the recording from file.");
            }
          }
        }, 200);
      } catch (error) {
        console.error('Error playing last recording:', error);
        setIntentResponse("No saved recording found.");
      }
    }
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const sendRecordedAudio = async () => {
    if (recordedAudioData) {
      setIntentResponse("Processing your speech...");
      setExpression('thoughtful');
      try {
        await transcribeWithWhisper(recordedAudioData.base64, recordedAudioData.apiKey);
        setAudioUrl(null);
        setRecordedAudioData(null);
      } catch (error) {
        console.error('Error transcribing audio:', error);
        setIntentResponse(`Sorry, there was an error processing your speech: ${error}`);
        setExpression('thoughtful');
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  // ============== NEW HELPER: CALL OPENAI 4o-mini ==============
  const callOpenAIMini = async (prompt: string, key: string) => {
    try {
      // Using Tauri's core.invoke to call our Rust backend function
      console.log("Calling OpenAI 4o-mini with prompt length:", prompt.length);
      const response = await core.invoke('openai_4o_mini', { 
        prompt, 
        apiKey: key 
      });
      console.log("OpenAI 4o-mini response received");
      return response;
    } catch (error) {
      console.error('OpenAI 4o-mini error:', error);
      return "There was an error calling the 4o-mini model.";
    }
  };

  // ============== Modified: processIntent is now ASYNC ==============
  const processIntent = async (input: string) => {
    if (useOpenAIModel) {
      const key = ensureApiKey();
      if (!key) {
        return { intent: 'error', response: "No API key set." };
      }
      const openAIResponse = await callOpenAIMini(input, key);
      return { intent: 'openai', response: openAIResponse };
    } else {
      const text = input.toLowerCase().trim();
      if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
        return { intent: 'greeting', response: "Hello there! How can I help you today?" };
      } else if (text.includes('weather')) {
        return { intent: 'weather', response: "I'd be happy to check the weather for you. Where are you located?" };
      } else if (text.includes('time')) {
        const now = new Date();
        return { intent: 'time', response: `The current time is ${now.toLocaleTimeString()}.` };
      } else if (text.includes('date') || text.includes('day')) {
        const now = new Date();
        return { intent: 'date', response: `Today is ${now.toLocaleDateString()}.` };
      } else if (text.includes('name')) {
        return { intent: 'name', response: "I'm your friendly anime assistant. You can call me Miku!" };
      } else if (text.includes('thank')) {
        return { intent: 'gratitude', response: "You're welcome! Is there anything else I can help with?" };
      } else if (text.includes('bye') || text.includes('goodbye')) {
        return { intent: 'farewell', response: "Goodbye! Have a wonderful day!" };
      } else if (text.includes('help')) {
        return { 
          intent: 'help', 
          response: "I can help with basic questions about the time, date, weather, and more. Just type your question!"
        };
      } else {
        return { 
          intent: 'unknown', 
          response: "I'm not sure I understand. Could you try phrasing that differently?" 
        };
      }
    }
  };

  const speakResponse = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(text);
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

  // ============== Modified: handleInputSubmit is now ASYNC ==============
  const handleInputSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userInput.trim() === '') return;
    const result = await processIntent(userInput);
    setIntentResponse(result.response);

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
    speakResponse(result.response);
    setUserInput('');
  };

  const handleClick = () => {
    setShowHelp(prev => !prev);
    setIsRunning(true);
    setExpression('happy');
    if (!showHelp) {
      const message = "How can I assist you today?";
      speakResponse(message);
      setIntentResponse('');
    }
    setTimeout(() => {
      setIsRunning(false);
    }, 1000);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setExpression('happy');
      setTimeout(() => {
        setExpression('neutral');
      }, 1000);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    dragStartRef.current = { 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    };
    const initialClickPos = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    setExpression('excited');
    document.addEventListener('mouseup', (upEvent) => {
      const distanceMoved = Math.sqrt(
        Math.pow(upEvent.clientX - initialClickPos.x, 2) + 
        Math.pow(upEvent.clientY - initialClickPos.y, 2)
      );
      if (distanceMoved < 5) {
        handleClick();
      }
      handleMouseUp();
    }, { once: true });
    document.addEventListener('mousemove', handleMouseMove);
  };

  // --- Modified requestMicrophonePermission with timeout ---
  const requestMicrophonePermission = () => {
    if (isListening) {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      setIsListening(false);
      setExpression('neutral');
      return;
    }
    const key = ensureApiKey();
    if (!key) {
      setIntentResponse("API key is required.");
      return;
    }
    setIntentResponse("Preparing microphone...");
    setExpression('excited');

    // Wrap getUserMedia with a timeout
    Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Mic request timed out")), 10000)
      )
    ])
    .then(stream => {
      setIsListening(true);
      setIntentResponse("I'm listening...");
      let mimeType = '';
      try {
        if (MediaRecorder.isTypeSupported) {
          const formats = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'];
          for (const format of formats) {
            if (MediaRecorder.isTypeSupported(format)) {
              mimeType = format;
              console.log(`Using format: ${mimeType}`);
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Error checking supported types:", e);
      }
      let recorderOptions = {};
      if (mimeType) {
        recorderOptions = { mimeType };
      }
      let recorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch (e) {
        console.warn("Error with specified mime type, using default:", e);
        recorder = new MediaRecorder(stream);
      }
      setMediaRecorder(recorder);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setRecordedAudioData(null);
      setAudioChunks([]);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log(`Audio chunk received: ${e.data.size} bytes`);
          setAudioChunks(prev => [...prev, e.data]);
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = async () => {
        console.log("MediaRecorder onstop event triggered");
        setTimeout(async () => {
          try {
            const chunks = audioChunksRef.current;
            console.log(`Processing ${chunks.length} audio chunks`);
            if (chunks.length === 0) {
              console.warn("No audio chunks collected during recording");
              setIntentResponse("No audio was recorded. Please try again.");
              setExpression('thoughtful');
              return;
            }
            const audioBlob = new Blob(chunks, { type: mimeType || 'audio/mp3' });
            console.log(`Created audio blob: ${audioBlob.size} bytes`);
            
            // Create a blob URL for development playback
            const url = URL.createObjectURL(audioBlob);
            console.log(`Created audio blob URL: ${url}`);
            
            setAudioUrl(url);
            setIntentResponse("I recorded that! Click Play to review before sending, or Send to transcribe now.");
            setExpression('happy');

            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              try {
                const base64Data = reader.result.split(',')[1];
                console.log("Converted audio to base64");
                setRecordedAudioData({
                  base64: base64Data,
                  apiKey: key
                });
                
                // Also save the audio via core.invoke for production playback
                try {
                  await core.invoke('save_audio_recording', {
                    audioBase64: base64Data
                  });
                  console.log("Saved recording through Tauri backend");
                } catch (e) {
                  console.log("Failed to save recording through backend:", e);
                }
                
                console.log("Audio data prepared for sending");
              } catch (error) {
                console.error('Error processing audio:', error);
                setIntentResponse(`Processing error: ${error.message || 'Unknown error'}`);
                setExpression('thoughtful');
              }
            };
          } finally {
            stream.getTracks().forEach(track => track.stop());
          }
        }, 200);
        setIsListening(false);
        console.log("isListening set to false");
      };
      recorder.start(100);
      console.log(`Recording started with timeslice: 100ms`);
      setTimeout(() => {
        if (recorder && recorder.state === "recording") {
          try {
            recorder.stop();
          } catch (e) {
            console.error('Error stopping recorder:', e);
            stream.getTracks().forEach(track => track.stop());
            setIsListening(false);
          }
        }
      }, 30000);
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      setIntentResponse("I need permission to access your microphone. Please try again and allow microphone access.");
      setExpression('thoughtful');
      setIsListening(false);
    });
  };

  const transcribeWithWhisper = async (audioBase64: string, apiKey: string) => {
    try {
      const mimeType = mediaRecorder ? mediaRecorder.mimeType : 'audio/mp3';
      console.log(`Transcribing audio with format: ${mimeType || 'unknown'}`);
      const transcription = await core.invoke('transcribe_audio', {
        audioBase64,
        apiKey
      });

      console.log('-----------------------------------');
      console.log('TRANSCRIPTION RESULT:');
      console.log(`"${transcription}"`);
      console.log(`Length: ${transcription ? transcription.length : 0} characters`);
      console.log('-----------------------------------');

      if (transcription) {
        setUserInput(transcription);
        const result = await processIntent(transcription);
        setIntentResponse(result.response);

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
        speakResponse(result.response);
      } else {
        setIntentResponse("I couldn't understand what you said. Could you try again?");
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      setIntentResponse(`Sorry, there was an error processing your speech: ${error}`);
      setExpression('thoughtful');
    } finally {
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping recognition on unmount:", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 250,
        y: window.innerHeight - 250
      });
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 200);
    }, 4000);
    return () => clearInterval(blinkInterval);
  }, []);

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

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  return (
    <>
      {/* Hidden audio element for playback */}
      <audio 
        ref={audioRef}
        src={audioUrl || ''}
        onEnded={handleAudioEnded}
        onError={(e) => console.error("Audio playback error:", e)}
        style={{ display: 'none' }}
        preload="auto"
      />
      
      {/* Custom API Key Modal with inline styles for debugging */}
      {showApiModal && (
        <div
          style={{
            display: 'block',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '20px',
              margin: '100px auto',
              width: '300px',
              borderRadius: '8px'
            }}
          >
            <h2>Enter OpenAI API Key</h2>
            <input 
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter API key here..."
              style={{ width: '100%', padding: '10px' }}
            />
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <button onClick={handleApiKeySave}>Save</button>
              <button onClick={() => setShowApiModal(false)} style={{ marginLeft: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
          <path
            d="M60,140 L60,190 C60,210 100,220 100,220 C100,220 140,210 140,190 L140,140 C140,140 125,155 100,155 C75,155 60,140 60,140 Z"
            fill="url(#outfitGradient)"
            className="outfit"
          />
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
          <path
            d="M90,140 C90,140 94,145 100,145 C106,145 110,140 110,140 L110,150 C110,150 106,155 100,155 C94,155 90,150 90,150 Z"
            fill="url(#skinGradient)"
            className="neck"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="40"
            ry="45"
            fill="url(#skinGradient)"
            className="head"
            filter="url(#softShadow)"
          />
          <path
            d="M60,110 C60,70 70,50 100,50 C130,50 140,70 140,110
               C140,110 135,65 100,65 C65,65 60,110 60,110 Z"
            fill="url(#hairGradient)"
            className="hair-back"
          />
          <path
            d="M63,85 C63,60 75,55 100,55 C125,55 137,60 137,85
               C137,85 132,65 100,65 C68,65 63,85 63,85
               L65,70 C65,70 80,55 100,55 C120,55 135,70 135,70
               L137,85 C137,85 145,100 135,120
               L135,85 L115,70 L85,70 L65,85 Z"
            fill="url(#hairGradient)"
            className="hair-front"
          />
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
          <g className="face-features">
            <g className="eyebrows">
              <path d="M80,83 Q85,80 90,83" stroke="#333" strokeWidth="1.5" className="eyebrow-left" />
              <path d="M110,83 Q115,80 120,83" stroke="#333" strokeWidth="1.5" className="eyebrow-right" />
            </g>
            <ellipse cx="85" cy="90" rx="7" ry={blinkState ? 0.5 : 8} fill="#FFFFFF" className="eye-left" />
            <ellipse cx="115" cy="90" rx="7" ry={blinkState ? 0.5 : 8} fill="#FFFFFF" className="eye-right" />
            <g className="irises">
              <circle cx="85" cy="90" r={blinkState ? 0 : 3.5} fill="#9277FF" className="iris-left" />
              <circle cx="115" cy="90" r={blinkState ? 0 : 3.5} fill="#9277FF" className="iris-right" />
            </g>
            <circle cx="83.5" cy="88.5" r={blinkState ? 0 : 1.5} fill="#FFFFFF" className="highlight-left" />
            <circle cx="113.5" cy="88.5" r={blinkState ? 0 : 1.5} fill="#FFFFFF" className="highlight-right" />
            <path d="M90,110 Q100,115 110,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-neutral" />
            <path d="M90,110 Q100,120 110,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-happy" />
            <path d="M95,110 Q100,108 105,110" stroke="#333" strokeWidth="1.5" fill="none" className="mouth-thoughtful" />
            <path d="M90,110 Q100,125 110,110 Z" stroke="#333" strokeWidth="1.5" fill="#FFA8A8" fillOpacity="0.4" className="mouth-excited" />
            <circle cx="75" cy="100" r="6" fill="url(#blushGradient)" opacity="0.6" className="blush-left" />
            <circle cx="125" cy="100" r="6" fill="url(#blushGradient)" opacity="0.6" className="blush-right" />
          </g>
          <path
            d="M70,70 L85,85 M95,60 L95,75 M105,60 L105,75 M115,85 L130,70"
            stroke="url(#hairGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            className="hair-bangs"
          />
          <path
            d="M120,70 L125,60 L130,70 L125,68 Z"
            fill="#FF73FA"
            stroke="#9277FF"
            strokeWidth="1"
            className="hair-accessory"
          />
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

            {/* Model selection dropdown */}
            <select
              id="model-select"
              value={modelType}
              onChange={(e) => {
                const newType = e.target.value;
                // If currently in a realtime session and switching between realtime variants, close the connection.
                if (
                  isRealtimeActive &&
                  (modelType === "realtime" || modelType === "realtime-mini") &&
                  newType !== modelType
                ) {
                  stopRealtimeSession();
                }
                setModelType(newType);
                // For backward compatibility with existing code.
                setUseOpenAIModel(newType === "openai");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.2)",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                cursor: "pointer"
              }}
            >
              <option value="regular">Rule-based</option>
              <option value="openai">OpenAI 4o-mini</option>
              <option value="realtime">OpenAI Real-time</option>
              <option value="realtime-mini">OpenAI Real-time (mini)</option>
            </select>


            {audioUrl && (
              <div className="audio-controls">
                <button 
                  className={`play-button ${isPlaying ? 'playing' : ''}`}
                  onClick={isPlaying ? stopPlayback : playRecordedAudio}
                >
                  {isPlaying ? 'Stop' : 'Play Recording'}
                </button>
                <button 
                  className="send-button"
                  onClick={sendRecordedAudio}
                >
                  Send
                </button>
                <button 
                  className="discard-button"
                  onClick={() => {
                    if (audioUrl) {
                      URL.revokeObjectURL(audioUrl);
                      setAudioUrl(null);
                    }
                    setRecordedAudioData(null);
                    setIntentResponse("Recording discarded. What would you like to do next?");
                  }}
                >
                  Discard
                </button>
              </div>
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
                  className={`voice-button ${isListening ? "listening" : ""}`}
                  onClick={() => {
                    if (modelType === "realtime" || modelType === "realtime-mini") {
                      handleRealtimeMicToggle();
                    } else {
                      requestMicrophonePermission();
                    }
                  }}
                  disabled={intentResponse === "Preparing microphone..."}
                >
                  {(modelType === "realtime" || modelType === "realtime-mini")
                    ? (isRealtimeActive ? "Toggle Mic" : "Start Realtime") 
                    : (isListening ? "Listening..." : "Speak")}
                </button>

                <button 
                  type="button" 
                  className="close-button"
                  onClick={() => {
                    setShowHelp(false);
                    if (audioUrl) {
                      URL.revokeObjectURL(audioUrl);
                      setAudioUrl(null);
                    }
                    setRecordedAudioData(null);
                    setAudioChunks([]);
                  }}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showApiModal && (
        <div
          style={{
            display: 'block',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '20px',
              margin: '100px auto',
              width: '300px',
              borderRadius: '8px'
            }}
          >
            <h2>Enter OpenAI API Key</h2>
            <input 
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter API key here..."
              style={{ width: '100%', padding: '10px' }}
            />
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <button onClick={handleApiKeySave}>Save</button>
              <button onClick={() => setShowApiModal(false)} style={{ marginLeft: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Avatar;
