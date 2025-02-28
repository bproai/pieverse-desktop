// src/App.tsx
import React from 'react';
import { Tabs, ActionIcon, useMantineTheme } from '@mantine/core';
import { Database, Terminal, Book, Sun, Moon, Settings } from 'lucide-react';
import { MongoDBPanel } from './components/MongoDB';
import MySQLPanel from './components/MySQL/MySQLPanel';
import { PythonPanel } from './components/Python/PythonPanel';
import { PromptsManager } from './components/Prompts';
import { APISettings } from './components/APISettings';
import BrandLogo from './components/BrandLogo';
import Avatar from './components/Avatar';

function App() {
  const [isDark, setIsDark] = React.useState(false);
  const [promptsBackend, setPromptsBackend] = React.useState<'mysql' | 'sqlite'>('sqlite');
  const theme = useMantineTheme();

  const toggleColorScheme = () => {
    setIsDark(!isDark);
    document.body.classList.toggle('dark-mode');
  };

  return (
    <div className="gesture-stable-container">
      <div className={`h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <header className={`${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm p-4 flex items-center justify-between transition-colors duration-200`}>
          <div className="flex items-center space-x-4">
            <BrandLogo isDark={isDark} />
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
              PiEVerse Desktop
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
                AI Prompts
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
              <Tabs.Tab value="api" leftSection={<Settings size={16} />}>
                API Settings
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="prompts" className="p-4">
              <PromptsManager backend={promptsBackend} onBackendChange={setPromptsBackend} />
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

            <Tabs.Panel value="api" className="p-4">
              <APISettings />
            </Tabs.Panel>
          </Tabs>
        </main>

        {/* Render the floating Avatar */}
        <Avatar />
      </div>
    </div>
  );
}

export default App;
