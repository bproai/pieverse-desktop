// src/components/MySQL/MySQLService.ts
import { core } from '@tauri-apps/api';

export class MySQLService {
  static async connect(config: any): Promise<void> {
    console.log('Calling mysql_connect with config:', config);
    return core.invoke('mysql_connect', { config });
  }

  static async executeQuery(query: string): Promise<any> {
    console.log('Calling mysql_execute_query with query:', query);
    return core.invoke('mysql_execute_query', { query });
  }

  static async disconnect(): Promise<void> {
    console.log('Calling mysql_disconnect');
    return core.invoke('mysql_disconnect');
  }
}