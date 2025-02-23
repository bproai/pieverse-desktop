// src/components/Python/PythonPanel.tsx
import { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api'; // Updated import using core
import { Card, Stack, Button, Alert } from '@mantine/core';
import { Play, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';

interface ExecutionResult {
  output: string;
  error?: string;
  plots?: string[];
}

export function PythonPanel() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

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
      setCode('');
      setOutput('');
      setError(null);
    } catch (err) {
      setError(`Failed to reset environment: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full" shadow="sm" padding="lg">
      <Stack>
        <div className="h-96">
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
            }}
          />
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
