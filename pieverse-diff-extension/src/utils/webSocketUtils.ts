import * as crypto from 'crypto';

/**
 * Generate a random WebSocket key for proper handshake
 */
export function generateWebSocketKey(): string {
  const random = crypto.randomBytes(16);
  return random.toString('base64');
}