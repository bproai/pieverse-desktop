// src/App.tsx
import React from 'react';
import { Tabs, ActionIcon, useMantineTheme, MantineProvider } from '@mantine/core';
import { Database, Terminal, Book, Sun, Moon, Settings, TrendingUp, FileText, Code as CodeIcon, Monitor, FolderTree, BookOpen, Brain, Brackets, HardDrive, Server, User, Layers } from 'lucide-react';
import { Notifications } from '@mantine/notifications';
import { MongoDBPanel } from './components/MongoDB';
import MySQLPanel from './components/MySQL/MySQLPanel';
import { PythonPanel } from './components/Python/PythonPanel';
import { PromptsManager } from './components/Prompts';
import { APISettings } from './components/APISettings';
import { SignalsPanel } from './components/Signals';
import { HtmlRendererPanel } from './components/HtmlRenderer';
import { JsSandboxPanel } from './components/JsSandbox';
import BrandLogo from './components/BrandLogo';
import Avatar from './components/Avatar';
import { Window } from '@tauri-apps/api/window';
import ChromeDebuggerPanel from './components/ChromeDebugger';
import FolderStructurePanel from './components/FolderStructure/FolderStructurePanel';
import { ReferencesPanel } from './components/References';
import { LLMRulesPanel } from './components/LLMRules';
import { VSCodeIntegrationPanel } from './components/VSCodeIntegration';
import FileSystemPanel from './components/FileSystem/FileSystemPanel';
import { MCPServerPanel } from './components/MCPServer';
import { MCPClientPanel } from './components/MCPClient';
import { ContextBuilderPanel } from './components/ContextBuilder';

