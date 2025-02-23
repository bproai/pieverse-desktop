// src/App.tsx
import React from 'react';
import { Tabs } from '@mantine/core';
import { Database, Terminal, Book } from 'lucide-react';
import { MongoDBPanel } from './components/MongoDB';
import MySQLPanel from './components/MySQL/MySQLPanel';
import { PythonPanel } from './components/Python/PythonPanel';
import { PromptsManager } from './components/Prompts';
import BrandLogo from './components/BrandLogo';

function App() {
  return (
    <div className="h-screen bg-gray-50">
      <header className="bg-white shadow-sm p-4 flex items-center space-x-4">
        <BrandLogo />
        <h1 className="text-2xl font-bold text-gray-800">PiEVerse Desktop</h1>
      </header>
      
      <main className="p-6">
        <Tabs defaultValue="mongodb">
          <Tabs.List>
            <Tabs.Tab value="mongodb" leftSection={<Database size={16} />}>
              MongoDB
            </Tabs.Tab>
            <Tabs.Tab value="mysql" leftSection={<Database size={16} />}>
              MySQL
            </Tabs.Tab>
            <Tabs.Tab value="python" leftSection={<Terminal size={16} />}>
              Python Sandbox
            </Tabs.Tab>
            <Tabs.Tab value="prompts" leftSection={<Book size={16} />}>
              AI Prompts
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="mongodb" className="p-4">
            <MongoDBPanel />
          </Tabs.Panel>

          <Tabs.Panel value="mysql" className="p-4">
            <MySQLPanel />
          </Tabs.Panel>

          <Tabs.Panel value="python" className="p-4">
            <PythonPanel />
          </Tabs.Panel>

          <Tabs.Panel value="prompts" className="p-4">
            <PromptsManager />
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  );
}

export default App;