"use client";

import { useState, useEffect, useRef } from 'react';
import { Save, Play, Upload, HardDrive } from 'lucide-react';
import { Environment } from '@/lib/executor';
import { RemoteFileBrowser } from './RemoteFileBrowser';
import styles from './ComposeEditor.module.css';

interface Props {
  envId: string;
  onDeployStart?: () => void;
  onDeployEnd?: () => void;
}

export function ComposeEditor({ envId, onDeployStart, onDeployEnd }: Props) {
  const [yamlContent, setYamlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [env, setEnv] = useState<Environment | null>(null);
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const [backupPrompt, setBackupPrompt] = useState<{ content: string, filePath: string } | null>(null);
  const [backupPath, setBackupPath] = useState('');
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null);
  const [pruneImages, setPruneImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const lastSavedContentRef = useRef<string>('');

  useEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      textareaRef.current.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      pendingSelection.current = null;
    }
  }, [yamlContent]);

  useEffect(() => {
    // Fetch the current environment to get its saved composeYaml
    const fetchEnv = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/environments`);
        const data = await res.json();
        const envData = data.find((e: any) => e.id === envId);
        if (envData) {
          setEnv(envData);
          if (envData.composeFilePath) {
            setLoadedFilePath(envData.composeFilePath);
            // Fetch live content from the remote file
            try {
              const fileRes = await fetch('/api/fs/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ envId, path: envData.composeFilePath })
              });
              const fileData = await fileRes.json();
              if (fileRes.ok && fileData.content) {
                setYamlContent(fileData.content);
                lastSavedContentRef.current = fileData.content;
              } else if (envData.composeYaml) {
                setYamlContent(envData.composeYaml); // fallback
                lastSavedContentRef.current = envData.composeYaml;
              }
            } catch (e) {
              if (envData.composeYaml) {
                setYamlContent(envData.composeYaml);
                lastSavedContentRef.current = envData.composeYaml;
              }
            }
          } else if (envData.composeYaml) {
            setYamlContent(envData.composeYaml);
            lastSavedContentRef.current = envData.composeYaml;
          }
          if (envData.pruneImagesOnDeploy !== undefined) {
            setPruneImages(envData.pruneImagesOnDeploy);
          }
        }
      } catch (e: any) {
        console.error("Failed to fetch environment:", e);
      }
      setLoading(false);
    };
    fetchEnv();
  }, [envId]);

  useEffect(() => {
    if (!loadedFilePath) return;

    // Polling for external changes
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/fs/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId, path: loadedFilePath })
        });
        const data = await res.json();
        if (res.ok && data.content !== undefined) {
          if (data.content !== lastSavedContentRef.current) {
            // File changed on disk! Update editor to match disk
            lastSavedContentRef.current = data.content;
            setYamlContent(data.content);
          }
        }
      } catch (e) {
        // ignore errors in polling
      }
    }, 2000); // 2 second polling

    return () => clearInterval(intervalId);
  }, [envId, loadedFilePath]);

  useEffect(() => {
    if (!loadedFilePath || yamlContent === lastSavedContentRef.current) return;

    // Auto-save changes made in editor to disk
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId, path: loadedFilePath, content: yamlContent })
        });
        if (res.ok) {
          lastSavedContentRef.current = yamlContent;
        }
      } catch (e) {
        // ignore errors in auto-save
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(timeoutId);
  }, [yamlContent, envId, loadedFilePath]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setYamlContent(event.target.result as string);
        setSuccess("File loaded successfully. Review and click Deploy.");
        setError(null);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    if (onDeployStart) onDeployStart();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/compose/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          envId, 
          yamlContent, 
          composeFilePath: loadedFilePath || undefined,
          pruneImages 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Deploy failed');
      }
      setSuccess("Successfully deployed docker-compose.yml!");
    } catch (e: any) {
      setError(e.message);
    }
    setDeploying(false);
    if (onDeployEnd) onDeployEnd();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;

    const getLineBounds = (s: number, e: number) => {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      let lineEnd = value.indexOf('\n', e);
      if (lineEnd === -1) lineEnd = value.length;
      return { lineStart, lineEnd };
    };

    // Ctrl + S or Cmd + S -> Deploy
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleDeploy();
      return;
    }

    // Ctrl + / or Cmd + / -> Toggle Comment
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const { lineStart, lineEnd } = getLineBounds(start, end);
      const selectedLines = value.substring(lineStart, lineEnd);
      const lines = selectedLines.split('\n');
      
      const allCommented = lines.every(line => line.trim() === '' || line.trimStart().startsWith('#'));
      
      const newLines = lines.map(line => {
        if (line.trim() === '') return line;
        if (allCommented) {
          return line.replace(/^(\s*)#\s?/, '$1');
        } else {
          return line.replace(/^(\s*)/, '$1# ');
        }
      });
      
      const newValue = value.substring(0, lineStart) + newLines.join('\n') + value.substring(lineEnd);
      setYamlContent(newValue);
      
      const startLineDiff = newLines[0].length - lines[0].length;
      const totalDiff = newValue.length - value.length;
      pendingSelection.current = {
        start: Math.max(lineStart, start + startLineDiff),
        end: Math.max(lineStart, end + totalDiff)
      };
      return;
    }

    // Tab -> Indent / Outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      const { lineStart, lineEnd } = getLineBounds(start, end);
      const isMultiLine = value.substring(start, end).includes('\n') || e.shiftKey;

      if (!isMultiLine && !e.shiftKey) {
        // Simple insert spaces at cursor
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        setYamlContent(newValue);
        pendingSelection.current = { start: start + 2, end: start + 2 };
      } else {
        // Multi-line indent/outdent
        const selectedLines = value.substring(lineStart, lineEnd);
        const lines = selectedLines.split('\n');
        
        const newLines = lines.map(line => {
          if (e.shiftKey) {
            return line.replace(/^ {1,2}/, '');
          } else {
            return '  ' + line;
          }
        });
        
        const newValue = value.substring(0, lineStart) + newLines.join('\n') + value.substring(lineEnd);
        setYamlContent(newValue);
        
        const startDiff = newLines[0].length - lines[0].length;
        const totalDiff = newValue.length - value.length;
        pendingSelection.current = {
          start: Math.max(lineStart, start + startDiff),
          end: Math.max(lineStart, end + totalDiff)
        };
      }
      return;
    }

    // Alt + Up / Alt + Down -> Move line up/down
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const { lineStart, lineEnd } = getLineBounds(start, end);
      const selectedLines = value.substring(lineStart, lineEnd);
      
      if (e.key === 'ArrowUp' && lineStart > 0) {
        const prevLineStart = value.lastIndexOf('\n', lineStart - 2) + 1;
        const prevLine = value.substring(prevLineStart, lineStart - 1);
        
        const newValue = value.substring(0, prevLineStart) + selectedLines + '\n' + prevLine + value.substring(lineEnd);
        setYamlContent(newValue);
        
        pendingSelection.current = {
          start: start - prevLine.length - 1,
          end: end - prevLine.length - 1
        };
      } else if (e.key === 'ArrowDown' && lineEnd < value.length) {
        const nextLineEnd = value.indexOf('\n', lineEnd + 1);
        const actualNextLineEnd = nextLineEnd === -1 ? value.length : nextLineEnd;
        const nextLine = value.substring(lineEnd + 1, actualNextLineEnd);
        
        const newValue = value.substring(0, lineStart) + nextLine + '\n' + selectedLines + value.substring(actualNextLineEnd);
        setYamlContent(newValue);
        
        pendingSelection.current = {
          start: start + nextLine.length + 1,
          end: end + nextLine.length + 1
        };
      }
      return;
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading editor...</div>;
  }

  return (
    <div className={`glass-panel ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <h3>Compose Editor</h3>
        <p className={styles.subtitle}>
          {loadedFilePath ? (
            <>Editing remote file: <code>{loadedFilePath}</code></>
          ) : (
            <>Enter your <code>docker-compose.yml</code> here. Comment out services you don't need, then click Deploy.</>
          )}
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.controls}>
        {env?.type === 'local' ? (
          <>
            <input 
              type="file" 
              accept=".yml,.yaml" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
            <button 
              className="glass-button" 
              onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}
            >
              <Upload size={16} /> Load Local File
            </button>
          </>
        ) : (
          <button 
            className="glass-button" 
            onClick={() => setRemoteBrowserOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}
          >
            <HardDrive size={16} /> Browse Remote File
          </button>
        )}
      </div>

      {remoteBrowserOpen && (
        <RemoteFileBrowser 
          envId={envId}
          onClose={() => setRemoteBrowserOpen(false)}
          onFileSelect={(content, filePath) => {
            if (filePath) {
              setBackupPrompt({ content, filePath });
              setBackupPath(`${filePath}.bak`);
              setRemoteBrowserOpen(false);
            } else {
              setYamlContent(content);
              setSuccess("Remote file loaded successfully. Review and click Deploy.");
              setError(null);
              setRemoteBrowserOpen(false);
            }
          }}
        />
      )}

      {backupPrompt && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ height: 'auto', padding: '1.5rem', maxWidth: '500px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Backup Original File</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Where do you want to create a backup copy of this file?
            </p>
            <input 
              type="text" 
              value={backupPath}
              onChange={e => setBackupPath(e.target.value)}
              style={{ width: '100%', marginBottom: '1.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '6px' }}
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                className="glass-button" 
                onClick={() => {
                  setYamlContent(backupPrompt.content);
                  setLoadedFilePath(backupPrompt.filePath);
                  setSuccess("Remote file loaded successfully. Backup skipped.");
                  setError(null);
                  setBackupPrompt(null);
                }}
              >
                Skip Backup
              </button>
              <button 
                className="glass-button" 
                style={{ background: 'var(--primary)', color: 'white' }} 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/fs/copy', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ envId, src: backupPrompt.filePath, dest: backupPath })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    setSuccess(`Backup created at ${backupPath}. File loaded.`);
                    setError(null);
                  } catch (e: any) {
                    setError(`Failed to create backup: ${e.message}`);
                  }
                  setYamlContent(backupPrompt.content);
                  setLoadedFilePath(backupPrompt.filePath);
                  setBackupPrompt(null);
                }}
              >
                Create Backup & Load
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.editorContainer}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={yamlContent}
          onChange={(e) => setYamlContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="version: '3'&#10;services:&#10;  ..."
          spellCheck={false}
        />
      </div>

      <div className={styles.actions}>
        <label className={styles.switchContainer}>
          <div className={styles.switch}>
            <input 
              type="checkbox" 
              checked={pruneImages}
              onChange={(e) => setPruneImages(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </div>
          Delete all images before deploy (Clean Rebuild)
        </label>
        <button
          className={`glass-button ${styles.deployBtn}`}
          onClick={handleDeploy}
          disabled={deploying || !yamlContent.trim()}
        >
          {deploying ? 'Deploying...' : (
            <>
              <Play size={16} /> Deploy Compose
            </>
          )}
        </button>
      </div>
    </div>
  );
}
