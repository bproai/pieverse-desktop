// src/components/S3Lite/S3LitePanel.tsx
import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';

interface S3FileEntry {
  bucket: string;
  key: string;
  mime_type: string;
  size: number;
  created_at: string;
}

let currentBucketRef = '';
let refreshFilesFunction: (() => Promise<void>) | null = null;

const S3LitePanel: React.FC = () => {
  const [buckets, setBuckets] = useState<string[]>([]);
  const [currentBucket, setCurrentBucket] = useState<string>('');
  const [files, setFiles] = useState<S3FileEntry[]>([]);
  const [newBucketName, setNewBucketName] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingBucket, setEditingBucket] = useState<string | null>(null);
  const [newBucketValue, setNewBucketValue] = useState<string>('');
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');
  
  // Custom context menu state
  const [imageMenu, setImageMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    file: null as S3FileEntry | null
  });

  useEffect(() => {
    // Store the loadFiles function in the outer variable
    refreshFilesFunction = loadFiles;
    
    return () => {
      refreshFilesFunction = null;
    };
  }, []);

  useEffect(() => {
    loadBuckets();
  }, []);

  useEffect(() => {
    if (currentBucket) {
      currentBucketRef = currentBucket;
      loadFiles();
    }
  }, [currentBucket]);
  
  // Add a handler to close the menu when clicking outside
  useEffect(() => {
    if (imageMenu.visible) {
      const handleClickOutside = () => {
        setImageMenu(prev => ({ ...prev, visible: false }));
      };
      
      // Add the global click listener
      document.addEventListener('click', handleClickOutside);
      
      // Clean up
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [imageMenu.visible]);

  const loadBuckets = async () => {
    try {
      console.log('Loading buckets...');
      setLoading(true);
      
      const result = await core.invoke<string[]>('s3_list_buckets');
      console.log('Buckets loaded:', result);
      setBuckets(result);
      if (result.length > 0 && !currentBucket) {
        setCurrentBucket(result[0]);
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
      console.log('File upload successful');
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

  const renameBucket = async (oldName: string, newName: string) => {
    if (!newName || oldName === newName) {
      setEditingBucket(null);
      return;
    }
    
    try {
      setLoading(true);
      console.log(`Renaming bucket from "${oldName}" to "${newName}"`);
      
      await core.invoke('s3_rename_bucket', {
        oldName: oldName,
        newName: newName
      });
      
      console.log('Bucket renamed successfully');
      
      // Update currentBucket if we're renaming the currently selected bucket
      if (currentBucket === oldName) {
        setCurrentBucket(newName);
      }
      
      // Refresh the bucket list
      await loadBuckets();
      setEditingBucket(null);
    } catch (error) {
      console.error('Error renaming bucket:', error);
      alert(`Failed to rename bucket: ${error}`);
    } finally {
      setLoading(false);
    }
  };
  
  const startEditingBucket = (bucket: string) => {
    setEditingBucket(bucket);
    setNewBucketValue(bucket);
  };

  const exportBucketAsZip = async () => {
    if (!currentBucket) return;
    
    try {
      setLoading(true);
      
      // Open save dialog to select destination
      const savePath = await save({
        filters: [{
          name: 'Zip Archive',
          extensions: ['zip']
        }],
        defaultPath: `${currentBucket}-images.zip`
      });
      
      if (!savePath) {
        setLoading(false);
        return; // User cancelled
      }
      
      console.log(`Exporting images from bucket "${currentBucket}" to "${savePath}"`);
      
      // Call backend to export the bucket
      await core.invoke('s3_export_bucket_as_zip', {
        bucket: currentBucket,
        exportPath: savePath
      });
      
      console.log('Bucket exported successfully');
      alert(`Images from "${currentBucket}" exported successfully to "${savePath}"`);
    } catch (error) {
      console.error('Error exporting bucket:', error);
      alert(`Failed to export bucket: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const renameFile = async (oldKey: string, newKey: string) => {
    if (!newKey || oldKey === newKey) {
      setEditingFile(null);
      return;
    }
    
    try {
      setLoading(true);
      console.log(`Renaming file from "${oldKey}" to "${newKey}"`);
      
      await core.invoke('s3_rename_file', {
        bucket: currentBucket,
        oldKey: oldKey,
        newKey: newKey
      });
      
      console.log('File renamed successfully');
      await loadFiles();
      setEditingFile(null);
      
      // If we're previewing the renamed file, update the preview URL
      if (imagePreview && imagePreview.includes(oldKey)) {
        previewImage(currentBucket, newKey);
      }
    } catch (error) {
      console.error('Error renaming file:', error);
      alert(`Failed to rename file: ${error}`);
    } finally {
      setLoading(false);
    }
  };
  
  const startEditingFile = (key: string) => {
    setEditingFile(key);
    setNewFileName(key);
  };

  // Download image function
  const downloadImage = async (bucket: string, key: string) => {
    try {
      setLoading(true);
      
      // Ask user where to save the file
      const savePath = await save({
        filters: [{
          name: 'Images',
          extensions: [key.split('.').pop() || 'jpg']
        }],
        defaultPath: key
      });
      
      if (!savePath) {
        setLoading(false);
        return;
      }
      
      // Download the file
      await core.invoke('s3_download_image', {
        bucket,
        key,
        savePath
      });
      
      console.log('Image downloaded successfully');
    } catch (error) {
      console.error('Failed to download image:', error);
      alert(`Failed to download image: ${error}`);
    } finally {
      setLoading(false);
    }
  };
 
  // Custom context menu handler
  const handleImageContextMenu = (e: React.MouseEvent, file: S3FileEntry) => {
    e.preventDefault(); // Prevent default browser menu
    e.stopPropagation(); // Stop event propagation
    
    // Show our custom menu at the cursor position
    setImageMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file: file
    });
    
    console.log("Custom context menu opened for:", file.key);
  };
  
  // Copy image URL to clipboard
  const copyImageUrl = async (file: S3FileEntry) => {
    if (!file) return;
    
    try {
      await navigator.clipboard.writeText(`s3://${file.bucket}/${file.key}`);
      console.log("Copied to clipboard:", `s3://${file.bucket}/${file.key}`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
    
    // Close the menu
    setImageMenu(prev => ({ ...prev, visible: false }));
  };

  // Copy image to clipboard
  // Updated copyImage function in S3LitePanel.tsx
  const copyImage = async (file: S3FileEntry) => {
    if (!file) return;
    try {
      setLoading(true);
      
      // Invoke the native Tauri command to copy the image to clipboard
      await core.invoke('s3_copy_image_to_clipboard', {
        bucket: file.bucket,
        key: file.key
      });
      
      console.log("Image copied to clipboard via native command");
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
      alert("Failed to copy image to clipboard. This feature may not be supported in your environment.");
    } finally {
      setLoading(false);
      setImageMenu(prev => ({ ...prev, visible: false }));
    }
  };

  
  


  // Handle context menu item click
  const handleMenuItemClick = async (action: string) => {
    const file = imageMenu.file;
    if (!file) return;
    
    if (action === 'download') {
      await downloadImage(file.bucket, file.key);
    } else if (action === 'copyImage') {
      await copyImage(file); // This function fetches the image and writes it to the clipboard.
    } else if (action === 'copyUrl') {
      await copyImageUrl(file); // This function copies the S3 URL to the clipboard.
    }
    
    // Close the menu after the action
    setImageMenu(prev => ({ ...prev, visible: false }));
  };
  
  

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Image Depot</h2>
      
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
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
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
                    onClick={() => setCurrentBucket(bucket)} // Make the entire row clickable
                    className={`py-2 px-2 cursor-pointer hover:bg-blue-50 ${currentBucket === bucket ? 'bg-blue-100' : ''}`}
                  >
                    <div className="flex justify-between items-center">
                      {editingBucket === bucket ? (
                        // Edit mode - stop propagation to prevent bucket selection
                        <div className="flex w-full" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={newBucketValue}
                            onChange={(e) => setNewBucketValue(e.target.value)}
                            className="border p-1 rounded mr-2 flex-grow"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameBucket(bucket, newBucketValue);
                              } else if (e.key === 'Escape') {
                                setEditingBucket(null);
                              }
                            }}
                          />
                          <button 
                            onClick={() => renameBucket(bucket, newBucketValue)}
                            className="bg-green-500 text-white px-2 py-1 rounded mr-1 text-xs"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingBucket(null)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <span className="flex-grow">
                            {bucket}
                          </span>
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-2">{getBucketStats(bucket)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent bucket selection when clicking Rename
                                startEditingBucket(bucket);
                              }}
                              className="text-gray-500 hover:text-blue-500 text-xs ml-2"
                            >
                              Rename
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {/* Upload button - only if bucket is selected */}
          {currentBucket && (
            <div className="mt-4 space-y-2">
              <button
                onClick={uploadFile}
                disabled={loading}
                className="w-full bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                Upload Image to {currentBucket}
              </button>
              
              <button
                onClick={exportBucketAsZip}
                disabled={loading || files.filter(f => f.mime_type.startsWith('image/')).length === 0}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                Export Images as ZIP
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
                        onContextMenu={(e) => handleImageContextMenu(e, file)}
                      >
                        <img 
                          src={`s3://${file.bucket}/${file.key}`}
                          alt={file.key}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    
                    <div className="p-2">
                      {editingFile === file.key ? (
                        // Edit mode
                        <div className="flex mb-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            className="border p-1 rounded mr-2 flex-grow text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameFile(file.key, newFileName);
                              } else if (e.key === 'Escape') {
                                setEditingFile(null);
                              }
                            }}
                          />
                          <button 
                            onClick={() => renameFile(file.key, newFileName)}
                            className="bg-green-500 text-white px-2 py-1 rounded mr-1 text-xs"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingFile(null)}
                            className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        // View mode
                        <p className="font-medium truncate" title={file.key}>{file.key}</p>
                      )}
                      
                      <p className="text-xs text-gray-500">
                        {file.size < 1024 * 1024 
                          ? `${(file.size / 1024).toFixed(2)} KB` 
                          : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                        {' • '}{file.mime_type}
                      </p>
                      
                      <div className="mt-2 flex justify-between">
                        <div>
                          <button
                            onClick={() => previewImage(file.bucket, file.key)}
                            className="text-sm text-blue-500 hover:underline mr-2"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingFile(file.key);
                            }}
                            className="text-sm text-blue-500 hover:underline mr-2"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => downloadImage(file.bucket, file.key)}
                            className="text-sm text-blue-500 hover:underline"
                          >
                            Download
                          </button>
                        </div>
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
        <div 
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Extract file info from the preview URL
            if (imagePreview.startsWith('s3://')) {
              const parts = imagePreview.replace('s3://', '').split('/');
              if (parts.length >= 2) {
                const bucket = parts[0];
                const key = parts.slice(1).join('/');
                // Create a temporary target object for the context menu
                setImageMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY,
                  file: { bucket, key, mime_type: '', size: 0, created_at: '' }
                });
                console.log("Modal context menu opened for:", bucket, key);
              }
            }
          }}
        >
          <div className="relative max-w-3xl max-h-screen p-4">
            <div className="absolute top-2 right-2 flex">
              <button
                onClick={() => {
                  // Extract file info from the preview URL
                  if (imagePreview.startsWith('s3://')) {
                    const parts = imagePreview.replace('s3://', '').split('/');
                    if (parts.length >= 2) {
                      const bucket = parts[0];
                      const key = parts.slice(1).join('/');
                      downloadImage(bucket, key);
                    }
                  }
                }}
                className="bg-blue-500 text-white rounded-full p-2 shadow-md mr-2"
                title="Download"
              >
                ↓
              </button>
              <button
                onClick={() => setImagePreview(null)}
                className="bg-white rounded-full p-2 shadow-md"
                title="Close"
              >
                ✕
              </button>
            </div>
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="max-w-full max-h-[80vh] object-contain bg-white p-2 rounded"
              onError={(e) => {
                console.error(`Failed to load preview: ${imagePreview}`);
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3QgZmlsbD0iI2VlZSIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiLz48dGV4dCBmaWxsPSIjYWFhIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZHk9Ii4zNWVtIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiB4PSI1MCIgeT0iNTAiPkltYWdlIExvYWQgRXJyb3I8L3RleHQ+PC9zdmc+';
              }}
            />
          </div>
        </div>
      )}
      
      {/* Custom context menu */}
      {imageMenu.visible && (
        <>
          {/* Invisible overlay to detect clicks outside */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998
            }}
            onClick={() => setImageMenu(prev => ({ ...prev, visible: false }))}
          />
          
          {/* The actual menu */}
          <div
            style={{
              position: 'fixed',
              zIndex: 999,
              left: imageMenu.x,
              top: imageMenu.y,
              backgroundColor: 'white',
              borderRadius: '4px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onClick={() => handleMenuItemClick('download')}
              >
                <span style={{ marginRight: '8px' }}>💾</span>
                Download Image
              </button>

              <button 
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onClick={() => handleMenuItemClick('copyImage')}
              >
                <span style={{ marginRight: '8px' }}>📋</span>
                Copy Image to Clipboard
              </button>

              <button 
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onClick={() => handleMenuItemClick('copyUrl')}
              >
                <span style={{ marginRight: '8px' }}>📋</span>
                Copy Image URL
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const getCurrentBucket = () => {
  return currentBucketRef;
};

export const refreshCurrentBucket = async () => {
  if (refreshFilesFunction) {
    await refreshFilesFunction();
  }
};

export default S3LitePanel;