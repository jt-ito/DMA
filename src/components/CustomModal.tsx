import React, { useEffect } from 'react';
import { AlertCircle, HelpCircle } from 'lucide-react';
import styles from './CustomModal.module.css';

export interface CustomModalProps {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function CustomModal({ isOpen, type, title, message, onConfirm, onCancel }: CustomModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (onCancel) onCancel();
        else onConfirm();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => { if (onCancel) onCancel(); else onConfirm(); }}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>
          {type === 'alert' ? <AlertCircle color="var(--warning)" size={24} /> : <HelpCircle color="var(--primary)" size={24} />}
          {title}
        </h3>
        <div className={styles.message}>{message}</div>
        <div className={styles.actions}>
          {type === 'confirm' && onCancel && (
            <button className={styles.button} onClick={onCancel}>Cancel</button>
          )}
          <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={onConfirm}>
            {type === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
