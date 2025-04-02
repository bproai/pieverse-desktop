// src/components/S3Lite/S3LitePanel.tsx
import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

interface S3FileEntry {
  bucket: string;
  key: string;
  mime_type: string;
  size: number;
  created_at: string;
}

const S3LitePanel: React.FC = () => {
  const [buckets, setBuckets] = useState<string[]>([]);
  const [currentBucket, setCurrentBucket] = useState<string>('');
  const [files, setFiles] = useState<S3FileEntry[]>([]);
  const [newBucketName, setNewBucketName] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadBuckets();
  }, []);

  useEffect(() => {
    if (currentBucket) {
      loadFiles();
    }
  }, [currentBucket]);

  const loadBuckets = async () => {
    try {
      console.log('Loading buckets...');
      setLoading(true);
      
      // Check if we're running in Tauri
      if (true/*||window.__TAURI__*/) {
        const result = await core.invoke<string[]>('s3_list_buckets');
        console.log('Buckets loaded:', result);
        setBuckets(result);
        if (result.length > 0 && !currentBucket) {
          setCurrentBucket(result[0]);
        }
      } else {
        // Browser fallback - mock data
        console.log('Running in browser, using mock data');
        const mockBuckets = ['mock-bucket-1', 'mock-bucket-2'];
        setBuckets(mockBuckets);
        if (!currentBucket) {
          setCurrentBucket(mockBuckets[0]);
        }
      }
    } catch (error) {
      console.error('Error loading buckets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    if (!currentBucket) return;
    
    try {
      setLoading(true);
      const result = await core.invoke<S3FileEntry[]>('s3_list_files', {
        bucket: currentBucket
      });
      setFiles(result);
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBucket = async () => {
    if (!newBucketName) return;
    
    try {
      setLoading(true);
      console.log('Creating bucket:', newBucketName);
      
      await core.invoke('s3_create_bucket', {
        bucket: newBucketName
      });
      
      console.log('Bucket created successfully, now loading buckets');
      setNewBucketName('');
      await loadBuckets();
    } catch (error) {
      console.error('Error creating bucket:', error);
      alert(`Failed to create bucket: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async () => {
    try {
      setLoading(true);
      
      // Open file dialog
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
        }]
      });
      
      if (!selected || Array.isArray(selected)) return;
      
      // Get filename for key
      const path = selected as string;
      const fileName = path.split('/').pop() || path.split('\\').pop() || 'unnamed';
      
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
        bucket: currentBucket,
        key: fileName,
        dataBase64: base64Data,
        mimeType: mimeType
      });
      console.log('File upload succesful:');
      await loadFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (key: string) => {
    try {
      setLoading(true);
      await core.invoke('s3_delete', {
        bucket: currentBucket,
        key: key
      });
      await loadFiles();
      if (imagePreview && imagePreview.includes(key)) {
        setImagePreview(null);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setLoading(false);
    }
  };

  const previewImage = async (bucket: string, key: string) => {
    try {
      const url = await core.invoke<string>('s3_get_url', {
        bucket: bucket,
        key: key
      });
      setImagePreview(url);
    } catch (error) {
      console.error('Error getting preview URL:', error);
    }
  };

  const getBucketStats = (bucket: string) => {
    if (bucket !== currentBucket) return null;
    
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    const formattedSize = totalSize < 1024 * 1024 
      ? `${(totalSize / 1024).toFixed(2)} KB` 
      : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      
    return `${files.length} files, ${formattedSize}`;
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">S3Lite Storage</h2>
      
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left panel - Buckets & Upload */}
        <div className="w-full md:w-1/3 bg-gray-100 p-4 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Buckets</h3>
          
          {/* Create new bucket */}
          <div className="mb-4 flex">
            <input
              type="text"
              value={newBucketName}
              onChange={(e) => setNewBucketName(e.target.value)}
              placeholder="New bucket name"
              className="border p-2 rounded mr-2 flex-grow"
            />
            <button 
              onClick={createBucket}
              disabled={!newBucketName || loading}
              className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
            >
              Create
            </button>
          </div>
          
          {/* Bucket list */}
          <div className="mb-4">
            {buckets.length === 0 ? (
              <p className="text-gray-600">No buckets created yet.</p>
            ) : (
              <ul className="divide-y">
                {buckets.map(bucket => (
                  <li 
                    key={bucket}
                    className={`py-2 px-2 cursor-pointer ${currentBucket === bucket ? 'bg-blue-100' : ''}`}
                    onClick={() => setCurrentBucket(bucket)}
                  >
                    <div className="flex justify-between items-center">
                      <span>{bucket}</span>
                      <span className="text-xs text-gray-500">{getBucketStats(bucket)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {/* Upload button - only if bucket is selected */}
          {currentBucket && (
            <div className="mt-4">
              <button
                onClick={uploadFile}
                disabled={loading}
                className="w-full bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                Upload Image to {currentBucket}
              </button>
            </div>
          )}
        </div>
        
        {/* Right panel - Files list */}
        <div className="w-full md:w-2/3 bg-gray-100 p-4 rounded-md">
          <h3 className="text-lg font-semibold mb-2">
            {currentBucket ? `Files in "${currentBucket}"` : 'Select a bucket'}
          </h3>
          
          {currentBucket ? (
            files.length === 0 ? (
              <p className="text-gray-600">No files in this bucket.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map(file => (
                  <div key={file.key} className="border rounded-md overflow-hidden bg-white">
                    {/* Image preview thumbnail if it's an image */}
                    {file.mime_type.startsWith('image/') && (
                      <div 
                        className="h-32 overflow-hidden bg-gray-200 cursor-pointer"
                        onClick={() => previewImage(file.bucket, file.key)}
                      >
                        <img 
                          src={`s3://${file.bucket}/${file.key}`}
                          alt={file.key}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    
                    <div className="p-2">
                      <p className="font-medium truncate" title={file.key}>{file.key}</p>
                      <p className="text-xs text-gray-500">
                        {file.size < 1024 * 1024 
                          ? `${(file.size / 1024).toFixed(2)} KB` 
                          : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                        {' • '}{file.mime_type}
                      </p>
                      
                      <div className="mt-2 flex justify-between">
                        <button
                          onClick={() => previewImage(file.bucket, file.key)}
                          className="text-sm text-blue-500 hover:underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => deleteFile(file.key)}
                          className="text-sm text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-gray-600">Select a bucket to view files</p>
          )}
        </div>
      </div>
      
      {/* Image preview modal */}
      {imagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="relative max-w-3xl max-h-screen p-4">
            <button
              onClick={() => setImagePreview(null)}
              className="absolute top-2 right-2 bg-white rounded-full p-2 shadow-md"
            >
              ✕
            </button>
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="max-w-full max-h-[80vh] object-contain bg-white p-2 rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default S3LitePanel;