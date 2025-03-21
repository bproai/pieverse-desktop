// src/services/WebSocketService.ts
import { core } from '@tauri-apps/api';
import { Event, listen } from '@tauri-apps/api/event';

export interface ChromeMessage {
  type: string;
  content?: any;
  timestamp?: number;
  [key: string]: any;
}

export interface ClientInfo {
  id: string;
  addr: string;
  platform: string;
  connected_at: number;
  last_active: number;
  tab_title?: string;   // Add tab title
  tab_url?: string;     // Add tab URL
  favicon?: string;     // Add favicon URL (optional)
}

class WebSocketService {
  private port: number = 3031;
  private isRunning: boolean = false;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();
  private unlistenFunctions: Array<() => void> = [];

  constructor() {
    // This is a singleton service
    if ((window as any).WebSocketService) {
      return (window as any).WebSocketService;
    }
    (window as any).WebSocketService = this;
    
    // Set up listeners for Chrome extension events
    this.setupEventListeners();
    
    // Check initial status
    this.checkStatus();
  }

  private async setupEventListeners(): Promise<void> {
    const eventTypes = [
      'chrome-extension-request',
      'chrome-extension-action',
      'chrome-extension-notification',
      'chrome-extension-message',
      'chrome-extension-connection',
      'chrome-extension-clients-updated' // Add this new event
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen(eventType, (event: Event<any>) => {
        this.notifyListeners(eventType, event.payload);
      });
      this.unlistenFunctions.push(unlisten);
    }
  }

  private async checkStatus(): Promise<void> {
    try {
      const [running, port] = await core.invoke('get_chrome_ws_status') as [boolean, number];
      this.isRunning = running;
      this.port = port;
    } catch (error) {
      console.error('Error checking WebSocket server status:', error);
      this.isRunning = false;
    }
  }

  public async start(port: number = 3031): Promise<void> {
    if (this.isRunning) {
      throw new Error("WebSocket server is already running");
    }

    try {
      await core.invoke('start_chrome_ws_server', { port });
      this.isRunning = true;
      this.port = port;
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await core.invoke('stop_chrome_ws_server');
      this.isRunning = false;
    } catch (error) {
      console.error('Failed to stop WebSocket server:', error);
      throw error;
    }
  }

  public getStatus(): string {
    return this.isRunning ? "running" : "stopped";
  }

  public getPort(): number {
    return this.port;
  }

  public async sendMessage(message: ChromeMessage | string): Promise<void> {
    if (!this.isRunning) {
      throw new Error("WebSocket server is not running");
    }

    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    try {
      await core.invoke('send_message_to_chrome', { message: messageStr });
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      throw error;
    }
  }

  // Add new method to get connected clients
  public async getConnectedClients(): Promise<ClientInfo[]> {
    try {
      return await core.invoke('get_chrome_ws_clients') as ClientInfo[];
    } catch (error) {
      console.error('Failed to get connected clients:', error);
      return [];
    }
  }

  // Add new method to send targeted messages
  public async sendTargetedMessage(
    message: ChromeMessage | string,
    targetType: 'broadcast' | 'platform' | 'client',
    targetId?: string
  ): Promise<void> {
    if (!this.isRunning) {
      throw new Error("WebSocket server is not running");
    }

    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    try {
      await core.invoke('send_targeted_message_to_chrome', { 
        message: messageStr,
        targetType: targetType,
        targetId: targetId
      });
    } catch (error) {
      console.error('Failed to send targeted WebSocket message:', error);
      throw error;
    }
  }

  // Event handling
  public on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  public off(event: string, callback: (data: any) => void): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.delete(callback);
    }
  }

  private notifyListeners(event: string, data: any): void {
    // Notify specific event listeners
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
    
    // Also notify generic message listeners
    if (event !== 'message' && this.eventListeners.has('message')) {
      this.eventListeners.get('message')!.forEach(callback => {
        try {
          callback({ type: event, data });
        } catch (error) {
          console.error(`Error in message listener:`, error);
        }
      });
    }
  }

  // Clean up event listeners
  public cleanup(): void {
    this.unlistenFunctions.forEach(unlisten => unlisten());
    this.unlistenFunctions = [];
    this.eventListeners.clear();
  }

  // Static method to get the singleton instance
  public static getInstance(): WebSocketService {
    return (window as any).WebSocketService || new WebSocketService();
  }
}

export default WebSocketService;