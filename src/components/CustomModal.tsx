import React, { useEffect, useState } from 'react';
import { AlertCircle, HelpCircle, Globe, Copy } from 'lucide-react';
import styles from './CustomModal.module.css';

export interface CustomModalProps {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'info';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  copyText?: string;
}

export function CustomModal({ isOpen, type, title, message, onConfirm, onCancel, copyText }: CustomModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyText) {
      navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          {type === 'alert' && <AlertCircle color="var(--warning)" size={24} />}
          {type === 'confirm' && <HelpCircle color="var(--accent)" size={24} />}
          {type === 'info' && <Globe color="var(--accent)" size={24} />}
          {title}
        </h3>
        <div className={styles.message}>{message}</div>
        <div className={styles.actions}>
          {copyText && (
            <button className={styles.button} onClick={handleCopy} style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
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
