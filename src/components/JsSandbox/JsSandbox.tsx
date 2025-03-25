// src/components/JsSandbox/JsSandbox.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Button,
  Text,
  Group,
  Tabs,
  ActionIcon,
  ScrollArea,
  Textarea,
  Alert,
  Stack,
  Code
} from '@mantine/core';
import { Play, Trash, Copy, Download, RefreshCw } from 'lucide-react';
import './JsSandbox.css';

interface JsSandboxProps {
  isDark: boolean;
}

const JsSandbox: React.FC<JsSandboxProps> = ({ isDark }) => {
  const [code, setCode] = useState<string>(`// JavaScript Code Sandbox
// You can run browser-compatible JavaScript code here

const example = () => {
  console.log("Hello from JavaScript Sandbox!");
  return "Result: " + (1 + 2 * 3);
};

example();`);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Controlled tab state
  const [activeTab, setActiveTab] = useState<string>('editor');
  
  // Ref for output scrolling
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output to bottom when output updates
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Clear console output
  const clearOutput = () => {
    setOutput([]);
    setError(null);
  };

  // Execute the code
  const runCode = async () => {
    clearOutput();
    setIsRunning(true);
    setError(null);

    // Create custom console handlers to capture logs
    const customConsole = {
      log: (...args: any[]) => {
        const formatted = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
          .join(' ');
        setOutput(prev => [...prev, `[log] ${formatted}`]);
      },
      error: (...args: any[]) => {
        const formatted = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
          .join(' ');
        setOutput(prev => [...prev, `[error] ${formatted}`]);
      },
      warn: (...args: any[]) => {
        const formatted = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
          .join(' ');
        setOutput(prev => [...prev, `[warn] ${formatted}`]);
      },
      info: (...args: any[]) => {
        const formatted = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
          .join(' ');
        setOutput(prev => [...prev, `[info] ${formatted}`]);
      }
    };

    try {
      const asyncEval = new Function(
        'console',
        `
        return (async () => {
          try {
            ${code}
          } catch (e) {
            console.error(e.message || e);
            throw e;
          }
        })();
      `
      );
      const result = await asyncEval(customConsole);
      if (result !== undefined) {
        setOutput(prev => [
          ...prev,
          `[result] ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`
        ]);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setIsRunning(false);
      // Automatically switch to the Output tab after running code
      setActiveTab('output');
    }
  };

  const resetCode = () => {
    setCode(`// JavaScript Code Sandbox
// You can run browser-compatible JavaScript code here

const example = () => {
  console.log("Hello from JavaScript Sandbox!");
  return "Result: " + (1 + 2 * 3);
};

example();`);
    clearOutput();
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const saveCode = () => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code-snippet.js';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      className="mb-4 js-sandbox"
      style={{
        backgroundColor: isDark ? '#1A1B1E' : '#ffffff',
        borderColor: isDark ? '#373A40' : '#dee2e6'
      }}
    >
      <Text weight={600} size="lg" mb="md" style={{ color: isDark ? '#E9ECEF' : '#212529' }}>
        JavaScript Sandbox
      </Text>
      
      {activeTab === 'editor' ? (
        // Editor View
        <Stack>
          <div className="editor-container" style={{ minHeight: '350px' }}>
            <Textarea
              className="w-full h-full"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              placeholder="// Enter your JavaScript code here"
              minRows={15}
              autosize
              maxRows={20}
              styles={{
                root: { height: '100%' },
                wrapper: { height: '100%' },
                input: {
                  height: '100%',
                  backgroundColor: isDark ? '#25262b' : '#f8f9fa',
                  color: isDark ? '#E9ECEF' : '#212529',
                  fontFamily: 'monospace',
                  padding: '12px'
                }
              }}
            />
          </div>
          <Group justify="space-between">
            <Group>
              <Button
                onClick={runCode}
                leftSection={<Play size={16} />}
                loading={isRunning}
                color="blue"
              >
                Run Code
              </Button>
              <Button onClick={resetCode} variant="outline" leftSection={<RefreshCw size={16} />}>
                Reset Code
              </Button>
            </Group>
            <Group>
              <ActionIcon size="lg" variant="light" onClick={copyCode} title="Copy code">
                <Copy size={16} />
              </ActionIcon>
              <ActionIcon size="lg" variant="light" onClick={saveCode} title="Save as .js file">
                <Download size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      ) : (
        // Output View
        <Stack>
          <div className="output-header">
            <Text weight={500} size="sm" style={{ color: isDark ? '#E9ECEF' : '#212529' }}>
              Console Output
            </Text>
            <Group>
              <Button
                variant="subtle"
                size="xs"
                leftSection={<Trash size={14} />}
                onClick={clearOutput}
                disabled={output.length === 0 && !error}
              >
                Clear
              </Button>
              <Button
                variant="filled"
                size="xs"
                onClick={() => setActiveTab('editor')}
              >
                Back to Editor
              </Button>
            </Group>
          </div>
          <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{
              backgroundColor: isDark ? '#25262b' : '#f8f9fa',
              borderColor: isDark ? '#373A40' : '#dee2e6',
              minHeight: '350px',
              maxHeight: '350px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <ScrollArea style={{ flex: 1 }} ref={outputRef} offsetScrollbars scrollbarSize={8}>
              {output.length === 0 && !error ? (
                <Text color="dimmed" size="sm" align="center" style={{ marginTop: '2rem' }}>
                  Run your code to see output here
                </Text>
              ) : (
                <div className="output-content">
                  {output.map((line, index) => {
                    const type = line.match(/^\[(.*?)\]/)?.[1] || 'log';
                    const content = line.replace(/^\[(.*?)\]\s/, '');
                    return (
                      <div
                        key={index}
                        className={`output-line output-${type}`}
                        style={{
                          color:
                            type === 'error'
                              ? '#f87171'
                              : type === 'warn'
                              ? '#facc15'
                              : type === 'info'
                              ? '#60a5fa'
                              : type === 'result'
                              ? '#4ade80'
                              : isDark
                              ? '#E9ECEF'
                              : '#212529'
                        }}
                      >
                        <span className="output-type">[{type}]</span> {content}
                      </div>
                    );
                  })}
                  {error && (
                    <div className="output-line output-error" style={{ color: '#f87171' }}>
                      <span className="output-type">[error]</span> {error}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </Card>
        </Stack>
      )}
    </Card>
  );
};

export default JsSandbox;