"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Trash2, ShieldAlert, FileText, X, RefreshCw, Download, ArrowUp, ArrowDown, Copy, Activity, Settings, AlertCircle, Terminal } from 'lucide-react';
import { DockerContainer } from '@/lib/docker';
import { CustomModal } from './CustomModal';
import { RemoteFileBrowser } from './RemoteFileBrowser';
import { Environment } from '@/lib/executor';
import styles from './ContainerList.module.css';

interface Props {
  envId: string;
  env: Environment;
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

export function ContainerList({ envId, env, isDeploying }: Props) {
  // Initialize state directly from global cache so there is absolutely no flash
  const initialCache = globalCache[envId];
  
  const [containers, setContainers] = useState<DockerContainer[]>(initialCache?.data || []);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(initialCache?.error || null);
  const [granularStates, setGranularStates] = useState<Record<string, string>>({});

  const granularStatesRef = useRef(granularStates);
  useEffect(() => {
    granularStatesRef.current = granularStates;
  }, [granularStates]);

  // Logs state
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedContainerName, setSelectedContainerName] = useState<string>('');
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [updateAllStatus, setUpdateAllStatus] = useState<string>('');
  const logsContainerRef = useRef<HTMLPreElement>(null);

  const [execCommandText, setExecCommandText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [execOutput, setExecOutput] = useState<{ stdout: string; stderr: string; code?: number } | null>(null);
  const execInputRef = useRef<HTMLInputElement>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showExecSection, setShowExecSection] = useState(false);
  const [execHistoryLines, setExecHistoryLines] = useState<{ cmd: string, stdout: string, stderr: string, code?: number }[]>([]);

  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [currentStats, setCurrentStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('unless-stopped');

  const [imageUpdates, setImageUpdates] = useState<Record<string, { available: boolean, remoteDigest: string, localDigest: string }>>({});
  
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<'compose' | 'env'>('compose');

  type SortColumn = 'name' | 'state' | 'image' | 'composeProject';
  type SortDirection = 'asc' | 'desc';
  
  const [sortColumn, setSortColumn] = useState<SortColumn>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('containerSortColumn') as SortColumn) || 'composeProject';
    }
    return 'composeProject';
  });
  
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('containerSortDirection') as SortDirection) || 'asc';
    }
    return 'asc';
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleBulkAction = async (action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    if (action === 'update') {
      const composeContainers = containers.filter(c => selectedIds.has(c.ID) && c.Project && c.Service && c.WorkingDir);
      if (composeContainers.length === 0) return;
      
      const confirmed = await showConfirm(
        'Update Compose Services',
        `Are you sure you want to pull the latest image and recreate ${composeContainers.length} compose service(s)?`
      );
      if (!confirmed) return;
      
      const failed: { name: string, error: string }[] = [];
      
      for (const c of composeContainers) {
        try {
          await handleUpdateCompose(c, true, true);
        } catch (e: any) {
          console.error(e);
          failed.push({ name: c.Names, error: e.message || String(e) });
        }
      }
      
      setSelectedIds(new Set());
      fetchContainers();
      
      if (failed.length > 0) {
        const msg = failed.map(f => `- ${f.name}: ${f.error}`).join('\n');
        showAlert('Bulk Update Failed', `The update failed for the following containers:\n\n${msg}`);
      }
      return;
    }
    
    if (action === 'remove' || action === 'stop') {
      const isRemove = action === 'remove';
      const confirmed = await showConfirm(
        isRemove ? 'Remove Containers' : 'Stop Containers',
        isRemove 
          ? `Are you sure you want to permanently remove ${ids.length} containers? This action cannot be undone.`
          : `Are you sure you want to stop ${ids.length} containers?`
      );
      if (!confirmed) return;
    }

    const stateMapping: Record<string, string> = { start: 'starting', stop: 'stopping', restart: 'restarting', remove: 'removing' };
    const loadingState = stateMapping[action] || 'updating';

    const failed: { name: string, error: string }[] = [];
    const targetContainers = containers.filter(c => selectedIds.has(c.ID));

    targetContainers.forEach(c => setContainerState(c.Names, loadingState));

    for (const c of targetContainers) {
      try {
        await apiPost('/api/containers', { envId, containerId: c.ID, action });
      } catch (e: any) {
        console.error(e);
        failed.push({ name: c.Names, error: e.message || String(e) });
      }
    }

    targetContainers.forEach(c => setContainerState(c.Names, null));
    setSelectedIds(new Set());
    fetchContainers();

    if (failed.length > 0) {
      const msg = failed.map(f => `- ${f.name}: ${f.error}`).join('\n');
      showAlert('Bulk Action Failed', `The action failed for the following containers:\n\n${msg}`);
    }
  };

  useEffect(() => {
    localStorage.setItem('containerSortColumn', sortColumn);
    localStorage.setItem('containerSortDirection', sortDirection);
  }, [sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  const [deployConfigOpen, setDeployConfigOpen] = useState(false);
  const [deployConfig, setDeployConfig] = useState({
    composeFilePath: '',
    composeFileContent: '',
    envFilePath: ''
  });

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string) => {
    return new Promise<void>((resolve) => {
      setModalConfig({
        isOpen: true,
        type: 'alert',
        title,
        message,
        onConfirm: () => {
          setModalConfig(null);
          resolve();
        }
      });
    });
  };

  const showConfirm = (title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setModalConfig({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          setModalConfig(null);
          resolve(true);
        },
        onCancel: () => {
          setModalConfig(null);
          resolve(false);
        }
      });
    });
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(currentLogs);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

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

    fetch(`/api/containers?envId=${envId}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch containers');
        }
        if (Array.isArray(data)) {
          setContainers(prev => {
            const nextContainers = [...data];
            const nextNames = new Set(data.map((c: DockerContainer) => c.Names));
            
            for (const p of prev) {
              if (!nextNames.has(p.Names) && granularStatesRef.current[p.Names]) {
                nextContainers.push(p);
              }
            }
            
            nextContainers.sort((a, b) => {
              const projA = a.Project || '';
              const projB = b.Project || '';
              if (projA !== projB) return projA.localeCompare(projB);
              return a.Names.localeCompare(b.Names);
            });
            
            globalCache[envId] = { data: nextContainers };
            
            // Background update checking moved to a separate useEffect
            
            return nextContainers;
          });
          setError(null);
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
    }, 5000);
    return () => clearInterval(intervalId);
  }, [fetchContainers]);

  const checkedImagesRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    containers.forEach(c => {
       if (c.Image && !checkedImagesRef.current.has(c.Image)) {
          checkedImagesRef.current.add(c.Image);
          fetch(`/api/images/check-update?envId=${envId}&image=${encodeURIComponent(c.Image)}`)
            .then(r => r.json())
            .then(res => {
               if (res.updateAvailable) {
                  const localD = res.localDigests?.[0] || 'unknown';
                  const remoteD = res.remoteDigest || 'unknown';
                  setImageUpdates(prev => ({ 
                    ...prev, 
                    [c.Image]: { 
                      available: true, 
                      localDigest: localD.replace('sha256:', '').substring(0, 12),
                      remoteDigest: remoteD.replace('sha256:', '').substring(0, 12)
                    } 
                  }));
               }
            }).catch(() => {});
       }
    });
  }, [containers, envId]);

  // When deployment finishes, automatically refresh the list
  useEffect(() => {
    if (!isDeploying) {
      fetchContainers(false);
    }
  }, [isDeploying, fetchContainers]);

  const setContainerState = (name: string, state: string | null) => {
    setGranularStates(prev => {
      if (state === null) {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      }
      return { ...prev, [name]: state };
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

  const handleAction = async (container: DockerContainer, action: string) => {
    if (action === 'remove' || action === 'stop') {
      const isRemove = action === 'remove';
      const confirmed = await showConfirm(
        isRemove ? 'Remove Container' : 'Stop Container',
        isRemove 
          ? `Are you sure you want to permanently remove "${container.Names}"? This action cannot be undone.`
          : `Are you sure you want to stop "${container.Names}"?`
      );
      if (!confirmed) return;
    }
    const stateMapping: Record<string, string> = { start: 'starting', stop: 'stopping', restart: 'restarting', remove: 'removing' };
    setContainerState(container.Names, stateMapping[action] || 'updating');
    try {
      await apiPost('/api/containers', { envId, containerId: container.ID, action });
      fetchContainers();
    } catch (e) {
      console.error(e);
      showAlert('Action Failed', `${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(container.Names, null);
  };

  const handleDownCompose = async (container: DockerContainer) => {
    if (!container.WorkingDir || !container.Service) return;
    
    const confirmed = await showConfirm(
      'Down Compose Service',
      `Are you sure you want to take down the compose service for "${container.Project || container.Names}"? This will stop and remove all related containers, networks, and volumes defined in the compose file.`
    );
    if (!confirmed) return;

    try {
      setContainerState(container.Names, 'stopping');
      await apiPost('/api/compose', { action: 'stop', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles });
      
      setContainerState(container.Names, 'removing');
      await apiPost('/api/compose', { action: 'rm -f', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles });
      
      fetchContainers();
    } catch (e) {
      console.error(e);
      showAlert('Down Failed', `${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(container.Names, null);
  };

  const handleUpdateCompose = async (container: DockerContainer, skipFetch = false, skipConfirm = false) => {
    if (!container.WorkingDir || !container.Service) return;
    
    if (!skipConfirm) {
      const confirmed = await showConfirm(
        'Update Compose Service',
        `Are you sure you want to pull the latest image and recreate the service "${container.Service}"?`
      );
      if (!confirmed) return;
    }

    try {
      // 1. Stop
      setContainerState(container.Names, 'stopping');
      await apiPost('/api/compose', { action: 'stop', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Stop step failed:\n' + e.message) });
      
      // 2. Remove container
      setContainerState(container.Names, 'removing');
      await apiPost('/api/compose', { action: 'rm -f', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Remove container step failed:\n' + e.message) });

      // 3. Delete the image explicitly
      setContainerState(container.Names, 'cleaning');
      await apiPost('/api/compose', { action: 'rmi', envId, imageName: container.Image }).catch(e => { throw new Error('Remove image step failed:\n' + e.message) });
      
      // 4. Pull
      setContainerState(container.Names, 'pulling');
      await apiPost('/api/compose', { action: 'pull --ignore-pull-failures', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Pull step failed:\n' + e.message) });
      
      // 5. Start
      setContainerState(container.Names, 'starting');
      await apiPost('/api/compose', { action: 'up -d', envId, workingDir: container.WorkingDir, serviceName: container.Service, configFiles: container.ConfigFiles, environmentFiles: container.EnvironmentFiles }).catch(e => { throw new Error('Start step failed:\n' + e.message) });
      
      if (!skipFetch) fetchContainers();
    } catch (e) {
      console.error(e);
      showAlert(`Update Failed for ${container.Names}`, `${e instanceof Error ? e.message : String(e)}`);
    }
    setContainerState(container.Names, null);
  };

  const handleOpenDeployConfig = async () => {
    try {
      const res = await fetch(`/api/environments`);
      const envs = await res.json();
      const currentEnv = envs.find((e: any) => e.id === envId) || env;

      setDeployConfig({
        composeFilePath: currentEnv.composeFilePath || '',
        composeFileContent: currentEnv.composeYaml || '',
        envFilePath: currentEnv.envFilePath || ''
      });
      setDeployConfigOpen(true);
    } catch (e: any) {
      setDeployConfig({
        composeFilePath: env.composeFilePath || '',
        composeFileContent: env.composeYaml || '',
        envFilePath: env.envFilePath || ''
      });
      setDeployConfigOpen(true);
    }
  };

  const handleUpdateAll = async () => {
    if (containers.length === 0) {
      return;
    }

    const composeContainers = containers.filter(c => c.Project && c.Service && c.WorkingDir);
    if (composeContainers.length === 0) {
       showAlert('Info', 'No compose containers found to update.');
       return;
    }
    
    const uniqueProjects = new Map<string, { WorkingDir: string, ConfigFiles?: string, EnvironmentFiles?: string, containerNames: string[] }>();
    for (const c of composeContainers) {
      if (!c.WorkingDir) continue;
      if (!uniqueProjects.has(c.WorkingDir)) {
        uniqueProjects.set(c.WorkingDir, {
          WorkingDir: c.WorkingDir,
          ConfigFiles: c.ConfigFiles,
          EnvironmentFiles: c.EnvironmentFiles,
          containerNames: []
        });
      }
      uniqueProjects.get(c.WorkingDir)!.containerNames.push(c.Names);
    }
    const projects = Array.from(uniqueProjects.values());

    const confirmed = await showConfirm('Update All', `Are you sure you want to update all ${projects.length} compose projects? This will take down all projects, prune system, pull new images, and bring them back up.`);
    if (!confirmed) return;
    
    setUpdatingAll(true);
    setUpdateAllStatus('Initializing update...');
    
    try {
      // 1. Down all projects
      setUpdateAllStatus('Stopping projects...');
      for (const p of projects) {
        p.containerNames.forEach(name => setContainerState(name, 'stopping'));
        await apiPost('/api/compose', { action: 'down', envId, workingDir: p.WorkingDir, configFiles: p.ConfigFiles, environmentFiles: p.EnvironmentFiles });
      }

      // 2. System prune
      setUpdateAllStatus('Pruning old images and containers...');
      projects.forEach(p => p.containerNames.forEach(name => setContainerState(name, 'cleaning')));
      await apiPost('/api/compose', { action: 'system-prune', envId });

      // 3. Pull all projects
      setUpdateAllStatus('Pulling new images (this may take a while)...');
      for (const p of projects) {
        p.containerNames.forEach(name => setContainerState(name, 'pulling'));
        await apiPost('/api/compose', { action: 'pull --ignore-pull-failures', envId, workingDir: p.WorkingDir, configFiles: p.ConfigFiles, environmentFiles: p.EnvironmentFiles });
      }

      // 4. Up all projects
      setUpdateAllStatus('Starting projects...');
      for (const p of projects) {
        p.containerNames.forEach(name => setContainerState(name, 'starting'));
        await apiPost('/api/compose', { action: 'up -d', envId, workingDir: p.WorkingDir, configFiles: p.ConfigFiles, environmentFiles: p.EnvironmentFiles });
      }
    } catch (e) {
      console.error(e);
      showAlert('Update All Failed', `${e instanceof Error ? e.message : String(e)}`);
    }

    projects.forEach(p => p.containerNames.forEach(name => setContainerState(name, null)));
    fetchContainers();
    setUpdatingAll(false);
  };

  const handleViewStats = async (container: DockerContainer) => {
    setSelectedContainerName(container.Names);
    setSelectedContainerId(container.ID);
    setCurrentStats(null);
    setStatsLoading(true);
    setStatsModalOpen(true);
    try {
      const res = await fetch(`/api/containers/stats?envId=${envId}&containerId=${container.ID}`);
      const data = await res.json();
      if (res.ok) setCurrentStats(data);
    } catch (e) {}
    setStatsLoading(false);
  };

  const handleUpdatePolicy = async () => {
     if (!selectedContainerId) return;
     setPolicyModalOpen(false);
     try {
       await apiPost('/api/containers/policy', { envId, containerId: selectedContainerId, policy: selectedPolicy });
       fetchContainers();
       showAlert('Success', 'Restart policy updated successfully.');
     } catch (e: any) {
       showAlert('Error', e.message);
     }
  };

  useEffect(() => {
    if (!statsModalOpen || !selectedContainerId) return;
    let isActive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/containers/stats?envId=${envId}&containerId=${selectedContainerId}`);
        const data = await res.json();
        if (isActive && res.ok) setCurrentStats(data);
      } catch (e) {}
    };
    const intervalId = setInterval(poll, 2000);
    return () => { isActive = false; clearInterval(intervalId); };
  }, [statsModalOpen, selectedContainerId, envId]);

  const handleViewLogs = async (container: DockerContainer) => {
    setSelectedContainerName(container.Names);
    setSelectedContainerId(container.ID);
    setCurrentLogs('');
    setLogsLoading(true);
    setLogsModalOpen(true);
    setExecCommandText('');
    setExecOutput(null);
    setShowExecSection(false);
    setExecHistoryLines([]);
    
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

  const handleExecCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!execCommandText.trim() || !selectedContainerId) return;

    setIsExecuting(true);
    setExecOutput(null);
    const cmd = execCommandText.trim();
    if (commandHistory[commandHistory.length - 1] !== cmd) {
      setCommandHistory(prev => [...prev, cmd]);
    }
    setHistoryIndex(-1);

    try {
      const res = await apiPost('/api/containers/exec', {
        envId,
        containerId: selectedContainerId,
        command: cmd,
      });
      const data = await res.json();
      setExecHistoryLines(prev => [...prev, { cmd, ...data.result }]);
      setExecCommandText('');
      setTimeout(scrollToBottom, 100);
    } catch (err: any) {
      setExecHistoryLines(prev => [...prev, {
        cmd,
        stdout: '',
        stderr: err.message || String(err),
      }]);
      setTimeout(scrollToBottom, 100);
    }
    setIsExecuting(false);
  };

  useEffect(() => {
    if (!logsModalOpen || !selectedContainerId) return;

    let isActive = true;

    const pollLogs = async () => {
      try {
        const res = await fetch(`/api/logs?envId=${envId}&containerId=${selectedContainerId}`);
        const data = await res.json();
        if (isActive && res.ok && data.logs) {
           setCurrentLogs(data.logs);
        }
      } catch (e) {
        // silently ignore polling errors
      }
    };

    const intervalId = setInterval(pollLogs, 3000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [logsModalOpen, selectedContainerId, envId]);

  if (loading && containers.length === 0) return <div className={styles.loading}>Loading containers...</div>;

  const sortedContainers = [...containers].sort((a, b) => {
    let valA = '';
    let valB = '';
    
    switch (sortColumn) {
      case 'name':
        valA = a.Names;
        valB = b.Names;
        break;
      case 'state':
        valA = granularStates[a.Names] || a.State;
        valB = granularStates[b.Names] || b.State;
        break;
      case 'image':
        valA = a.Image;
        valB = b.Image;
        break;
      case 'composeProject':
        valA = a.Project || '';
        valB = b.Project || '';
        break;
    }
    
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

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
      

      { (isDeploying || updatingAll) && (
        <div className={styles.deployOverlay}>
          <div className={styles.deployOverlayContent}>
            <div className={styles.spinner}></div>
            <h2>{isDeploying ? 'Deploying Compose Stack...' : 'Updating Environments...'}</h2>
            <p>{isDeploying ? 'Your containers are being updated. This may take a few moments as we pull images and recreate services.' : (updateAllStatus || 'Working...')}</p>
          </div>
        </div>
      )}

      <div className={styles.panelHeader}>
        <h3>Containers</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>

          <button 
            className="glass-button" 
            onClick={handleUpdateAll} 
            disabled={updatingAll || containers.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={16} className={updatingAll ? styles.spin : ''} /> 
            {updatingAll ? 'Updating...' : 'Update All'}
          </button>
          <button className="glass-button" onClick={() => fetchContainers(true)} disabled={updatingAll}>
            Refresh
          </button>
        </div>
      </div>
      
      <div className={`${styles.tableContainer} ${styles.desktopTable}`}>
        {(() => {
          if (selectedIds.size === 0) return null;
          const hasSelectedCompose = containers.some(c => selectedIds.has(c.ID) && c.Project && c.Service && c.WorkingDir);
          const hasAvailableUpdates = containers.some(c => selectedIds.has(c.ID) && c.Project && c.Service && c.WorkingDir && imageUpdates[c.Image]?.available);
          return (
            <div className={styles.desktopBulkActionBar}>
              <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {selectedIds.size} selected
              </div>
              <div className={styles.bulkActions}>
                {hasSelectedCompose && (
                  <button 
                    title="Update Selected Compose Services" 
                    className={`${styles.actionBtn} ${styles.primary}`} 
                    onClick={() => handleBulkAction('update')} 
                    disabled={updatingAll}
                  >
                    {hasAvailableUpdates && (
                      <span>
                        <AlertCircle color="var(--success)" size={16} style={{ marginRight: 4 }} />
                      </span>
                    )}
                    <RefreshCw size={16} />
                  </button>
                )}
                <button title="Start Selected" className={styles.actionBtn} onClick={() => handleBulkAction('start')} disabled={updatingAll}>
                  <Play size={16} />
                </button>
                <button title="Stop Selected" className={styles.actionBtn} onClick={() => handleBulkAction('stop')} disabled={updatingAll}>
                  <Square size={16} />
                </button>
                <button title="Restart Selected" className={styles.actionBtn} onClick={() => handleBulkAction('restart')} disabled={updatingAll}>
                  <RotateCcw size={16} />
                </button>
                <button title="Remove Selected" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleBulkAction('remove')} disabled={updatingAll}>
                  <Trash2 size={16} />
                </button>
                <button title="Clear Selection" className={styles.closeBtn} onClick={() => setSelectedIds(new Set())} style={{ marginLeft: '0.5rem' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
          );
        })()}
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <label className={styles.customCheckbox} title="Select All Visible">
                  <input 
                    type="checkbox" 
                    checked={sortedContainers.length > 0 && selectedIds.size === sortedContainers.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(sortedContainers.map(c => c.ID)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                  <span className={styles.checkmark}></span>
                </label>
              </th>
              <th className={styles.nameColumn} onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Name {sortColumn === 'name' && (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('state')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  State {sortColumn === 'state' && (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('image')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Image {sortColumn === 'image' && (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('composeProject')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Compose Project {sortColumn === 'composeProject' && (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </div>
              </th>
              <th className={styles.actionsColumn}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedContainers.map(c => {
              const granularState = granularStates[c.Names];
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
                <tr key={c.Names} className={isLoading ? styles.loadingRow : ''}>
                  <td>
                    <label className={styles.customCheckbox}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(c.ID)}
                        onChange={(e) => {
                          const newSet = new Set(selectedIds);
                          if (e.target.checked) newSet.add(c.ID);
                          else newSet.delete(c.ID);
                          setSelectedIds(newSet);
                        }}
                      />
                      <span className={styles.checkmark}></span>
                    </label>
                  </td>
                  <td className={styles.nameColumn}>
                    <div className={styles.nameCell}>
                      <strong>{c.Names}</strong>
                    <span className={styles.idText}>{c.ID.substring(0, 12)}</span>
                    {(() => {
                      if (!c.Ports) return null;
                      const ip = env.type === 'local' ? 'localhost' : (env.host || 'localhost');
                      const parts = c.Ports.split(', ');
                      const publishedPorts: { hostPort: string, fullPart: string }[] = [];
                      for (const part of parts) {
                        if (part.includes('->')) {
                          const [hostPart] = part.split('->');
                          const hostIpAndPort = hostPart.split(':');
                          const hostPort = hostIpAndPort[hostIpAndPort.length - 1];
                          if (!publishedPorts.find(p => p.hostPort === hostPort)) {
                            publishedPorts.push({ hostPort, fullPart: part });
                          }
                        }
                      }
                      if (publishedPorts.length === 0) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                          {publishedPorts.map(p => (
                            <a 
                              key={p.hostPort} 
                              href={`http://${ip}:${p.hostPort}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={styles.portLink}
                              title={p.fullPart}
                            >
                              {p.hostPort}
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                    </div>
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
                  <td className={styles.actionsColumn}>
                    <div className={styles.actions}>
                      {isRunning ? (
                        <button title="Stop" className={styles.actionBtn} onClick={() => handleAction(c, 'stop')} disabled={isLoading}>
                          <Square size={16} />
                        </button>
                      ) : (
                        <button title="Start" className={styles.actionBtn} onClick={() => handleAction(c, 'start')} disabled={isLoading}>
                          <Play size={16} />
                        </button>
                      )}
                      
                      <button title="Restart" className={styles.actionBtn} onClick={() => handleAction(c, 'restart')} disabled={isLoading}>
                        <RotateCcw size={16} />
                      </button>
                      
                      <button title="Remove" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleAction(c, 'remove')} disabled={isLoading}>
                        <Trash2 size={16} />
                      </button>
                      
                      <button title="View Logs" className={styles.actionBtn} onClick={() => handleViewLogs(c)} disabled={isLoading}>
                        <FileText size={16} />
                      </button>
                      <button title="View Stats" className={styles.actionBtn} onClick={() => handleViewStats(c)} disabled={isLoading}>
                        <Activity size={16} />
                      </button>
                      <button title="Change Restart Policy" className={styles.actionBtn} onClick={() => {
                         setSelectedContainerId(c.ID);
                         setSelectedContainerName(c.Names);
                         setSelectedPolicy(c.RestartPolicy || 'unless-stopped');
                         setPolicyModalOpen(true);
                      }} disabled={isLoading}>
                        <Settings size={16} />
                      </button>
                      

                      {isCompose && (
                        <>
                          <button 
                            title="Update Service (Stops, removes container, prunes image, pulls new image, and starts service)" 
                            className={`${styles.actionBtn} ${styles.primary}`} 
                            onClick={() => handleUpdateCompose(c)} 
                            disabled={isLoading}
                          >
                            {imageUpdates[c.Image]?.available && (
                              <span>
                                <AlertCircle color="var(--success)" size={16} style={{ marginRight: 4 }} />
                              </span>
                            )}
                            <RefreshCw size={16} /> <span className={styles.hideMobileText}>Update</span>
                          </button>
                          <button 
                            title="Down Compose Service" 
                            className={`${styles.actionBtn} ${styles.warning}`} 
                            onClick={() => handleDownCompose(c)} 
                            disabled={isLoading}
                          >
                            <ShieldAlert size={16} /> <span className={styles.hideMobileText}>Down Service</span>
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

      <div className={styles.mobileCards}>
        <div className={styles.mobileSortBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label className={styles.customCheckbox} title="Select All Visible">
              <input 
                type="checkbox" 
                checked={sortedContainers.length > 0 && selectedIds.size === sortedContainers.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(sortedContainers.map(c => c.ID)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              />
              <span className={styles.checkmark}></span>
            </label>
            <span className={styles.muted}>Sort by:</span>
          </div>
          <div className={styles.sortChips}>
            {(['name', 'state', 'image', 'composeProject'] as SortColumn[]).map(col => (
              <button 
                key={col}
                className={`${styles.sortChip} ${sortColumn === col ? styles.activeSortChip : ''}`}
                onClick={() => handleSort(col)}
              >
                {col === 'name' ? 'Name' : col === 'state' ? 'State' : col === 'image' ? 'Image' : 'Project'}
                {sortColumn === col && (
                  <span className={styles.sortIcon}>
                    {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          if (selectedIds.size === 0) return null;
          const hasSelectedCompose = containers.some(c => selectedIds.has(c.ID) && c.Project && c.Service && c.WorkingDir);
          const hasAvailableUpdates = containers.some(c => selectedIds.has(c.ID) && c.Project && c.Service && c.WorkingDir && imageUpdates[c.Image]?.available);
          return (
            <div className={styles.bulkActionBar}>
              <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {selectedIds.size} selected
              </div>
              <div className={styles.bulkActions}>
                {hasSelectedCompose && (
                  <button 
                    title="Update Selected Compose Services" 
                    className={`${styles.actionBtn} ${styles.primary}`} 
                    onClick={() => handleBulkAction('update')} 
                    disabled={updatingAll}
                  >
                    {hasAvailableUpdates && (
                      <span>
                        <AlertCircle color="var(--success)" size={16} style={{ marginRight: 4 }} />
                      </span>
                    )}
                    <RefreshCw size={16} />
                  </button>
                )}
                <button title="Start Selected" className={styles.actionBtn} onClick={() => handleBulkAction('start')} disabled={updatingAll}>
                  <Play size={16} />
              </button>
              <button title="Stop Selected" className={styles.actionBtn} onClick={() => handleBulkAction('stop')} disabled={updatingAll}>
                <Square size={16} />
              </button>
              <button title="Restart Selected" className={styles.actionBtn} onClick={() => handleBulkAction('restart')} disabled={updatingAll}>
                <RotateCcw size={16} />
              </button>
              <button title="Remove Selected" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleBulkAction('remove')} disabled={updatingAll}>
                <Trash2 size={16} />
              </button>
              <button title="Clear Selection" className={styles.closeBtn} onClick={() => setSelectedIds(new Set())} style={{ marginLeft: '0.5rem' }}>
                <X size={18} />
              </button>
            </div>
          </div>
        );
      })()}

        {sortedContainers.map(c => {
          const granularState = granularStates[c.Names];
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
            <div key={c.Names} className={`${styles.containerCard} ${isLoading ? styles.loadingRow : ''}`}>
              <div className={styles.cardTopRow}>
                <label className={styles.customCheckbox} style={{ flexShrink: 0, marginRight: '0.25rem' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(c.ID)}
                    onChange={(e) => {
                      const newSet = new Set(selectedIds);
                      if (e.target.checked) newSet.add(c.ID);
                      else newSet.delete(c.ID);
                      setSelectedIds(newSet);
                    }}
                  />
                  <span className={styles.checkmark}></span>
                </label>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.Names}</strong>
                  <span className={styles.idText}>{c.ID.substring(0, 12)}</span>
                </div>
              </div>
              
              <div className={styles.labeledRow}>
                <span className={styles.muted}>State:</span>
                <span className={`badge ${badgeClass}`} style={{ flexShrink: 0 }}>
                  {displayState}
                </span>
              </div>

              <div className={styles.labeledRow}>
                <span className={styles.muted}>Image:</span>
                <span>{c.Image}</span>
              </div>

              {isCompose && (
                <div className={styles.composeInfo}>
                  <div className={styles.labeledRow}>
                    <span className={styles.muted}>Project:</span>
                    <span className={styles.projectText}>{c.Project}</span>
                  </div>
                  <div className={styles.labeledRow}>
                    <span className={styles.muted}>Service:</span>
                    <span className={styles.serviceText}>{c.Service}</span>
                  </div>
                </div>
              )}

              {c.Status && c.Status.startsWith('Up ') && (
                <div className={styles.labeledRow}>
                  <span className={styles.muted}>Uptime:</span>
                  <span className={styles.uptimeText} style={{ marginLeft: 0 }}>
                    {c.Status.substring(3)}
                  </span>
                </div>
              )}

              {(() => {
                if (!c.Ports) return null;
                const ip = env.type === 'local' ? 'localhost' : (env.host || 'localhost');
                const parts = c.Ports.split(', ');
                const publishedPorts: { hostPort: string, fullPart: string }[] = [];
                for (const part of parts) {
                  if (part.includes('->')) {
                    const [hostPart] = part.split('->');
                    const hostIpAndPort = hostPart.split(':');
                    const hostPort = hostIpAndPort[hostIpAndPort.length - 1];
                    if (!publishedPorts.find(p => p.hostPort === hostPort)) {
                      publishedPorts.push({ hostPort, fullPart: part });
                    }
                  }
                }
                if (publishedPorts.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {publishedPorts.map(p => (
                      <a 
                        key={p.hostPort} 
                        href={`http://${ip}:${p.hostPort}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.portLink}
                        title={p.fullPart}
                      >
                        {p.hostPort}
                      </a>
                    ))}
                  </div>
                );
              })()}

              <div className={styles.cardActions}>
                {isRunning ? (
                  <button title="Stop" className={styles.actionBtn} onClick={() => handleAction(c, 'stop')} disabled={isLoading}>
                    <Square size={16} />
                  </button>
                ) : (
                  <button title="Start" className={styles.actionBtn} onClick={() => handleAction(c, 'start')} disabled={isLoading}>
                    <Play size={16} />
                  </button>
                )}
                
                <button title="Restart" className={styles.actionBtn} onClick={() => handleAction(c, 'restart')} disabled={isLoading}>
                  <RotateCcw size={16} />
                </button>
                
                <button title="Remove" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleAction(c, 'remove')} disabled={isLoading}>
                  <Trash2 size={16} />
                </button>
                
                <button title="View Logs" className={styles.actionBtn} onClick={() => handleViewLogs(c)} disabled={isLoading}>
                  <FileText size={16} />
                </button>
                <button title="View Stats" className={styles.actionBtn} onClick={() => handleViewStats(c)} disabled={isLoading}>
                  <Activity size={16} />
                </button>
                <button title="Change Restart Policy" className={styles.actionBtn} onClick={() => {
                   setSelectedContainerId(c.ID);
                   setSelectedContainerName(c.Names);
                   setSelectedPolicy(c.RestartPolicy || 'unless-stopped');
                   setPolicyModalOpen(true);
                }} disabled={isLoading}>
                  <Settings size={16} />
                </button>

                {isCompose && (
                  <>
                    <button 
                      title="Update Service" 
                      className={`${styles.actionBtn} ${styles.primary}`} 
                      onClick={() => handleUpdateCompose(c)} 
                      disabled={isLoading}
                    >
                      {imageUpdates[c.Image]?.available && (
                        <span>
                          <AlertCircle color="var(--success)" size={16} style={{ marginRight: 4 }} />
                        </span>
                      )}
                      <RefreshCw size={16} /> <span className={styles.hideMobileText}>Update</span>
                    </button>
                    <button 
                      title="Down Compose Service" 
                      className={`${styles.actionBtn} ${styles.warning}`} 
                      onClick={() => handleDownCompose(c)} 
                      disabled={isLoading}
                    >
                      <ShieldAlert size={16} /> <span className={styles.hideMobileText}>Down Service</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
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
                <button title="Execute Command" className={`${styles.actionBtn} ${showExecSection ? styles.active : ''}`} onClick={() => {
                  setShowExecSection(prev => {
                    const next = !prev;
                    if (next) {
                      setTimeout(() => {
                        scrollToBottom();
                        execInputRef.current?.focus();
                      }, 100);
                    }
                    return next;
                  });
                }}>
                  <Terminal size={18} />
                </button>
                <button title="Export Logs" className={styles.actionBtn} onClick={handleExportLogs}>
                  <Download size={18} />
                </button>
                <button title="Copy Logs" className={styles.actionBtn} onClick={handleCopyLogs}>
                  <Copy size={18} />
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
                <>
                  <pre className={styles.logsPre} ref={logsContainerRef}>
                    {currentLogs || 'No logs available.'}
                    {execHistoryLines.map((run, i) => (
                      <div key={i} style={{ marginTop: i === 0 && !currentLogs ? '0' : '1rem' }}>
                        <div style={{ color: '#00bcd4', fontWeight: 'bold' }}>$ {run.cmd}</div>
                        {run.stdout && <div style={{ color: '#00bcd4' }}>{run.stdout}</div>}
                        {run.stderr && <div style={{ color: '#f44336' }}>{run.stderr}</div>}
                        {run.code !== 0 && run.code !== undefined && <div style={{ color: '#f44336' }}>[Exit code: {run.code}]</div>}
                      </div>
                    ))}
                  </pre>
                  
                  {showExecSection && (
                    <div className={styles.execSection} style={{ marginTop: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <form onSubmit={handleExecCommand} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                          ref={execInputRef}
                          type="text" 
                          className={styles.execInput} 
                          placeholder="e.g. ls -la /app" 
                          value={execCommandText}
                          onChange={e => setExecCommandText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (commandHistory.length > 0) {
                                const nextIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                                setHistoryIndex(nextIndex);
                                setExecCommandText(commandHistory[commandHistory.length - 1 - nextIndex]);
                              }
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (historyIndex > 0) {
                                const nextIndex = historyIndex - 1;
                                setHistoryIndex(nextIndex);
                                setExecCommandText(commandHistory[commandHistory.length - 1 - nextIndex]);
                              } else if (historyIndex === 0) {
                                setHistoryIndex(-1);
                                setExecCommandText('');
                              }
                            }
                          }}
                          disabled={isExecuting}
                        />
                        <button type="submit" className={styles.execButton} disabled={isExecuting || !execCommandText.trim()}>
                          {isExecuting ? 'Running...' : 'Run'}
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {statsModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setStatsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className={styles.modalHeader}>
              <h3>Stats: {selectedContainerName}</h3>
              <button className={styles.closeBtn} onClick={() => setStatsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              {statsLoading && !currentStats ? (
                <div className={styles.loading}>Fetching stats...</div>
              ) : currentStats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                    <h4>CPU Usage</h4>
                    <p style={{ fontSize: '1.5rem', marginTop: '0.5rem', color: 'var(--accent-color)' }}>{currentStats.CPUPerc}</p>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                    <h4>Memory Usage</h4>
                    <p style={{ fontSize: '1.5rem', marginTop: '0.5rem', color: 'var(--accent-color)' }}>{currentStats.MemUsage} ({currentStats.MemPerc})</p>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                    <h4>Network I/O</h4>
                    <p style={{ fontSize: '1.5rem', marginTop: '0.5rem', color: 'var(--accent-color)' }}>{currentStats.NetIO}</p>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                    <h4>Block I/O</h4>
                    <p style={{ fontSize: '1.5rem', marginTop: '0.5rem', color: 'var(--accent-color)' }}>{currentStats.BlockIO}</p>
                  </div>
                </div>
              ) : (
                <p>No stats available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {policyModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setPolicyModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className={styles.modalHeader}>
              <h3>Restart Policy</h3>
              <button className={styles.closeBtn} onClick={() => setPolicyModalOpen(false)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: '1rem' }}>Set the restart policy for <strong>{selectedContainerName}</strong>:</p>
              <select 
                className={styles.input} 
                value={selectedPolicy} 
                onChange={(e) => setSelectedPolicy(e.target.value)}
                style={{ 
                  width: '100%', 
                  marginBottom: '1.5rem', 
                  backgroundColor: 'transparent', 
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-glass)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="no" style={{ background: '#171717' }}>No</option>
                <option value="always" style={{ background: '#171717' }}>Always</option>
                <option value="unless-stopped" style={{ background: '#171717' }}>Unless Stopped</option>
                <option value="on-failure" style={{ background: '#171717' }}>On Failure</option>
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="glass-button" onClick={() => setPolicyModalOpen(false)}>Cancel</button>
                <button className={`glass-button ${styles.primary}`} onClick={handleUpdatePolicy}>Save Policy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deployConfigOpen && (
        <div className={styles.modalOverlay} onClick={() => setDeployConfigOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <h3>Deploy Compose Stack</h3>
              <button className={styles.closeBtn} onClick={() => setDeployConfigOpen(false)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Compose File</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" readOnly value={deployConfig.composeFilePath || 'None Selected'} className={styles.input} style={{ flex: 1, backgroundColor: 'var(--bg-secondary)' }} />
                  <button className="glass-button" onClick={() => { setBrowserTarget('compose'); setRemoteBrowserOpen(true); }}>Browse</button>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Environment File (.env) (Optional)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" readOnly value={deployConfig.envFilePath || 'Auto-detected'} className={styles.input} style={{ flex: 1, backgroundColor: 'var(--bg-secondary)' }} />
                  <button className="glass-button" onClick={() => { setBrowserTarget('env'); setRemoteBrowserOpen(true); }}>Browse</button>
                </div>
                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  Docker Compose will automatically detect a .env file located in the same directory as the Compose file. Use this if your .env file is located elsewhere or is not detected automatically.
                </small>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button className="glass-button" onClick={() => setDeployConfigOpen(false)}>Cancel</button>
                <button 
                  className={`glass-button ${styles.primary}`} 
                  disabled={!deployConfig.composeFilePath}
                  onClick={async () => {
                    setDeployConfigOpen(false);
                    setUpdatingAll(true);
                    setUpdateAllStatus('Pulling and deploying selected configuration...');
                    try {
                      await apiPost('/api/compose/deploy', { 
                        envId, 
                        yamlContent: deployConfig.composeFileContent,
                        composeFilePath: deployConfig.composeFilePath,
                        envFilePath: deployConfig.envFilePath || undefined
                      });
                      showAlert('Success', 'Successfully deployed compose project.');
                    } catch (error: any) {
                      showAlert('Deploy Failed', error.message);
                    }
                    fetchContainers();
                    setUpdatingAll(false);
                  }}
                >Deploy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {remoteBrowserOpen && (
        <RemoteFileBrowser 
          envId={envId}
          allowedExtensions={browserTarget === 'compose' ? ['.yml', '.yaml'] : ['.env']}
          onClose={() => setRemoteBrowserOpen(false)}
          onFileSelect={async (content: string, filePath?: string) => {
            setRemoteBrowserOpen(false);
            if (browserTarget === 'compose') {
              setDeployConfig(prev => ({ ...prev, composeFilePath: filePath || '', composeFileContent: content }));
            } else {
              setDeployConfig(prev => ({ ...prev, envFilePath: filePath || '' }));
            }
          }}
        />
      )}

      {modalConfig && <CustomModal {...modalConfig} />}
    </div>
  );
}
