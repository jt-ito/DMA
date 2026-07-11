"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Trash2, ShieldAlert, FileText, X, RefreshCw, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { DockerContainer } from '@/lib/docker';
import styles from './ContainerList.module.css';

interface Props {
  envId: string;
  isDeploying?: boolean;
}

const globalCache: Record<string, { data?: DockerContainer[], error?: string }> = {};

function formatExactUptime(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (isNaN(diff) || diff < 0) return 'Unknown';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const parts = [];
  if (d > 0) parts.push(`${d} days`);
  if (h > 0 || d > 0) parts.push(`${h} hours`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m} minutes`);
  parts.push(`${s} seconds`);
  return parts.join(', ');
}

export function ContainerList({ envId, isDeploying }: Props) {
  // Initialize state directly from global cache so there is absolutely no flash
  const initialCache = globalCache[envId];
  
  const [containers, setContainers] = useState<DockerContainer[]>(initialCache?.data || []);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(initialCache?.error || null);
  const [granularStates, setGranularStates] = useState<Record<string, string>>({});

  // Logs state
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedContainerName, setSelectedContainerName] = useState<string>('');
  const [updatingAll, setUpdatingAll] = useState(false);
  const logsContainerRef = useRef<HTMLPreElement>(null);

  const handleExportLogs = () => {
    const blob = new Blob([currentLogs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainerName}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scrollToTop = () => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTo({ top: logsContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  

  const fetchContainers = useCallback((forceRefresh = false) => {
    if (forceRefresh) {
      setLoading(true);
      setError(null);
      setContainers([]);
    }

    fetch(`/api/containers?envId=${envId}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch containers');
        }
        if (Array.isArray(data)) {
          setContainers(data);
          setError(null);
          globalCache[envId] = { data };
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setContainers([]);
        globalCache[envId] = { error: e.message };
        setLoading(false);
      });
  }, [envId]);

  useEffect(() => {
    // Revalidate silently in background immediately
    fetchContainers(false);

    // Refresh periodically to update uptimes
    const intervalId = setInterval(() => {
      fetchContainers(false);
    }, 10000); // 10 seconds

    return () => clearInterval(intervalId);
  }, [fetchContainers]);

  // When deployment finishes, automatically refresh the list
  useEffect(() => {
    if (!isDeploying) {
      fetchContainers(false);
    }
  }, [isDeploying, fetchContainers]);

  const setContainerState = (id: string, state: string | null) => {
    setGranularStates(prev => {
      if (state === null) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: state };
    });
  };

  const apiPost = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return res;
  };

  const handleAction = async (containerId: string, action: string) => {
    const stateMapping: Record<string, string> = { start: 'starting', stop: 'stopping', restart: 'restarting', remove: 'removing' };
    setContainerState(containerId, stateMapping[action] || 'updating');
    try {
      await apiPost('/api/containers', { envId, containerId, action });
      fetchContainers();
    } catch (e) {
      console.error(e);
      alert(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(containerId, null);
  };

  const handleDownCompose = async (container: DockerContainer) => {
    if (!container.WorkingDir || !container.Service) return;
    try {
      setContainerState(container.ID, 'stopping');
      await apiPost('/api/compose', { action: 'stop', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles });
      
      setContainerState(container.ID, 'removing');
      await apiPost('/api/compose', { action: 'rm -f', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles });
      
      fetchContainers();
    } catch (e) {
      console.error(e);
      alert(`Down failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(container.ID, null);
  };

  const handleUpdateCompose = async (container: DockerContainer, skipFetch = false) => {
    if (!container.WorkingDir || !container.Service) return;
    try {
      // 1. Stop
      setContainerState(container.ID, 'stopping');
      await apiPost('/api/compose', { action: 'stop', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Stop step failed:\n' + e.message) });
      
      // 2. Remove container
      setContainerState(container.ID, 'removing');
      await apiPost('/api/compose', { action: 'rm -f', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Remove container step failed:\n' + e.message) });

      // 3. Delete the image explicitly
      setContainerState(container.ID, 'cleaning');
      await apiPost('/api/compose', { action: 'rmi', envId, imageName: container.Image }).catch(e => { throw new Error('Remove image step failed:\n' + e.message) });
      
      // 4. Pull
      setContainerState(container.ID, 'pulling');
      await apiPost('/api/compose', { action: 'pull', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Pull step failed:\n' + e.message) });
      
      // 5. Start
      setContainerState(container.ID, 'starting');
      await apiPost('/api/compose', { action: 'up -d', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Start step failed:\n' + e.message) });
      
      if (!skipFetch) fetchContainers();
    } catch (e) {
      console.error(e);
      alert(`Update failed for ${container.Names}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(container.ID, null);
  };

  const handleUpdateAll = async () => {
    const composeContainers = containers.filter(c => c.Project && c.Service && c.WorkingDir);
    if (composeContainers.length === 0) {
       alert("No compose containers found to update.");
       return;
    }
    
    if (!confirm(`Are you sure you want to update all ${composeContainers.length} compose containers? This will process them sequentially and may take a while.`)) return;
    
    setUpdatingAll(true);
    for (const c of composeContainers) {
      await handleUpdateCompose(c, true);
    }
    fetchContainers();
    setUpdatingAll(false);
  };

  const handleViewLogs = async (container: DockerContainer) => {
    setSelectedContainerName(container.Names);
    setCurrentLogs('');
    setLogsLoading(true);
    setLogsModalOpen(true);
    
    try {
      const res = await fetch(`/api/logs?envId=${envId}&containerId=${container.ID}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch logs');
      }
      setCurrentLogs(data.logs);
    } catch (e: any) {
      setCurrentLogs(`Error fetching logs: ${e.message}`);
    }
    setLogsLoading(false);
  };

  if (loading && containers.length === 0) return <div className={styles.loading}>Loading containers...</div>;

  if (error) return (
    <div className={`glass-panel ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <h3>Containers</h3>
        <button className="glass-button" onClick={() => fetchContainers(true)}>Retry</button>
      </div>
      <div className={styles.error}>
        <strong>Error connecting to environment:</strong>
        <p>{error}</p>
      </div>
    </div>
  );

  return (
    <div className={`glass-panel ${styles.panel}`}>
      
      {isDeploying && (
        <div className={styles.deployOverlay}>
          <div className={styles.deployOverlayContent}>
            <div className={styles.spinner}></div>
            <h2>Deploying Compose Stack...</h2>
            <p>Your containers are being updated. This may take a few moments as we pull images and recreate services.</p>
          </div>
        </div>
      )}

      <div className={styles.panelHeader}>
        <h3>Containers</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="glass-button" 
            onClick={handleUpdateAll} 
            disabled={updatingAll}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={16} className={updatingAll ? styles.spin : ''} /> 
            {updatingAll ? 'Updating All...' : 'Update All'}
          </button>
          <button className="glass-button" onClick={() => fetchContainers(true)} disabled={updatingAll}>
            Refresh
          </button>
        </div>
      </div>
      
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>State</th>
              <th>Image</th>
              <th>Compose Project</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {containers.map(c => {
              const granularState = granularStates[c.ID];
              const displayState = granularState || c.State;
              const isRunning = displayState === 'running';
              const isCompose = c.Project && c.Service && c.WorkingDir;
              const isLoading = granularState != null;
              
              const badgeClass = 
                displayState === 'running' ? 'badge-success' : 
                displayState === 'pulling' ? 'badge-pulling' :
                displayState === 'starting' ? 'badge-starting' :
                displayState === 'cleaning' ? 'badge-cleaning' :
                displayState === 'stopping' ? 'badge-stopping' :
                displayState === 'removing' ? 'badge-removing' :
                displayState === 'restarting' ? 'badge-restarting' :
                'badge-danger';
              
              return (
                <tr key={c.ID} className={isLoading ? styles.loadingRow : ''}>
                  <td className={styles.nameCell}>
                    <strong>{c.Names}</strong>
                    <span className={styles.idText}>{c.ID.substring(0, 12)}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={`badge ${badgeClass}`}>
                        {displayState}
                      </span>
                      {c.Status && c.Status.startsWith('Up ') && (
                        <span className={styles.uptimeText} title={c.StartedAt ? formatExactUptime(c.StartedAt) : c.Status}>
                          {c.Status.substring(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={styles.imageCell} title={c.Image}>{c.Image}</td>
                  <td>
                    {isCompose ? (
                      <div className={styles.composeInfo}>
                        <span className={styles.projectText}>{c.Project}</span>
                        <span className={styles.serviceText}>{c.Service}</span>
                      </div>
                    ) : '-'}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {isRunning ? (
                        <button title="Stop" className={styles.actionBtn} onClick={() => handleAction(c.ID, 'stop')} disabled={isLoading}>
                          <Square size={16} />
                        </button>
                      ) : (
                        <button title="Start" className={styles.actionBtn} onClick={() => handleAction(c.ID, 'start')} disabled={isLoading}>
                          <Play size={16} />
                        </button>
                      )}
                      
                      <button title="Restart" className={styles.actionBtn} onClick={() => handleAction(c.ID, 'restart')} disabled={isLoading}>
                        <RotateCcw size={16} />
                      </button>
                      
                      <button title="Remove" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleAction(c.ID, 'remove')} disabled={isLoading}>
                        <Trash2 size={16} />
                      </button>
                      
                      <button title="View Logs" className={styles.actionBtn} onClick={() => handleViewLogs(c)} disabled={isLoading}>
                        <FileText size={16} />
                      </button>
                      

                      {isCompose && (
                        <>
                          <button 
                            title="Update Service (Stops, removes container, prunes image, pulls new image, and starts service)" 
                            className={`${styles.actionBtn} ${styles.primary}`} 
                            onClick={() => handleUpdateCompose(c)} 
                            disabled={isLoading}
                          >
                            <RefreshCw size={16} /> Update
                          </button>
                          <button 
                            title="Down Compose Service" 
                            className={`${styles.actionBtn} ${styles.warning}`} 
                            onClick={() => handleDownCompose(c)} 
                            disabled={isLoading}
                          >
                            <ShieldAlert size={16} /> Down Service
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {containers.length === 0 && !loading && (
          <div className={styles.empty}>No containers found in this environment.</div>
        )}
      </div>

      {logsModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setLogsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Logs: {selectedContainerName}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button title="Export Logs" className={styles.actionBtn} onClick={handleExportLogs}>
                  <Download size={18} />
                </button>
                <button title="Scroll to Top" className={styles.actionBtn} onClick={scrollToTop}>
                  <ArrowUp size={18} />
                </button>
                <button title="Scroll to Bottom" className={styles.actionBtn} onClick={scrollToBottom}>
                  <ArrowDown size={18} />
                </button>
                <button className={styles.closeBtn} onClick={() => setLogsModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className={styles.modalBody}>
              {logsLoading ? (
                <div className={styles.loading}>Fetching logs...</div>
              ) : (
                <pre className={styles.logsPre} ref={logsContainerRef}>{currentLogs || 'No logs available.'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
