import { core } from '@tauri-apps/api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Wrapper for core.invoke to handle errors consistently
export async function invokeCommand<T>(command: string, args?: Record<string, any>): Promise<T> {
  try {
    return await core.invoke<T>(command, args);
  } catch (error) {
    console.error(`Failed to invoke command '${command}':`, error);
    throw error;
  }
}

// Wrapper for listen to capture events consistently
export async function listenToEvent<T>(
  event: string, 
  callback: (payload: T) => void
): Promise<UnlistenFn> {
  try {
    return await listen<T>(event, (event) => {
      const payload = event.payload;
      callback(payload);
    });
  } catch (error) {
    console.error(`Failed to listen to event '${event}':`, error);
    throw error;
  }
}