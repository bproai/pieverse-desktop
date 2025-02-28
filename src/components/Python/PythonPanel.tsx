// src/components/Python/PythonPanel.tsx
import { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { Card, Stack, Button, Alert } from '@mantine/core';
import { Play, RefreshCw } from 'lucide-react';
import { loader, Editor } from '@monaco-editor/react';

// Configure Monaco to use local files for both development and production
loader.config({
  paths: {
    vs: './monaco-editor/vs'
  }
});

// Add error handler for debugging
loader.init().catch(error => {
  console.error('Monaco loader initialization error:', error);
});

interface ExecutionResult {
  output: string;
  error?: string;
  plots?: string[];
}

export function PythonPanel() {
  const [code, setCode] = useState('# Your Python code here\nprint("Hello, world!")');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  useEffect(() => {
    initializePython();
  }, []);

  const initializePython = async () => {
    setIsLoading(true);
    try {
      await core.invoke('python_init');
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      setError(`Failed to initialize Python environment: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    setError(null);
    setOutput('');

    try {
      const result = await core.invoke<ExecutionResult>('python_execute', { code });
      setOutput(result.output);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(`Execution error: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      await core.invoke('python_reset');
      setCode('# Your Python code here\nprint("Hello, world!")');
      setOutput('');
      setError(null);
    } catch (err) {
      setError(`Failed to reset environment: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleEditorWillMount = (monaco) => {
    console.log("Monaco editor will mount");
  };
  
  const handleEditorDidMount = (editor, monaco) => {
    console.log("Monaco editor mounted successfully");
    setEditorReady(true);
  };
  
  const handleEditorError = (error) => {
    console.error("Monaco editor loading error:", error);
    setEditorError(`Failed to load editor: ${error.message || 'Unknown error'}`);
  };

  // Fallback textarea if Monaco fails to load
  const renderFallbackEditor = () => (
    <div className="h-full">
      <textarea
        className="w-full h-full p-4 font-mono text-sm bg-gray-800 text-white"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="# Enter your Python code here"
      />
    </div>
  );

  return (
    <Card className="w-full" shadow="sm" padding="lg">
      <Stack>
        <div className="h-96 relative">
          {!editorReady && !editorError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-10">
              <div className="text-center text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <div>Loading editor...</div>
              </div>
            </div>
          )}
          
          {editorError ? (
            <>
              <Alert color="red" title="Editor Error" className="mb-2">
                {editorError}
              </Alert>
              {renderFallbackEditor()}
            </>
          ) : (
            <Editor
              height="100%"
              defaultLanguage="python"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                rulers: [80],
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
              }}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              onError={handleEditorError}
              loading={<div>Loading editor components...</div>}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={handleReset}
            variant="outline"
            leftSection={<RefreshCw size={16} />}
            loading={isLoading}
            disabled={!isInitialized}
          >
            Reset Environment
          </Button>
          <Button
            onClick={handleExecute}
            leftSection={<Play size={16} />}
            loading={isLoading}
            disabled={!isInitialized || !code.trim()}
          >
            Run Code
          </Button>
        </div>

        {error && (
          <Alert color="red" title="Error" variant="light">
            <pre className="whitespace-pre-wrap font-mono text-sm">{error}</pre>
          </Alert>
        )}

        {output && (
          <Alert color="blue" title="Output" variant="light">
            <pre className="whitespace-pre-wrap font-mono text-sm">{output}</pre>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

export default PythonPanel;