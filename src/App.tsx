// src/App.tsx
import React from 'react';
import { Tabs } from '@mantine/core';
import { Database, Terminal } from 'lucide-react';
import { MongoDBPanel } from './components/MongoDB';

function App() {
  return (
    <div className="h-screen bg-gray-50">
      <header className="bg-white shadow-sm p-4">
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
          </Tabs.List>

          <Tabs.Panel value="mongodb" className="p-4">
            <MongoDBPanel />
          </Tabs.Panel>

          <Tabs.Panel value="mysql" className="p-4">
            <div>MySQL Panel Coming Soon</div>
          </Tabs.Panel>

          <Tabs.Panel value="python" className="p-4">
            <div>Python Panel Coming Soon</div>
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  );
}

export default App;