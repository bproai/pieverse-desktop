// src/components/MySQL/MySQLService.ts
import { core } from '@tauri-apps/api';

export class MySQLService {
  static async connect(config: any): Promise<void> {
    console.log('Calling mysql_connect with config:', config);
    return core.invoke('mysql_connect', { config });
  }

  static async executeQuery(query: string): Promise<any> {
    // Normalize the query by removing the database prefix if it exists
    const normalizedQuery = query.replace('stock_data.', '');
    console.log('Calling mysql_execute_query with query:', normalizedQuery);
    return core.invoke('mysql_execute_query', { query: normalizedQuery });
  }

  static async disconnect(): Promise<void> {
    console.log('Calling mysql_disconnect');
    return core.invoke('mysql_disconnect');
  }
}