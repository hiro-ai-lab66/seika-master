import React from 'react';
import { X } from 'lucide-react';

interface ImageZoomModalProps {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ imageUrl, title, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 1200,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '40px',
          height: '40px',
          borderRadius: '999px',
          border: '1px solid rgba(255,255,255,0.25)',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={20} />
      </button>

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        {title && (
          <div style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700, textAlign: 'center' }}>
            {title}
          </div>
        )}
        <img
          src={imageUrl}
          alt={title || '拡大画像'}
          referrerPolicy="no-referrer"
          style={{
            width: '100%',
            maxHeight: '82vh',
            objectFit: 'contain',
            borderRadius: '16px',
            backgroundColor: '#0f172a',
          }}
        />
      </div>
    </div>
  );
};
