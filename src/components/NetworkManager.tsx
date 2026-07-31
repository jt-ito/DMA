"use client";

import { useState, useEffect } from 'react';
import { Network, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import yaml from 'yaml';
import { CustomModal } from './CustomModal';
import styles from './NetworkManager.module.css';

interface Props {
  envId: string;
}

export function NetworkManager({ envId }: Props) {
  const [dockerNetworks, setDockerNetworks] = useState<any[]>([]);
  const [composeNetworks, setComposeNetworks] = useState<string[]>([]);
  const [creatingNetwork, setCreatingNetwork] = useState<string | null>(null);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [loading, setLoading] = useState(true);

  const [sortColumn, setSortColumn] = useState<'Name' | 'Driver' | 'Scope'>('Name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'info';
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

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

  const handleSort = (col: 'Name' | 'Driver' | 'Scope') => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const handleDelete = async (net: any) => {
    const id = net.ID || net.Id || net.Name;
    const confirmed = await showConfirm(
      'Remove Network',
      `Are you sure you want to remove the network "${net.Name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/networks?envId=${envId}&nameOrId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await fetchNetworks();
    } catch (e) {
      console.error("Failed to delete network", e);
    }
  };

  const sortedNetworks = [...dockerNetworks].sort((a, b) => {
    const valA = a[sortColumn] || '';
    const valB = b[sortColumn] || '';
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/networks?envId=${envId}`);
      const data = await res.json();
      if (data.networks) {
        setDockerNetworks(data.networks);
      }
    } catch (e) {
      console.error("Failed to fetch networks", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNetworks();

    const fetchEnv = async () => {
      try {
        const res = await fetch(`/api/environments`);
        const data = await res.json();
        const env = data.find((e: any) => e.id === envId);
        if (env) {
          let yamlContent = env.composeYaml || '';
          if (env.composeFilePath) {
            try {
              const fileRes = await fetch('/api/fs/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ envId, path: env.composeFilePath })
              });
              const fileData = await fileRes.json();
              if (fileRes.ok && fileData.content) {
                yamlContent = fileData.content;
              }
            } catch(e) {}
          }
          if (yamlContent) {
            const parsed = yaml.parse(yamlContent);
            if (parsed && parsed.networks) {
              setComposeNetworks(Object.keys(parsed.networks));
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse env for networks", e);
      }
    };
    fetchEnv();
  }, [envId]);

  const handleCreateNetwork = async (name: string) => {
    if (!name.trim()) return;
    setCreatingNetwork(name);
    try {
      await fetch('/api/networks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envId, name })
      });
      setNewNetworkName('');
      await fetchNetworks();
    } catch (e) {
      console.error("Failed to create network", e);
    }
    setCreatingNetwork(null);
  };

  return (
    <div className={`glass-panel ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Network size={24} />
          <h3 style={{ margin: 0 }}>Network Operations</h3>
        </div>
        <p className={styles.subtitle}>Manage Docker networks in your environment.</p>
      </div>

      <div className={styles.createSection}>
        <input 
          type="text" 
          value={newNetworkName}
          onChange={(e) => setNewNetworkName(e.target.value)}
          placeholder="New network name"
          className="glass-input"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', flex: 1 }}
        />
        <button 
          className="glass-button" 
          style={{ background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          onClick={() => handleCreateNetwork(newNetworkName)}
          disabled={!newNetworkName.trim() || creatingNetwork === newNetworkName}
        >
          <Plus size={16} /> {creatingNetwork === newNetworkName ? 'Creating...' : 'Create Network'}
        </button>
      </div>

      {composeNetworks.length > 0 && (
        <div style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Networks required by Compose</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {composeNetworks.map(net => {
              const exists = dockerNetworks.some(dn => dn.Name === net);
              return (
                <div key={net} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                  <span style={{ fontFamily: 'monospace' }}>{net}</span>
                  {exists ? (
                    <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 500 }}>Exists</span>
                  ) : (
                    <button 
                      className="glass-button" 
                      style={{ background: 'var(--primary)', color: 'white', padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() => handleCreateNetwork(net)}
                      disabled={creatingNetwork === net}
                    >
                      {creatingNetwork === net ? 'Creating...' : 'Create'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.networkList}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading networks...</p>
        ) : dockerNetworks.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No networks found.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.nameColumn} onClick={() => handleSort('Name')} style={{ cursor: 'pointer' }}>
                  Name {sortColumn === 'Name' && (sortDirection === 'asc' ? <ArrowUp size={12} style={{display:'inline'}}/> : <ArrowDown size={12} style={{display:'inline'}}/>)}
                </th>
                <th onClick={() => handleSort('Driver')} style={{ cursor: 'pointer' }}>
                  Driver {sortColumn === 'Driver' && (sortDirection === 'asc' ? <ArrowUp size={12} style={{display:'inline'}}/> : <ArrowDown size={12} style={{display:'inline'}}/>)}
                </th>
                <th onClick={() => handleSort('Scope')} style={{ cursor: 'pointer' }}>
                  Scope {sortColumn === 'Scope' && (sortDirection === 'asc' ? <ArrowUp size={12} style={{display:'inline'}}/> : <ArrowDown size={12} style={{display:'inline'}}/>)}
                </th>
                <th className={styles.actionsColumn} style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedNetworks.map(net => (
                <tr key={net.Name || net.ID || net.Id}>
                  <td className={styles.nameColumn} style={{ fontFamily: 'monospace' }}>{net.Name}</td>
                  <td>{net.Driver}</td>
                  <td>{net.Scope}</td>
                  <td className={styles.actionsColumn}>
                    <button 
                      className={`${styles.actionBtn} ${styles.danger}`} 
                      onClick={() => handleDelete(net)}
                      title="Remove Network"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modalConfig && <CustomModal {...modalConfig} />}
    </div>
  );
}
