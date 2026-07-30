"use client";

import { useState, useEffect } from 'react';
import { Folder, File, FileCode, X, ChevronUp, HardDrive } from 'lucide-react';
import styles from './RemoteFileBrowser.module.css';

interface FsItem {
  name: string;
  isDir: boolean;
}

interface Props {
  envId: string;
  onClose: () => void;
  onFileSelect?: (content: string, filePath?: string) => void;
  onDirSelect?: (path: string) => void;
  allowedExtensions?: string[];
  mode?: 'file' | 'directory';
}

export function RemoteFileBrowser({ envId, onClose, onFileSelect, onDirSelect, allowedExtensions = ['.yml', '.yaml'], mode = 'file' }: Props) {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`lastRemotePath-${envId}`) || '~';
    }
    return '~';
  });
  const [items, setItems] = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchList(currentPath);
  }, [currentPath]);

  const fetchList = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fs/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envId, path })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list directory');
      setItems(data.items);
      if (data.actualPath && data.actualPath !== currentPath) {
        setCurrentPath(data.actualPath);
        localStorage.setItem(`lastRemotePath-${envId}`, data.actualPath);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleItemClick = async (item: FsItem) => {
    if (item.isDir) {
      // Build new path
      const separator = currentPath.endsWith('/') ? '' : '/';
      const newPath = currentPath === '~' ? `~/${item.name}` : `${currentPath}${separator}${item.name}`;
      setCurrentPath(newPath);
      localStorage.setItem(`lastRemotePath-${envId}`, newPath);
    } else {
      // Is a file, check extensions
      const ext = item.name.substring(item.name.lastIndexOf('.'));
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext) && !allowedExtensions.includes(item.name)) {
        return;
      }
      // Read file
      setLoading(true);
      setError(null);
      try {
        const separator = currentPath.endsWith('/') ? '' : '/';
        const filePath = currentPath === '~' ? `~/${item.name}` : `${currentPath}${separator}${item.name}`;
        
        const res = await fetch('/api/fs/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId, path: filePath })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read file');
        
        localStorage.setItem(`lastRemotePath-${envId}`, currentPath);
        if (onFileSelect) onFileSelect(data.content, filePath);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    }
  };

  const handleGoUp = () => {
    if (currentPath === '~' || currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.length === 0 ? '/' : parts.join('/');
    setCurrentPath(newPath || '/');
    localStorage.setItem(`lastRemotePath-${envId}`, newPath || '/');
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3><HardDrive size={20} /> {mode === 'file' ? 'Select Compose File' : 'Select Directory'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className={styles.pathBar}>
          <button 
            className={styles.upBtn} 
            onClick={handleGoUp}
            disabled={currentPath === '~' || currentPath === '/'}
            style={{ opacity: (currentPath === '~' || currentPath === '/') ? 0.5 : 1 }}
          >
            <ChevronUp size={16} />
          </button>
          <span>{currentPath}</span>
          {mode === 'directory' && (
             <button 
                className="glass-button" 
                style={{ marginLeft: 'auto', padding: '0.2rem 0.8rem', fontSize: '0.9rem' }}
                onClick={() => {
                   if (onDirSelect) onDirSelect(currentPath);
                }}
             >
                Select this directory
             </button>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <ul className={styles.fileList}>
            {items.map(item => {
              const ext = item.name.substring(item.name.lastIndexOf('.'));
              const isSelectableFile = !item.isDir && (allowedExtensions.length === 0 || allowedExtensions.includes(ext) || allowedExtensions.includes(item.name));
              const disabled = !item.isDir && !isSelectableFile;
              
              return (
                <li 
                  key={item.name}
                  className={`${styles.fileItem} ${disabled ? styles.disabled : ''}`}
                  onClick={() => !disabled && handleItemClick(item)}
                >
                  {item.isDir ? <Folder size={18} color="#facc15" /> : (
                    isSelectableFile ? <FileCode size={18} color="#3b82f6" /> : <File size={18} color="#6b7280" />
                  )}
                  <span className={styles.fileName}>{item.name}</span>
                </li>
              );
            })}
            {items.length === 0 && !error && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                Empty directory
              </div>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
