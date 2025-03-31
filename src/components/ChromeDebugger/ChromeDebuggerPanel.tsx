// src/components/ChromeDebugger/ChromeDebuggerPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  Stack, 
  Alert, 
  Badge, 
  ScrollArea,
  ActionIcon,
  Tooltip,
  MultiSelect,
  Code,
  Collapse,
  ThemeIcon
} from '@mantine/core';

// Import specific icons individually
import { 
  AlertCircle, 
  RefreshCw, 
  TerminalSquare, 
  Download, 
  Trash, 
  Info, 
  Terminal, 
  Check, 
  Globe, 
  FileCode, 
  ServerCog, 
  Code2, 
  LayoutTemplate, 
  Copy 
} from 'lucide-react';

// Import Tauri API for Tauri 2
import { core } from '@tauri-apps/api';
// Add imports for the dialog and fs plugins
import { save as saveDialog } from '@tauri-apps/plugin-dialog'; 
import { writeTextFile } from '@tauri-apps/plugin-fs';


// Interfaces
interface ChromeTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
  favicon?: string;
  parentId?: string;
}

interface ConsoleMessage {
  id: string;
  timestamp: number;
  level: string;
  text: string;
  source: string;
  targetId: string;
  targetTitle: string;
}

interface WebSocketOption {
  value: string;            // The websocket URL (used for connection)
  label: string;            // Display title
  url: string;              // The page/iframe/worker URL
  type: string;             // Type of target
  webSocketDebuggerUrl: string;  // Full WebSocket URL
  id: string;               // Target ID
  favicon?: string;      // Favicon URL when available
}

