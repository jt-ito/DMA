"use client";

import { useState, useEffect, useRef } from 'react';
import { Save, Play, Upload, HardDrive } from 'lucide-react';
import { Environment } from '@/lib/executor';
import { RemoteFileBrowser } from './RemoteFileBrowser';
import styles from './ComposeEditor.module.css';

interface Props {
  envId: string;
  onDeployStart?: () => void;
  onDeployEnd?: (success: boolean) => void;
}

function truncatePath(path: string, maxLength: number = 35) {
  if (!path || path === 'Auto-detected' || path.length <= maxLength) return path;
  const separator = path.includes('\\') ? '\\' : '/';
  const parts = path.split(separator);
  if (parts.length <= 2) {
    return path.substring(0, 15) + '...' + path.substring(path.length - 15);
  }
  const first = parts[0] + separator + parts[1];
  const last = parts.slice(-2).join(separator); // show last dir and file
  const combined = `${first}${separator}...${separator}${last}`;
  if (combined.length > maxLength + 10) {
     return path.substring(0, 10) + '...' + path.substring(path.length - 15);
  }
  return combined;
}

export function ComposeEditor({ envId, onDeployStart, onDeployEnd }: Props) {
  const [yamlContent, setYamlContent] = useState('');
  const [envContent, setEnvContent] = useState('');
  const [activeEditor, setActiveEditor] = useState<'compose' | 'env'>('compose');
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [env, setEnv] = useState<Environment | null>(null);
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const [backupPrompt, setBackupPrompt] = useState<{ content: string, filePath: string } | null>(null);
  const [backupPath, setBackupPath] = useState('');
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null);
  const [envFilePath, setEnvFilePath] = useState<string>('');
  const [browserTarget, setBrowserTarget] = useState<'compose' | 'env'>('compose');
  const [pruneImages, setPruneImages] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const lastSavedEnvContentRef = useRef<string>('');
  const [autoDetectedEnvPath, setAutoDetectedEnvPath] = useState<string>('');

  const effectiveEnvPath = envFilePath || autoDetectedEnvPath;

  useEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      textareaRef.current.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      pendingSelection.current = null;
    }
  }, [yamlContent]);

  useEffect(() => {
    if (!loadedFilePath) {
      setAutoDetectedEnvPath('');
      return;
    }

    const detectEnvFile = async () => {
      const isWindows = loadedFilePath.includes('\\');
      const separator = isWindows ? '\\' : '/';
      const lastSlashIndex = loadedFilePath.lastIndexOf(separator);
      if (lastSlashIndex === -1) return;
      
      const dirPath = loadedFilePath.substring(0, lastSlashIndex);
      const baseName = loadedFilePath.substring(lastSlashIndex + 1);
      const nameWithoutExt = baseName.replace(/\.ya?ml$/i, '');

      try {
        const res = await fetch('/api/fs/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId, path: dirPath })
        });
        const data = await res.json();
        if (res.ok && data.items) {
          const envFiles = data.items.filter((item: any) => !item.isDir && item.name.includes('.env'));
          
          let selectedEnvName = '';
          if (envFiles.length === 1) {
            selectedEnvName = envFiles[0].name;
          } else if (envFiles.length > 1) {
            const baseMatch = envFiles.find((item: any) => item.name === `${nameWithoutExt}.env`);
            if (baseMatch) {
              selectedEnvName = baseMatch.name;
            } else {
              const exactEnvMatch = envFiles.find((item: any) => item.name === '.env');
              if (exactEnvMatch) {
                selectedEnvName = exactEnvMatch.name;
              }
            }
          }

          if (selectedEnvName) {
            setAutoDetectedEnvPath(`${dirPath}${separator}${selectedEnvName}`);
          } else {
            setAutoDetectedEnvPath(`${dirPath}${separator}.env`);
          }
        } else {
          setAutoDetectedEnvPath(`${dirPath}${separator}.env`);
        }
      } catch (e) {
        setAutoDetectedEnvPath(`${dirPath}${separator}.env`);
      }
    };
    detectEnvFile();
  }, [envId, loadedFilePath]);

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
          if (envData.envFilePath) {
            setEnvFilePath(envData.envFilePath);
            try {
              const envRes = await fetch('/api/fs/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ envId, path: envData.envFilePath })
              });
              const envFileData = await envRes.json();
              if (envRes.ok && envFileData.content !== undefined) {
                setEnvContent(envFileData.content);
                lastSavedEnvContentRef.current = envFileData.content;
              }
            } catch(e) {}
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
    // Polling for external changes
    const intervalId = setInterval(async () => {
      if (loadedFilePath) {
        try {
          const res = await fetch('/api/fs/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envId, path: loadedFilePath })
          });
          const data = await res.json();
          if (res.ok && data.content !== undefined && data.content !== lastSavedContentRef.current) {
            lastSavedContentRef.current = data.content;
            setYamlContent(data.content);
          }
        } catch (e) {}
      }
      
      if (effectiveEnvPath) {
        try {
          const res = await fetch('/api/fs/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envId, path: effectiveEnvPath })
          });
          const data = await res.json();
          if (res.ok && data.content !== undefined && data.content !== lastSavedEnvContentRef.current) {
            lastSavedEnvContentRef.current = data.content;
            setEnvContent(data.content);
          }
        } catch (e) {}
      }
    }, 2000); // 2 second polling

    return () => clearInterval(intervalId);
  }, [envId, loadedFilePath, effectiveEnvPath]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (loadedFilePath && yamlContent !== lastSavedContentRef.current) {
        try {
          const res = await fetch('/api/fs/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envId, path: loadedFilePath, content: yamlContent })
          });
          if (res.ok) lastSavedContentRef.current = yamlContent;
        } catch (e) {}
      }
      
      if (effectiveEnvPath && envContent !== lastSavedEnvContentRef.current) {
        try {
          const res = await fetch('/api/fs/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envId, path: effectiveEnvPath, content: envContent })
          });
          if (res.ok) lastSavedEnvContentRef.current = envContent;
        } catch (e) {}
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(timeoutId);
  }, [yamlContent, envContent, envId, loadedFilePath, effectiveEnvPath]);


  const handleDeploy = async () => {
    setDeploying(true);
    if (onDeployStart) onDeployStart();
    setError(null);
    setSuccess(null);
    let isSuccess = false;
    try {
      const res = await fetch('/api/compose/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          envId, 
          yamlContent, 
          composeFilePath: loadedFilePath || undefined,
          envFilePath: effectiveEnvPath || undefined,
          pruneImages 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Deploy failed');
      }
      setSuccess("Successfully deployed docker-compose.yml!");
      isSuccess = true;
    } catch (e: any) {
      setError(e.message);
    }
    setDeploying(false);
    if (onDeployEnd) onDeployEnd(isSuccess);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;
    const isEnv = activeEditor === 'env';
    const setContent = isEnv ? setEnvContent : setYamlContent;

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
      setContent(newValue);
      
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
        setContent(newValue);
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
        setContent(newValue);
        
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
        setContent(newValue);
        
        pendingSelection.current = {
          start: start - prevLine.length - 1,
          end: end - prevLine.length - 1
        };
      } else if (e.key === 'ArrowDown' && lineEnd < value.length) {
        const nextLineEnd = value.indexOf('\n', lineEnd + 1);
        const actualNextLineEnd = nextLineEnd === -1 ? value.length : nextLineEnd;
        const nextLine = value.substring(lineEnd + 1, actualNextLineEnd);
        
        const newValue = value.substring(0, lineStart) + nextLine + '\n' + selectedLines + value.substring(actualNextLineEnd);
        setContent(newValue);
        
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
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
          <button 
            className="glass-button" 
            onClick={() => { setBrowserTarget('compose'); setRemoteBrowserOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <HardDrive size={16} /> Select Compose File
          </button>
          
          {effectiveEnvPath && (
              <button 
                className="glass-button" 
                onClick={() => setActiveEditor(activeEditor === 'compose' ? 'env' : 'compose')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <HardDrive size={16} style={{ visibility: 'hidden', width: 0 }} /> {/* Spacer to match height/alignment if needed, or just remove */}
                Switch to {activeEditor === 'compose' ? '.env' : 'Compose'}
              </button>
            )}
        </div>
        {loadedFilePath && (
          <div className={styles.envFileContainer}>
            <button className="glass-button" onClick={() => { setBrowserTarget('env'); setRemoteBrowserOpen(true); }}>Browse</button>
            <span style={{ fontWeight: 500 }}>Env File:</span>
            <input 
              type="text" 
              readOnly 
              value={envFilePath ? truncatePath(envFilePath) : 'Auto-detected'} 
              className={styles.input} 
              style={{ flex: 'none', width: '300px' }}
              title={envFilePath || 'Auto-detected'}
            />
          </div>
        )}
      </div>

      {remoteBrowserOpen && (
        <RemoteFileBrowser 
          envId={envId}
          allowedExtensions={browserTarget === 'compose' ? ['.yml', '.yaml'] : ['.env']}
          onClose={() => setRemoteBrowserOpen(false)}
          onFileSelect={(content: string, filePath?: string) => {
            if (browserTarget === 'compose') {
              if (filePath) {
                setBackupPrompt({ content, filePath });
                setBackupPath(`${filePath}.bak`);
                setRemoteBrowserOpen(false);
              } else {
                setYamlContent(content);
                setSuccess("File loaded successfully. Review and click Deploy.");
                setError(null);
                setRemoteBrowserOpen(false);
              }
            } else {
              setEnvFilePath(filePath || '');
              setEnvContent(content || '');
              lastSavedEnvContentRef.current = content || '';
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
              className={styles.input}
              style={{ marginBottom: '1.5rem', width: '100%' }}
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
          value={activeEditor === 'env' ? envContent : yamlContent}
          onChange={(e) => activeEditor === 'env' ? setEnvContent(e.target.value) : setYamlContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeEditor === 'env' ? "ENV_VAR=value\nANOTHER_VAR=123" : "version: '3'\nservices:\n  ..."}
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
