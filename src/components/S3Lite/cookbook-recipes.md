# S3Lite Cookbook: Common Recipes

This cookbook provides examples of how to use S3Lite for common image storage scenarios in your Tauri application.

## Table of Contents

1. [Setting Up a Profile Picture System](#setting-up-a-profile-picture-system)
2. [Storing and Displaying Product Images](#storing-and-displaying-product-images)
3. [Creating an Image Gallery](#creating-an-image-gallery)
4. [Working with Clipboard Images](#working-with-clipboard-images)
5. [Using S3Lite with Markdown Content](#using-s3lite-with-markdown-content)
6. [Migrating Existing Images to S3Lite](#migrating-existing-images-to-s3lite)

## Setting Up a Profile Picture System

A common use case is storing user profile pictures:

```tsx
import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { uploadImageToS3Lite, getS3LiteImageUrl } from '../utils/s3LiteUtils';

interface User {
  id: string;
  name: string;
  profilePicture?: string;
}

const UserProfile: React.FC<{ user: User, onUpdate: (user: User) => void }> = ({ user, onUpdate }) => {
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Load profile picture on component mount
  useEffect(() => {
    if (user.profilePicture) {
      setAvatarUrl(getS3LiteImageUrl('profile-pictures', user.profilePicture));
    } else {
      // Default avatar
      setAvatarUrl('/default-avatar.png');
    }
  }, [user.profilePicture]);
  
  const handleImageUpload = async () => {
    try {
      // Upload image and get the filename
      const filename = await uploadImageToS3Lite('profile-pictures');
      
      if (filename) {
        // Update user with new profile picture
        const updatedUser = {
          ...user,
          profilePicture: filename
        };
        
        // Call parent component update function
        onUpdate(updatedUser);
        
        // Update the avatar URL
        setAvatarUrl(getS3LiteImageUrl('profile-pictures', filename));
      }
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
    }
  };
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-200 mb-4">
        <img src={avatarUrl} alt={user.name} className="w-full h-full object-cover" />
        
        <button 
          onClick={handleImageUpload}
          className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full"
          title="Change profile picture"
        >
          📷
        </button>
      </div>
      
      <h2 className="text-2xl font-bold">{user.name}</h2>
    </div>
  );
};

export default UserProfile;
```

## Storing and Displaying Product Images

For e-commerce or inventory applications:

```tsx
import React, { useState } from 'react';
import { uploadImageToS3Lite, deleteImageFromS3Lite } from '../utils/s3LiteUtils';

interface Product {
  id: string;
  name: string;
  price: number;
  imageKey?: string;
}

const ProductEditor: React.FC<{ product: Product, onSave: (product: Product) => void }> = ({ product, onSave }) => {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(product.price);
  const [imageKey, setImageKey] = useState(product.imageKey);
  
  const handleImageUpload = async () => {
    try {
      // First, delete the old image if it exists
      if (imageKey) {
        await deleteImageFromS3Lite('product-images', imageKey);
      }
      
      // Upload new image
      const newImageKey = await uploadImageToS3Lite('product-images');
      if (newImageKey) {
        setImageKey(newImageKey);
      }
    } catch (error) {
      console.error('Failed to handle product image:', error);
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...product,
      name,
      price,
      imageKey
    });
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        {imageKey && (
          <img 
            src={`s3://product-images/${imageKey}`} 
            alt={name} 
            className="w-full h-64 object-contain mb-2 bg-gray-100"
          />
        )}
        
        <button 
          type="button"
          onClick={handleImageUpload}
          className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
        >
          {imageKey ? 'Change Image' : 'Add Product Image'}
        </button>
      </div>
      
      <div>
        <label className="block mb-1">Product Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      
      <div>
        <label className="block mb-1">Price</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(parseFloat(e.target.value))}
          className="w-full p-2 border rounded"
          step="0.01"
          min="0"
          required
        />
      </div>
      
      <button 
        type="submit" 
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Save Product
      </button>
    </form>
  );
};

export default ProductEditor;
```

## Creating an Image Gallery

For creating a photo gallery or lightbox:

```tsx
import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';
import { uploadImageToS3Lite, listS3LiteFiles, deleteImageFromS3Lite } from '../utils/s3LiteUtils';

const ImageGallery: React.FC = () => {
  const [images, setImages] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const loadImages = async () => {
    try {
      setLoading(true);
      const files = await listS3LiteFiles('gallery');
      setImages(files);
    } catch (error) {
      console.error('Failed to load gallery images:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadImages();
  }, []);
  
  const handleUpload = async () => {
    try {
      const key = await uploadImageToS3Lite('gallery');
      if (key) {
        // Reload the gallery
        await loadImages();
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
  };
  
  const handleDelete = async (key: string) => {
    try {
      await deleteImageFromS3Lite('gallery', key);
      // Close lightbox if showing the deleted image
      if (selectedImage === key) {
        setSelectedImage(null);
      }
      // Reload the gallery
      await loadImages();
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  };
  
  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Image Gallery</h2>
        <button
          onClick={handleUpload}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Upload Image
        </button>
      </div>
      
      {loading ? (
        <p>Loading gallery...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map(image => (
            <div key={image.key} className="group relative border rounded overflow-hidden">
              <img
                src={`s3://gallery/${image.key}`}
                alt={image.key}
                className="w-full h-40 object-cover cursor-pointer"
                onClick={() => setSelectedImage(image.key)}
              />
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(image.key);
                  }}
                  className="bg-red-500 text-white p-1 rounded"
                  title="Delete image"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Lightbox */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-3xl max-h-[90vh] p-4">
            <img
              src={`s3://gallery/${selectedImage}`}
              alt={selectedImage}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
```

## Working with Clipboard Images

To handle pasted or clipboard images:

```tsx
import React, { useState } from 'react';
import { core } from '@tauri-apps/api';
import { writeFile } from '@tauri-apps/plugin-fs';
import { tempdir } from '@tauri-apps/api/os';
import { clipboard } from '@tauri-apps/plugin-clipboard-manager';

const ClipboardImageUploader: React.FC = () => {
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  
  const handlePasteImage = async () => {
    try {
      setStatus('Reading clipboard...');
      
      // Get image data from clipboard
      const clipboardImage = await clipboard.readImage();
      
      if (!clipboardImage) {
        setStatus('No image found in clipboard');
        return;
      }
      
      setStatus('Processing image...');
      
      // Generate a unique filename
      const timestamp = new Date().getTime();
      const filename = `clipboard_${timestamp}.png`;
      
      // Convert the image data to base64
      const base64Data = btoa(
        new Uint8Array(clipboardImage)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      // Upload to s3lite
      await core.invoke('s3_upload', {
        bucket: 'clipboard-images',
        key: filename,
        dataBase64: base64Data,
        mimeType: 'image/png'
      });
      
      setImageKey(filename);
      setStatus('Image uploaded successfully!');
    } catch (error) {
      console.error('Failed to handle clipboard image:', error);
      setStatus(`Error: ${error}`);
    }
  };
  
  return (
    <div className="p-4 border rounded">
      <h3 className="text-lg font-bold mb-4">Clipboard Image Uploader</h3>
      
      <div className="mb-4">
        <button
          onClick={handlePasteImage}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Paste Image from Clipboard
        </button>
        <p className="text-sm text-gray-500 mt-1">
          Copy an image to your clipboard, then click the button above
        </p>
      </div>
      
      {status && (
        <p className="mb-4">{status}</p>
      )}
      
      {imageKey && (
        <div className="mt-4">
          <h4 className="font-medium mb-2">Uploaded Image:</h4>
          <img
            src={`s3://clipboard-images/${imageKey}`}
            alt="Clipboard upload"
            className="max-w-full h-64 object-contain bg-gray-100 border"
          />
        </div>
      )}
    </div>
  );
};

export default ClipboardImageUploader;
```

## Using S3Lite with Markdown Content

For applications with markdown content that include images:

```tsx
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { core } from '@tauri-apps/api';
import { uploadImageToS3Lite } from '../utils/s3LiteUtils';

interface MarkdownEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ initialContent, onSave }) => {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  
  // Custom image handler to insert S3Lite URLs into markdown
  const handleInsertImage = async () => {
    try {
      // Upload image to the markdown-images bucket
      const imageKey = await uploadImageToS3Lite('markdown-images');
      
      if (imageKey) {
        // Get the textarea element
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        
        // Get cursor position
        const cursorPos = textarea.selectionStart;
        
        // Generate markdown image syntax with the S3Lite URL
        const imageMarkdown = `![${imageKey}](s3://markdown-images/${imageKey})`;
        
        // Insert the image markdown at cursor position
        const newContent = 
          content.substring(0, cursorPos) + 
          imageMarkdown + 
          content.substring(cursorPos);
        
        // Update content
        setContent(newContent);
        
        // Set focus back to textarea and place cursor after the inserted text
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = cursorPos + imageMarkdown.length;
        }, 0);
      }
    } catch (error) {
      console.error('Failed to insert image:', error);
    }
  };
  
  const handleSave = () => {
    onSave(content);
  };
  
  // Custom components for ReactMarkdown to handle s3:// URLs
  const components = {
    img: (props: any) => {
      // Check if the image has an s3:// URL
      if (props.src.startsWith('s3://')) {
        return <img {...props} />;
      }
      // For regular URLs, pass through
      return <img {...props} />;
    }
  };
  
  return (
    <div className="border rounded">
      <div className="flex justify-between items-center p-2 border-b">
        <div className="space-x-2">
          <button
            onClick={() => setPreview(false)}
            className={`px-3 py-1 rounded ${!preview ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setPreview(true)}
            className={`px-3 py-1 rounded ${preview ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Preview
          </button>
        </div>
        
        <div className="space-x-2">
          <button
            onClick={handleInsertImage}
            className="px-3 py-1 bg-gray-200 rounded"
            title="Insert Image"
          >
            📷
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-green-500 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
      
      <div className="p-4">
        {preview ? (
          <div className="prose max-w-none">
            <ReactMarkdown components={components}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            id="markdown-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-64 p-2 border rounded font-mono"
          />
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
```

## Migrating Existing Images to S3Lite

If you need to migrate existing images into the S3Lite system:

```tsx
import React, { useState } from 'react';
import { core } from '@tauri-apps/api';
import { open } from '@tauri-apps/plugin-dialog';
import { readBinaryFile, readDir } from '@tauri-apps/plugin-fs';

const ImageMigrationTool: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number, total: number } | null>(null);
  
  const migrateFolder = async () => {
    try {
      // Prompt for folder selection
      const selected = await open({
        directory: true,
        multiple: false
      });
      
      if (!selected || Array.isArray(selected)) return;
      
      const folderPath = selected as string;
      setStatus(`Reading directory: ${folderPath}`);
      
      // Read directory contents
      const entries = await readDir(folderPath, { recursive: false });
      
      // Filter for image files
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
      const imageFiles = entries.filter(entry => {
        if (entry.children || !entry.name) return false;
        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
        return imageExtensions.includes(ext);
      });
      
      setStatus(`Found ${imageFiles.length} images to migrate`);
      setProgress({ current: 0, total: imageFiles.length });
      
      // Create a bucket name from the folder name
      const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || 'imported';
      const bucketName = folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      // Process each image
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file.path || !file.name) continue;
        
        // Update progress
        setProgress({ current: i + 1, total: imageFiles.length });
        setStatus(`Migrating ${file.name} (${i + 1}/${imageFiles.length})`);
        
        // Read file as binary
        const binaryData = await readBinaryFile(file.path);
        
        // Convert to base64
        const base64Data = btoa(
          new Uint8Array(binaryData)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        // Detect mime type based on extension
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
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
          bucket: bucketName,
          key: file.name,
          dataBase64: base64Data,
          mimeType
        });
      }
      
      setStatus(`Migration complete! All images imported to bucket "${bucketName}"`);
    } catch (error) {
      console.error('Migration error:', error);
      setStatus(`Error: ${error}`);
    }
  };
  
  return (
    <div className="p-4 border rounded">
      <h2 className="text-xl font-bold mb-4">Image Migration Tool</h2>
      
      <p className="mb-4">
        This tool helps you migrate existing image files into the S3Lite storage system.
        Select a folder containing images, and they will be imported into a new bucket.
      </p>
      
      <button
        onClick={migrateFolder}
        className="bg-blue-500 text-white px-4 py-2 rounded"
        disabled={!!progress && progress.current < progress.total}
      >
        Select Folder to Migrate
      </button>
      
      {status && (
        <p className="mt-4">{status}</p>
      )}
      
      {progress && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {progress.current} of {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageMigrationTool;
```

These recipes should help you quickly implement common image-related features in your application using the S3Lite storage system.