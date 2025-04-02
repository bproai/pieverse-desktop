// src/components/ExampleImageComponent.tsx
import React, { useState, useEffect } from 'react';
import { core } from '@tauri-apps/api';

interface ExampleImageProps {
  bucketName: string;
}

interface ImageInfo {
  key: string;
  size: number;
  mime_type: string;
}

const ExampleImageComponent: React.FC<ExampleImageProps> = ({ bucketName }) => {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true);
        
        // List all images in the bucket
        const result = await core.invoke<any[]>('s3_list_files', {
          bucket: bucketName
        });
        
        // Filter for only image files
        const imageFiles = result.filter(file => 
          file.mime_type.startsWith('image/')
        );
        
        setImages(imageFiles);
        setError(null);
      } catch (err) {
        console.error('Failed to load images:', err);
        setError('Failed to load images. Please ensure the bucket exists.');
      } finally {
        setLoading(false);
      }
    };
    
    loadImages();
  }, [bucketName]);

  if (loading) {
    return <div>Loading images...</div>;
  }
  
  if (error) {
    return <div className="text-red-500">{error}</div>;
  }
  
  if (images.length === 0) {
    return <div>No images found in bucket "{bucketName}"</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map(image => (
        <div key={image.key} className="border rounded-md overflow-hidden p-2">
          {/* Using the s3:// protocol to display the image */}
          <img 
            src={`s3://${bucketName}/${image.key}`} 
            alt={image.key}
            className="w-full h-48 object-contain bg-gray-100"
          />
          <div className="mt-2">
            <p className="font-medium truncate">{image.key}</p>
            <p className="text-xs text-gray-500">
              {(image.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExampleImageComponent;