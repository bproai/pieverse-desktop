// src/components/MySQL/MySQLService.ts
import { core } from '@tauri-apps/api';
import type { MySQLConfig } from './types';

export class MySQLService {
  private static isConnected = false;
  private static connectionListeners: ((status: boolean) => void)[] = [];

  static async connect(config: MySQLConfig): Promise<void> {
    try {
      console.log('Calling mysql_connect with config:', config);
      await core.invoke('mysql_connect', { config });
      this.setConnectionStatus(true);
    } catch (error) {
      this.setConnectionStatus(false);
      throw error;
    }
  }

  static async testConnection(): Promise<boolean> {
    try {
      console.log('Testing MySQL connection...');
      const result = await core.invoke<boolean>('mysql_test_connection');
      this.setConnectionStatus(result);
      return result;
    } catch (error) {
      console.error('Test connection error:', error);
      this.setConnectionStatus(false);
      return false;
    }
  }

  static async executeQuery(query: string): Promise<any> {
    if (!this.isConnected) {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('MySQL is not connected');
      }
    }
    // Remove any extra whitespace and newlines
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    console.log('Executing query:', normalizedQuery);
    return core.invoke('mysql_execute_query', { query: normalizedQuery });
  }

  static async disconnect(): Promise<void> {
    try {
      console.log('Disconnecting from MySQL');
      await core.invoke('mysql_disconnect');
      this.setConnectionStatus(false);
    } catch (error) {
      console.error('Disconnect error:', error);
      throw error;
    }
  }

  // Add this method to the MySQLService class
  static async executeParamQuery(query: string, params: any[]): Promise<any> {
    if (!this.isConnected) {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('MySQL is not connected');
      }
    }
    
    // Remove any extra whitespace and newlines
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    console.log('Executing parameterized query:', normalizedQuery);
    
    return core.invoke('mysql_execute_param_query', { 
      query: normalizedQuery,
      params: params
    });
  }

  static getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private static setConnectionStatus(status: boolean) {
    console.log('MySQL connection status changed to:', status);
    this.isConnected = status;
    this.connectionListeners.forEach(listener => listener(status));
  }

  static addConnectionListener(listener: (status: boolean) => void) {
    this.connectionListeners.push(listener);
    listener(this.isConnected);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }
}