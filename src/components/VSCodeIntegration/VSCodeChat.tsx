// src/components/VSCodeIntegration/VSCodeChat.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Text, 
  Button, 
  Card, 
  Group, 
  TextInput, 
  Stack, 
  ScrollArea,
  Paper
} from '@mantine/core';
import { Send, MessageSquare } from 'lucide-react';
import { notifications } from '@mantine/notifications';

// Tauri API imports
import { core } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'vscode';
  timestamp: Date;
}

interface VSCodeChatProps {
  isServerRunning: boolean;
}

const VSCodeChat: React.FC<VSCodeChatProps> = ({ isServerRunning }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen('vscode-chat-message', (event) => {
      const payload = event.payload as { content: string, sender: string };
      setMessages(prev => [
        ...prev, 
        {
          id: Date.now().toString(),
          content: payload.content,
          sender: 'vscode',
          timestamp: new Date()
        }
      ]);
    });
  
    // Clean up listener when component unmounts
    return () => {
      unlisten.then(fn => fn());
    };
  }, []);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (!isServerRunning) {
      notifications.show({
        title: 'Error',
        message: 'WebSocket server is not running. Please start the server first.',
        color: 'red'
      });
      return;
    }
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setLoading(true);
    
    try {
      await core.invoke('send_chat_to_vscode', { 
        message: inputMessage 
      });
    } catch (error: any) {
      console.error('Error sending message to VS Code:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to send message: ${error.toString()}`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Listen for chat messages coming from VS Code
  // This would be implemented if you add WebSocket event handling in the Tauri app

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" className="border-b">
        <Group position="apart">
          <Group>
            <MessageSquare size={20} />
            <Text size="xl" fw={700}>VS Code Chat</Text>
          </Group>
        </Group>
      </Card.Section>
      
      <Stack spacing="md" mt="md">
        <ScrollArea.Autosize maxHeight={300} style={{ width: '100%', flex: 1 }}>
          <Stack spacing="xs" p="xs">
            {messages.length === 0 ? (
              <Text color="dimmed" size="sm" align="center" p="md">
                No messages yet. Start chatting with VS Code!
              </Text>
            ) : (
              messages.map(message => (
                <Paper
                  key={message.id}
                  p="sm"
                  radius="md"
                  bg={message.sender === 'user' ? 'blue.1' : 'gray.1'}
                  style={{
                    alignSelf: message.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%'
                  }}
                >
                  <Text size="sm">{message.content}</Text>
                  <Text size="xs" color="dimmed" align="right">
                    {message.timestamp.toLocaleTimeString()}
                  </Text>
                </Paper>
              ))
            )}
            <div ref={messagesEndRef} />
          </Stack>
        </ScrollArea.Autosize>
        
        <Group position="apart" align="flex-end">
          <TextInput
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            style={{ flexGrow: 1 }}
            disabled={!isServerRunning || loading}
          />
          <Button
            onClick={sendMessage}
            leftSection={<Send size={14} />}
            loading={loading}
            disabled={!isServerRunning || !inputMessage.trim()}
          >
            Send
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export default VSCodeChat;