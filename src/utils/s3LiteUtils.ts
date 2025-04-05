// src/utils/s3LiteUtils.ts
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

/**
 * Upload an image file to S3Lite storage
 * @param bucket The bucket name
 * @param options Optional configuration
 * @returns Promise with the key of the uploaded file or null if canceled
 */
export async function uploadImageToS3Lite(
  bucket: string, 
  options?: { 
    key?: string,
    promptUser?: boolean,
    fileFilters?: { name: string, extensions: string[] }[]
  }
): Promise<string | null> {
  // Default file filters for images
  const fileFilters = options?.fileFilters || [{
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
  }];
  
  try {
    // If we should prompt the user for a file
    if (options?.promptUser !== false) {
      // Open file dialog
      const selected = await open({
        multiple: false,
        filters: fileFilters
      });
      
      if (!selected || Array.isArray(selected)) return null;
      
      // Get filename for key
      const path = selected as string;
      const fileName = options?.key || path.split('/').pop() || path.split('\\').pop() || 'unnamed';
      
      // Read file as binary
      const binaryData = await readFile(path);
      
      // Convert to base64
      const base64Data = btoa(
        new Uint8Array(binaryData)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      // Detect mime type based on extension
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      let mimeType = 'application/octet-stream';
      
      // Set mime type based on extension
      switch (extension) {
        case 'png': mimeType = 'image/png'; break;
        case 'jpg':
        case 'jpeg': mimeType = 'image/jpeg'; break;
        case 'gif': mimeType = 'image/gif'; break;
        case 'webp': mimeType = 'image/webp'; break;
        case 'svg': mimeType = 'image/svg+xml'; break;
        case 'bmp': mimeType = 'image/bmp'; break;
      }
      
      // Upload to s3lite
      await core.invoke('s3_upload', {
        bucket,
        key: fileName,
        dataBase64: base64Data,
        mimeType
      });
      
      return fileName;
    }
    
    return null;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Delete an image from S3Lite storage
 * @param bucket The bucket name
 * @param key The file key (filename)
 * @returns Promise resolving to true if file was deleted, false if not found
 */
export async function deleteImageFromS3Lite(bucket: string, key: string): Promise<boolean> {
  try {
    return await core.invoke<boolean>('s3_delete', {
      bucket,
      key
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

/**
 * Get the full URL for an S3Lite image
 * @param bucket The bucket name
 * @param key The file key (filename)
 * @returns The full tauri:// URL
 */
export function getS3LiteImageUrl(bucket: string, key: string): string {
  return `tauri://${bucket}/${key}`;
}

/**
 * Get a list of all files in a bucket
 * @param bucket The bucket name
 * @returns Promise resolving to array of file entries
 */
export async function listS3LiteFiles(bucket: string): Promise<any[]> {
  try {
    return await core.invoke<any[]>('s3_list_files', {
      bucket
    });
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

/**
 * Get a list of all buckets
 * @returns Promise resolving to array of bucket names
 */
export async function listS3LiteBuckets(): Promise<string[]> {
  try {
    return await core.invoke<string[]>('s3_list_buckets');
  } catch (error) {
    console.error('Error listing buckets:', error);
    throw error;
  }
}

/**
 * Create a new bucket
 * @param bucket The bucket name to create
 * @returns Promise resolving when bucket is created
 */
export async function createS3LiteBucket(bucket: string): Promise<void> {
  try {
    await core.invoke('s3_create_bucket', {
      bucket
    });
  } catch (error) {
    console.error('Error creating bucket:', error);
    throw error;
  }
}