function App() {
  const [isDark, setIsDark] = React.useState(false);
  const [promptsBackend, setPromptsBackend] = React.useState<'mysql' | 'sqlite'>('sqlite');

  const isDevMode = import.meta.env.DEV === true;

  const toggleColorScheme = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.body.classList.toggle('dark-mode');
    
    try {
      // Use the invoke method for Tauri 2.0
      // await invoke('update_system_appearance', { dark: newIsDark });
      const currentWindow = Window.getCurrent();
      await currentWindow.setTheme(newIsDark ? 'dark' : 'light');
      
      console.log('System appearance updated successfully');
    } catch (err) {
      console.error('Failed to update system appearance:', err);
    }
  };

  return (
    <MantineProvider>
      <Notifications position="top-right" zIndex={2000} />
      <div className="gesture-stable-container">
        <div className={`h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <header className={`${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm p-4 flex items-center justify-between transition-colors duration-200`}>
            <div className="flex items-center space-x-4">
              <BrandLogo isDark={isDark} />
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                PieVerse Desktop
              </h1>
            </div>
            <ActionIcon
              variant="outline"
              className={isDark ? 'border-gray-600' : 'border-gray-300'}
              onClick={toggleColorScheme}
              title="Toggle color scheme"
            >
              {isDark ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} />}
            </ActionIcon>
          </header>
          
          <main className="p-6 gesture-stable-content">
            <Tabs defaultValue="prompts">
              <Tabs.List>
                <Tabs.Tab value="prompts" leftSection={<Book size={16} />}>
                  Prompt Builder
                </Tabs.Tab>
                <Tabs.Tab value="api" leftSection={<Settings size={16} />}>
                  Prompt Builder Connect
                </Tabs.Tab>
                <Tabs.Tab value="mongodb" leftSection={<Database size={16} />}>
                  MongoDB
                </Tabs.Tab>
                <Tabs.Tab value="mysql" leftSection={<Database size={16} />}>
                  MySQL
                </Tabs.Tab>
                <Tabs.Tab value="python" leftSection={<Terminal size={16} />}>
                  Python Sandbox
                </Tabs.Tab>
                <Tabs.Tab value="jssandbox" leftSection={<CodeIcon size={16} />}>
                  JavaScript Sandbox
                </Tabs.Tab>
                <Tabs.Tab value="signals" leftSection={<TrendingUp size={16} />}>
                  Signals
                </Tabs.Tab>
                <Tabs.Tab value="htmlrenderer" leftSection={<FileText size={16} />}>
                  Document Renderer
                </Tabs.Tab>
                {isDevMode && (
                  <Tabs.Tab value="chrome-debugger" leftSection={<Monitor size={16} />}>
                    Chrome Debugger
                  </Tabs.Tab>
                )}
                <Tabs.Tab value="folder-structure" leftSection={<FolderTree size={16} />}>
                  Project Structure
                </Tabs.Tab>
                <Tabs.Tab value="references" leftSection={<BookOpen size={16} />}>
                  References
                </Tabs.Tab>
                <Tabs.Tab value="llm-rules" leftSection={<Brain size={16} />}>
                  LLM Rules
                </Tabs.Tab>
                <Tabs.Tab value="vscode" leftSection={<Brackets size={16} />}>
                  VS Code Integration
                </Tabs.Tab>
                <Tabs.Tab value="filesystem" leftSection={<HardDrive size={16} />}>
                  File System
                </Tabs.Tab>
                <Tabs.Tab value="context-builder" leftSection={<Layers size={16} />}>
                  Context Builder
                </Tabs.Tab>
                <Tabs.Tab value="claude-mcp" leftSection={<Server size={16} />}>
                  MCP Server
                </Tabs.Tab>
                <Tabs.Tab value="puppeteer-mcp" leftSection={<User size={16} />}>
                  MCP Client
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="prompts" className="p-4">
                <PromptsManager backend={promptsBackend} onBackendChange={setPromptsBackend} />
              </Tabs.Panel>

              <Tabs.Panel value="api" className="p-4">
                <APISettings />
              </Tabs.Panel>

              <Tabs.Panel value="mongodb" className="p-4">
                <MongoDBPanel />
              </Tabs.Panel>

              <Tabs.Panel value="mysql" className="p-4">
                <MySQLPanel />
              </Tabs.Panel>

              <Tabs.Panel value="python" className="p-4">
                <PythonPanel />
              </Tabs.Panel>
              
              <Tabs.Panel value="jssandbox" className="p-4">
                <JsSandboxPanel isDark={isDark} />
              </Tabs.Panel>
              
              <Tabs.Panel value="signals" className="p-4">
                <SignalsPanel />
              </Tabs.Panel>

              <Tabs.Panel value="htmlrenderer" className="p-4">
                <HtmlRendererPanel isDark={isDark} />
              </Tabs.Panel>

              {isDevMode && (
                <Tabs.Panel value="chrome-debugger" className="p-4">
                  <ChromeDebuggerPanel />
                </Tabs.Panel>
              )}
              
              <Tabs.Panel value="folder-structure" className="p-4">
                <FolderStructurePanel />
              </Tabs.Panel>
              
              <Tabs.Panel value="references" className="p-4">
                <ReferencesPanel />
              </Tabs.Panel>

              <Tabs.Panel value="llm-rules" className="p-4">
                <LLMRulesPanel />
              </Tabs.Panel>

              <Tabs.Panel value="vscode" className="p-4">
                <VSCodeIntegrationPanel />
              </Tabs.Panel>
              <Tabs.Panel value="filesystem" className="p-4">
                <FileSystemPanel />
              </Tabs.Panel>
              <Tabs.Panel value="context-builder" className="p-4">
                <ContextBuilderPanel />
              </Tabs.Panel>
              <Tabs.Panel value="claude-mcp" className="p-4">
                <MCPServerPanel />
              </Tabs.Panel>
              <Tabs.Panel value="puppeteer-mcp" className="p-4">
                <MCPClientPanel />
              </Tabs.Panel>                
            </Tabs>           
          </main>

          {/* Render the floating Avatar */}
          <Avatar />
        </div>
      </div>
    </MantineProvider>
  );
}

export default App;