// Custom component for rendering the dropdown items
const ChromeTargetItem = ({ 
  label, 
  url, 
  type, 
  webSocketDebuggerUrl,
  favicon
}) => {
  // State for copy feedback
  const [copyStatus, setCopyStatus] = useState(false);
  
  // Truncate strings to reasonable lengths
  const truncateUrl = (url, maxLength = 40) => {
    if (!url) return '';
    return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
  };
  
  const truncateWsUrl = (wsUrl, maxLength = 40) => {
    if (!wsUrl) return '';
    const parts = wsUrl.split('://');
    if (parts.length < 2) return truncateUrl(wsUrl, maxLength);
    
    const protocol = parts[0] + '://';
    const restOfUrl = parts[1];
    
    if (restOfUrl.length <= maxLength - protocol.length) return wsUrl;
    
    return protocol + restOfUrl.substring(0, maxLength - protocol.length) + '...';
  };
  
  // Get type display info
  const getTypeConfig = () => {
    switch (type) {
      case 'page':
          return { icon: <Globe size={16} />, color: 'blue' };
      case 'iframe':
        return { icon: <LayoutTemplate size={16} />, color: 'teal' };
      case 'service_worker':
        return { icon: <ServerCog size={16} />, color: 'orange' };
      case 'worker':
        return { icon: <Code2 size={16} />, color: 'grape' };
      case 'shared_worker':
        return { icon: <ServerCog size={16} />, color: 'indigo' };
      default:
        return { icon: <FileCode size={16} />, color: 'gray' };
    }
  };
  
  const { icon, color } = getTypeConfig();
  const truncatedUrl = truncateUrl(url);
  const truncatedWsUrl = truncateWsUrl(webSocketDebuggerUrl);
  
  // Create the JSON object for tooltip display and copying
  const jsonData = {
    description: "",
    devtoolsFrontendUrl: webSocketDebuggerUrl ? 
      `/devtools/inspector.html?ws=localhost:9222/devtools/page/${webSocketDebuggerUrl.split('/').pop()}` : "",
    id: webSocketDebuggerUrl ? webSocketDebuggerUrl.split('/').pop() : "",
    title: label,
    type: type,
    url: url,
    webSocketDebuggerUrl: webSocketDebuggerUrl
  };
  
  const fullJson = JSON.stringify(jsonData, null, 2);
  
  // Handle copy to clipboard
  const handleCopy = (e) => {
    e.stopPropagation(); // Prevent selecting the item
    navigator.clipboard.writeText(fullJson)
      .then(() => {
        setCopyStatus(true);
        setTimeout(() => setCopyStatus(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  // Wrap the existing UI with a Tooltip component
  return (
    <div style={{ position: 'relative', padding: '8px 0' }}>
      {/* Copy button positioned at the right side of the item */}
      <div style={{ 
        position: 'absolute', 
        right: '10px', 
        top: '50%', 
        transform: 'translateY(-50%)',
        zIndex: 5
      }}>
        <Tooltip label={copyStatus ? "Copied!" : "Copy JSON data"} position="left">
          <ActionIcon 
            size="xs" 
            color={copyStatus ? "green" : "gray"}
            variant="subtle"
            onClick={handleCopy}
          >
            {copyStatus ? <Check size={14} /> : <Copy size={14} />}
          </ActionIcon>
        </Tooltip>
      </div>

      <Tooltip
        label={
          <Code block sx={{ 
            maxWidth: '500px', 
            maxHeight: '400px', 
            overflow: 'auto',
            fontSize: '12px',
            padding: '12px',
            backgroundColor: '#2a2a2a',
            color: 'white' 
          }}>
            {fullJson}
          </Code>
        }
        position="right"
        withArrow
        multiline
        width={500}
        zIndex={1000}
      >
        {/* This is your original component JSX */}
        <div style={{ paddingRight: '25px' /* Make room for the copy button */ }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            {/* Left icon */}
            {favicon ? (
              <img 
                src={favicon} 
                alt="" 
                style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} 
              />
            ) : (
              <ThemeIcon size="sm" variant="light" color={color} style={{ marginRight: 8, flexShrink: 0 }}>
                {icon}
              </ThemeIcon>
            )}
            
            {/* Title */}
            <Text size="sm" weight={500} style={{ flex: 1, marginRight: 8 }} lineClamp={1}>
              {label}
            </Text>
            
            {/* Type badge */}
            <Badge size="xs" variant="filled" color={color} style={{ flexShrink: 0 }}>
              {type}
            </Badge>
          </div>
          
          {/* URL row */}
          <div style={{ display: 'flex', fontSize: '12px', color: '#666', marginLeft: 24 }}>
            <Text size="xs" color="dimmed" style={{ minWidth: 30 }}>URL:</Text>
            <Text size="xs" color="dimmed" lineClamp={1} style={{ flex: 1 }}>
              {truncatedUrl}
            </Text>
          </div>
          
          {/* WebSocket URL row */}
          <div style={{ display: 'flex', fontSize: '12px', color: '#666', marginLeft: 24 }}>
            <Text size="xs" color="dimmed" style={{ minWidth: 30 }}>WS:</Text>
            <Text 
              size="xs" 
              color="dimmed" 
              lineClamp={1} 
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '10px' }}
            >
              {truncatedWsUrl}
            </Text>
          </div>
        </div>
      </Tooltip>
    </div>
  );
};
// After ChromeTargetItem and before ChromeDebuggerPanel
const ResponsiveBadgeContainer = ({ targetSummary }) => {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);
    
    useEffect(() => {
      // Update width on mount and resize
      const updateWidth = () => {
        if (containerRef.current) {
          setContainerWidth(containerRef.current.offsetWidth);
        }
      };
      
      updateWidth();
      const resizeObserver = new ResizeObserver(updateWidth);
      
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      
      return () => {
        if (containerRef.current) {
          resizeObserver.disconnect();
        }
      };
    }, []);
    
    // Render different layouts based on available width
    const renderBadges = () => {
      // Common badge styles for better alignment
      const badgeStyle = {
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 12,
        paddingRight: 12,
        height: 'auto',
        lineHeight: 1.5
      };
      
      // Wrapper style for icon and text
      const contentStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle'
      };
      
      if (containerWidth < 500) {
        // Compact view - just total and dropdown
        return (
          <>
            <Badge size="lg" variant="filled" style={badgeStyle}>
              {targetSummary.total} Targets
            </Badge>
            <Tooltip 
              label={
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                    <Globe size={14} style={{ marginRight: 8, flexShrink: 0 }} /> {targetSummary.pages} Pages
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                    <LayoutTemplate size={14} style={{ marginRight: 8, flexShrink: 0 }} /> {targetSummary.iframes} iFrames
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                    <Code2 size={14} style={{ marginRight: 8, flexShrink: 0 }} /> {targetSummary.workers} Workers
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                    <ServerCog size={14} style={{ marginRight: 8, flexShrink: 0 }} /> {targetSummary.serviceWorkers} Service Workers
                  </div>
                </div>
              }
            >
              <Badge size="lg" variant="outline" style={{ ...badgeStyle, cursor: 'pointer' }}>
                Details
              </Badge>
            </Tooltip>
          </>
        );
      } else if (containerWidth < 700) {
        // Medium view - show total and most important categories
        return (
          <>
            <Badge size="lg" variant="filled" style={badgeStyle}>
              {targetSummary.total} Targets
            </Badge>
            <Badge size="lg" variant="outline" color="blue" style={badgeStyle}>
              <span style={contentStyle}>
                <Globe size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.pages}</span>
              </span>
            </Badge>
            <Badge size="lg" variant="outline" color="orange" style={badgeStyle}>
              <span style={contentStyle}>
                <ServerCog size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.serviceWorkers}</span>
              </span>
            </Badge>
          </>
        );
      } else {
        // Full view - show all badges
        return (
          <>
            <Badge size="lg" variant="filled" style={badgeStyle}>
              {targetSummary.total} TOTAL TARGETS
            </Badge>
            <Badge size="lg" variant="outline" color="blue" style={badgeStyle}>
              <span style={contentStyle}>
                <Globe size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.pages} PAGES</span>
              </span>
            </Badge>
            <Badge size="lg" variant="outline" color="teal" style={badgeStyle}>
              <span style={contentStyle}>
                <LayoutTemplate size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.iframes} IFRAMES</span>
              </span>
            </Badge>
            <Badge size="lg" variant="outline" color="grape" style={badgeStyle}>
              <span style={contentStyle}>
                <Code2 size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.workers} WORKERS</span>
              </span>
            </Badge>
            <Badge size="lg" variant="outline" color="orange" style={badgeStyle}>
              <span style={contentStyle}>
                <ServerCog size={16} style={{ marginRight: 8, flexShrink: 0, position: 'relative', top: -1 }} /> 
                <span>{targetSummary.serviceWorkers} SERVICE WORKERS</span>
              </span>
            </Badge>
          </>
        );
      }
    };
    
    return (
      <div ref={containerRef} className="mt-4 w-full">
        <Group spacing="md" position="left">
          {renderBadges()}
        </Group>
      </div>
    );
  };
  
