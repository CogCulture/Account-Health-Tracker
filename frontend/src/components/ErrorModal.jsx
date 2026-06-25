import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ErrorModal({ isOpen, errorMessage, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-err">
          <AlertTriangle size={24} />
          <span>Upload Verification Error</span>
          <button 
            onClick={onClose} 
            className="file-pill-remove" 
            style={{ marginLeft: 'auto' }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p>{errorMessage}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Acknowledge & Retry
          </button>
        </div>
      </div>
    </div>
  );
}