const ChromeDebuggerPanel: React.FC = () => {
  const [targets, setTargets] = useState<ChromeTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserStarted, setBrowserStarted] = useState(false);
  const [selectedWebsockets, setSelectedWebsockets] = useState<string[]>([]);
  const [websocketOptions, setWebsocketOptions] = useState<WebSocketOption[]>([]);
  const [connected, setConnected] = useState<{ [key: string]: boolean | string }>({});
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [serverOutput, setServerOutput] = useState<string[]>([]);
  const [port, setPort] = useState('9222');
  const [filter, setFilter] = useState('');
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const clientsRef = useRef<{ [key: string]: any }>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);
    
  // Reference to the bridge WebSocket
  const bridgeWsRef = useRef<WebSocket | null>(null);


  const launchChrome = async () => {
    try {
      await core.invoke('open_chrome_in_terminal');
    } catch (error) {
      console.error("Failed to launch Chrome in Terminal", error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Show visual feedback that the copy succeeded
        setCopiedId(id);
        // Reset after 2 seconds
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  // Process targets into well-structured dropdown options
// Update the processTargetsIntoOptions function to handle missing data
  const processTargetsIntoOptions = (targets: ChromeTarget[]): WebSocketOption[] => {
    if (!Array.isArray(targets)) {
      console.error('Invalid targets data:', targets);
      return [];
    }
    
    return targets
      .filter(target => {
        // Filter out targets with missing required properties
        if (!target || !target.webSocketDebuggerUrl) {
          console.warn('Skipping invalid target:', target);
          return false;
        }
        return true;
      })
      .map((target: ChromeTarget) => {
        // Process title - truncate if too long
        let label = target.title || '(Untitled)';
        if (label.length > 40) {
          label = label.substring(0, 37) + '...';
        }
        
        // Process url - truncate if too long
        let url = target.url || '';
        if (url.length > 60) {
          url = url.substring(0, 57) + '...';
        }
        
        return {
          value: target.webSocketDebuggerUrl,  // The value we'll use for connections
          label: label,                        // Title for display
          url: url,                            // URL for display
          type: target.type || 'unknown',      // Type (page, iframe, worker, etc.)
          webSocketDebuggerUrl: target.webSocketDebuggerUrl, // Full WebSocket URL
          id: target.id || '',                 // Target ID
          favicon: target.favicon        // Favicon if available
        };
      });
  };
  
  // Function to connect to the bridge
  const connectToBridge = () => {
    // Skip if already connected
    if (bridgeWsRef.current && bridgeWsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    
    console.log("Connecting to Chrome Logger Bridge...");
    const ws = new WebSocket('ws://localhost:8943');
    
    ws.onopen = () => {
      console.log("Connected to Chrome Logger Bridge");
      
      // Request the list of targets
      ws.send(JSON.stringify({
        type: 'listTargets'
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'targetList') {
            if (!Array.isArray(data.targets)) {
                console.error('Invalid targets data:', data.targets);
                return;
            }
            
            // Filter out invalid targets
            const validTargets = data.targets.filter(t => t && t.id && t.webSocketDebuggerUrl);
            
            // Update targets
            setTargets(validTargets);
            setBrowserStarted(validTargets.length > 0);
            
            // Process into dropdown options
            const options = processTargetsIntoOptions(validTargets);
            setWebsocketOptions(options);
            
            // Find PieVerse extension if it exists
            const pieVerseExtension = validTargets.find((t: ChromeTarget) => 
                t.type === 'service_worker' && 
                t.url && t.url.includes('chrome-extension://okfkmjmlnefinemmjibdcldmmcegmkgf/background.js')
            );
            
            if (pieVerseExtension) {
                setSelectedWebsockets([pieVerseExtension.webSocketDebuggerUrl]);
            }
        }
        else if (data.type === 'log') {
          // Add log message
          const newMessage: ConsoleMessage = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: data.timestamp,
            level: data.level,
            text: data.text,
            source: data.source || 'console',
            targetId: data.targetId || '',
            targetTitle: data.targetTitle || ''
          };
          
          setMessages(prev => [...prev, newMessage]);
        }
        else if (data.type === 'system') {
          // Handle system messages and connection status
          const newMessage: ConsoleMessage = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: data.timestamp,
            level: data.level,
            text: data.text,
            source: 'system',
            targetId: data.targetId || '',
            targetTitle: data.targetTitle || 'System'
          };
          
          setMessages(prev => [...prev, newMessage]);
          
          // Update connection status based on message
          if (data.text.includes('Connected to') && data.targetId) {
            // Find the WebSocket URL for this target
            const target = targets.find(t => t.id === data.targetId);
            if (target && target.webSocketDebuggerUrl) {
              setConnected(prev => ({ ...prev, [target.webSocketDebuggerUrl]: true }));
            }
          }
          else if (data.text.includes('Disconnected from') && data.targetId) {
            // Find the WebSocket URL for this target
            const target = targets.find(t => t.id === data.targetId);
            if (target && target.webSocketDebuggerUrl) {
              setConnected(prev => {
                const updated = { ...prev };
                delete updated[target.webSocketDebuggerUrl];
                return updated;
              });
            }
          }
          
          // Handle errors
          if (data.level === 'error') {
            setError(data.text);
          }
        }
      } catch (err) {
        console.error("Error parsing message from bridge:", err);
      }
    };
    
    ws.onclose = () => {
      console.log("Disconnected from Chrome Logger Bridge");
      
      // Try to reconnect after a delay
      setTimeout(connectToBridge, 5000);
    };
    
    ws.onerror = (error) => {
      console.error("Bridge connection error:", error);
      setError('Failed to connect to Chrome Logger Bridge. Make sure the bridge is running.');
    };
    
    bridgeWsRef.current = ws;
  };
  
  // Check if Chrome in dev mode is running
  const checkChromeDevMode = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Connect to the bridge if needed
      if (!bridgeWsRef.current || bridgeWsRef.current.readyState !== WebSocket.OPEN) {
        connectToBridge();
      } else {
        // If already connected, just request the targets list
        bridgeWsRef.current.send(JSON.stringify({
          type: 'listTargets'
        }));
      }
    } catch (err: any) {
      console.error('Error checking Chrome dev mode:', err);
      setError(`${err.message || err}`);
      setBrowserStarted(false);
    } finally {
      setLoading(false);
    }
  };
  
  // Connect to selected targets via the bridge
  const connectToSelectedTargets = async () => {
    if (selectedWebsockets.length === 0) {
      setError('Please select at least one target to connect to');
      return;
    }
    
    setError(null);
    
    // Connect to bridge if not already connected
    if (!bridgeWsRef.current || bridgeWsRef.current.readyState !== WebSocket.OPEN) {
      connectToBridge();
      
      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // If still not connected, show error
      if (!bridgeWsRef.current || bridgeWsRef.current.readyState !== WebSocket.OPEN) {
        setError('Failed to connect to Chrome Logger Bridge. Make sure it\'s running.');
        return;
      }
    }
    
    // Request connections to selected targets
    for (const websocketUrl of selectedWebsockets) {
      // Skip if already connected
      if (connected[websocketUrl] === true) continue;
      
      try {
        setLoading(true);
        
        // Set status to connecting
        setConnected(prev => ({ ...prev, [websocketUrl]: 'connecting' }));
        
        // Request connection via the bridge
        bridgeWsRef.current.send(JSON.stringify({
          type: 'connect',
          targetUrl: websocketUrl
        }));
      } catch (err) {
        console.error(`Error connecting to ${websocketUrl}:`, err);
        
        // Update connection status
        setConnected(prev => {
          const updated = { ...prev };
          delete updated[websocketUrl];
          return updated;
        });
        
        setError(`Failed to connect to target: ${err}`);
      } finally {
        setLoading(false);
      }
    }
  };

  // Disconnect from a target via the bridge
  const disconnectFromTarget = async (targetUrl: string) => {
    try {
      if (bridgeWsRef.current && bridgeWsRef.current.readyState === WebSocket.OPEN) {
        // Request disconnection via the bridge
        bridgeWsRef.current.send(JSON.stringify({
          type: 'disconnect',
          targetUrl
        }));
      }
    } catch (err) {
      console.error(`Error disconnecting from ${targetUrl}:`, err);
    }
  };
  
  // Disconnect from all targets
  const disconnectAll = async () => {
    for (const targetUrl of Object.keys(connected)) {
      await disconnectFromTarget(targetUrl);
    }
    setSelectedWebsockets([]);
  };

  // Clear console messages
  const clearMessages = () => {
    setMessages([]);
  };

  
  // Export console messages as JSON
  const exportMessages = async () => {
    try {
      console.log("Starting export process...");
      
      // Generate the JSON data
      const dataStr = JSON.stringify(messages, null, 2);
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const exportFileDefaultName = `chrome-logs-${timestamp}.json`;
      
      console.log("Opening save dialog...");
      
      // Show save dialog to get the save location from user
      const savePath = await saveDialog({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        defaultPath: exportFileDefaultName,
        title: 'Save Chrome Console Logs'
      });
      
      console.log("Save dialog result:", savePath);
      
      // Only proceed if user selected a path (didn't cancel)
      if (savePath) {
        console.log("Writing file to:", savePath);
        
        try {
          // Write the file to the selected path
          await writeTextFile(savePath, dataStr);
          console.log("File written successfully");
          
          // Add a success message to the console logs
          setMessages(prev => [...prev, {
            id: `export-${Date.now()}`,
            timestamp: Date.now(),
            level: 'info',
            text: `Logs exported successfully to ${savePath}`,
            source: 'system',
            targetId: '',
            targetTitle: 'System'
          }]);
          
          // Also update serverOutput if needed
          setServerOutput(prev => [...prev, `[INFO] Logs exported successfully to ${savePath}`]);
        } catch (writeErr) {
          console.error("File write error:", writeErr);
          throw writeErr; // Re-throw to be caught by the outer catch
        }
      } else {
        console.log("User cancelled the save dialog");
      }
    } catch (err) {
      console.error('Failed to export logs:', err);
      setError(`Failed to export logs: ${err instanceof Error ? err.message : String(err)}`);
      
      // Add error to console logs
      setMessages(prev => [...prev, {
        id: `export-error-${Date.now()}`,
        timestamp: Date.now(),
        level: 'error',
        text: `Failed to export logs: ${err instanceof Error ? err.message : String(err)}`,
        source: 'system',
        targetId: '',
        targetTitle: 'System'
      }]);
      
      // Also update serverOutput
      setServerOutput(prev => [...prev, `[ERROR] Failed to export logs: ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  // Connect to the bridge when component mounts
  useEffect(() => {
    connectToBridge();
    
    return () => {
      // Cleanup on unmount
      if (bridgeWsRef.current) {
        bridgeWsRef.current.close();
      }
    };
  }, []);

  // Get message style based on log level
  const getMessageStyle = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
      default:
        return '';
    }
  };

  // Helper to get summary stats
  const getTargetSummary = () => {
    if (!targets.length) return {};
    
    const counts = {
      total: targets.length,
      pages: targets.filter(t => t.type === 'page').length,
      iframes: targets.filter(t => t.type === 'iframe').length,
      workers: targets.filter(t => t.type === 'worker' || t.type === 'shared_worker').length,
      serviceWorkers: targets.filter(t => t.type === 'service_worker').length,
    };
    
    return counts;
  };

  const targetSummary = getTargetSummary();

  // Filter messages based on text filter
  const filteredMessages = messages.filter(message => {
    const matchesFilter = !filter || 
      message.text.toLowerCase().includes(filter.toLowerCase()) ||
      message.level.toLowerCase().includes(filter.toLowerCase()) ||
      message.targetTitle.toLowerCase().includes(filter.toLowerCase());
    
    return matchesFilter;
  });

  // Auto-scroll to bottom of console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages]);

  return (
    <div className="chrome-debugger-panel">
      <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" className="border-b">
        <Group justify="space-between">
            <Group>
            <TerminalSquare size={20} />
            <Text size="xl" fw={700}>Chrome DevTools Protocol Debugger</Text>
            </Group>
            <Group>
            <Button 
                variant="light" 
                size="sm" 
                leftSection={<RefreshCw size={14} />}
                onClick={checkChromeDevMode}
                loading={loading}
            >
                Refresh Targets
            </Button>
            </Group>
        </Group>
        </Card.Section>

        {!browserStarted ? (
          <div className="mt-4">
            <Alert 
              icon={<Info size={16} />} 
              title="Chrome in Developer Mode Not Detected"
              color="blue"
            >
              Please start Chrome with remote debugging enabled to use this feature.
              
              <Button 
                variant="subtle" 
                size="xs" 
                onClick={() => setShowSetupInstructions(!showSetupInstructions)}
                className="mt-2"
              >
                {showSetupInstructions ? "Hide Instructions" : "Show Instructions"}
              </Button>
              
              <Collapse in={showSetupInstructions}>
                <Stack spacing="xs" className="mt-3">
                  <Text size="sm">
                    1. Close all Chrome instances
                  </Text>
                  <Text size="sm">
                    2. Start Chrome with the remote debugging flag:
                  </Text>
                  <Code block>
                    {/* macOS command */}
                    {navigator.platform.includes('Mac') 
                      ? '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222'
                      /* Windows command */
                      : '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222'}
                  </Code>
                  <Text size="sm">
                    3. Start the Chrome Logger Bridge:
                  </Text>
                  <Code block>
                    npm run bridge
                  </Code>
                  <Text size="sm">
                    4. Once Chrome and the bridge are running, click the "Refresh" button above.
                  </Text>
                </Stack>
              </Collapse>
            </Alert>
            
            <Button
              leftSection={<Terminal size={16} />}
              onClick={checkChromeDevMode}
              mt="md"
              loading={loading}
            >
              Check Again
            </Button>
            <Button
              variant="outline"
              leftSection={<Terminal size={16} />}
              onClick={launchChrome}
              mt="md"
            >
              Launch Chrome in Terminal
            </Button>            
          </div>
        ) : (
          <>
            {error && (
              <Alert color="red" title="Error" icon={<AlertCircle size={16} />} mt="md">
                {error}
              </Alert>
            )}
            
            {/* Target Summary Section */}
            {targetSummary.total > 0 && (
                <ResponsiveBadgeContainer targetSummary={targetSummary} />
                )}
            
            <Stack mt="md">
              <Text weight={500}>Select Chrome targets to monitor:</Text>
              
              <MultiSelect
                data={websocketOptions.map(option => ({
                  value: option.value,
                  label: option.label,
                  url: option.url,
                  type: option.type,
                  webSocketDebuggerUrl: option.webSocketDebuggerUrl,  // Make sure to pass this property
                  favicon: option.favicon  // And this one
                }))}
                value={selectedWebsockets}
                onChange={(values) => setSelectedWebsockets(values)}
                placeholder="Select Chrome targets to monitor..."
                searchable
                clearable
                comboboxProps={{ position: 'bottom' }}
                withScrollArea={true}
                renderOption={({ option }) => {
                  // Make sure all necessary properties are passed to ChromeTargetItem
                  const { label, url, type, webSocketDebuggerUrl, favicon } = option;
                  return (
                    <ChromeTargetItem
                      label={label}
                      url={url}
                      type={type}
                      webSocketDebuggerUrl={webSocketDebuggerUrl}
                      favicon={favicon}
                    />
                  );
                }}
                styles={{
                  dropdown: {
                    width: 'auto',
                    minWidth: '300px',
                  },
                  option: {
                    padding: '2px 12px',
                    whiteSpace: 'normal',
                    overflow: 'visible',
                  },
                  options: {
                    padding: '4px 0'
                  },
                  input: {
                    minHeight: '42px'
                  }
                }}
              />
              
              <Group position="right">
                <Button
                  variant="outline"
                  color="red"
                  size="xs"
                  onClick={disconnectAll}
                  disabled={Object.keys(connected).length === 0}
                >
                  Disconnect All
                </Button>
                <Button
                  leftSection={<Check size={16} />}
                  onClick={connectToSelectedTargets}
                  disabled={selectedWebsockets.length === 0}
                >
                  Connect
                </Button>
              </Group>
            </Stack>
            
            <Card shadow="xs" mt="md" withBorder>
              <Card.Section p="md" className="border-b">
                <Group justify="space-between">
                  <Text weight={600}>Console Logs</Text>
                  <Group>
                    <TextInput
                      placeholder="Filter messages..."
                      value={filter}
                      onChange={(e) => setFilter(e.currentTarget.value)}
                      size="xs"
                      style={{ width: '200px' }}
                    />
                    <Button 
                      variant="light" 
                      color="gray" 
                      size="xs"
                      leftSection={<Trash size={14} />}
                      onClick={clearMessages}
                    >
                      Clear
                    </Button>
                    <Button 
                      variant="light" 
                      size="xs"
                      leftSection={<Download size={14} />}
                      onClick={exportMessages}
                      disabled={messages.length === 0}
                    >
                      Export
                    </Button>
                  </Group>
                </Group>
              </Card.Section>
              
              <ScrollArea h={400} type="auto" p="md">
                {filteredMessages.length === 0 ? (
                    <Text color="dimmed" align="center" mt="md">
                    {Object.keys(connected).length > 0 
                        ? "Waiting for console messages..." 
                        : "Connect to Chrome targets to view console logs"}
                    </Text>
                ) : (
                    <div className="font-mono text-sm">
                    {filteredMessages.map((msg) => (
                        <div 
                        key={msg.id} 
                        className={`py-1 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 relative ${copiedId === msg.id ? 'bg-blue-50' : ''}`}
                        >
                        <Group justify="space-between">
                            <Group spacing="xs">
                            <Badge 
                                size="xs" 
                                color={
                                msg.level === 'error' ? 'red' : 
                                msg.level === 'warning' ? 'yellow' : 
                                'blue'
                                }
                            >
                                {msg.level}
                            </Badge>
                            <Text size="xs" color="dimmed">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                            </Text>
                            </Group>
                            <Group spacing="xs">
                            <Badge size="xs" variant="outline">
                                {msg.targetTitle?.substring(0, 30) || 'Unknown'}
                            </Badge>
                            <Tooltip label={copiedId === msg.id ? "Copied!" : "Copy log entry"}>
                                <ActionIcon 
                                size="xs" 
                                variant="subtle"
                                onClick={() => copyToClipboard(
                                    `[${msg.level}][${new Date(msg.timestamp).toLocaleTimeString()}][${msg.targetTitle}] ${msg.text}`, 
                                    msg.id
                                )}
                                >
                                {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                </ActionIcon>
                            </Tooltip>
                            </Group>
                        </Group>
                        <Text className={getMessageStyle(msg.level)}>
                            {msg.text}
                        </Text>
                        </div>
                    ))}
                    <div ref={consoleEndRef} />
                    </div>
                )}
                </ScrollArea>
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default ChromeDebuggerPanel;