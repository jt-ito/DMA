"use client";

import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './AddEnvironmentModal.module.css';
import { Environment } from '@/lib/executor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (env: Environment) => void;
}

export function AddEnvironmentModal({ isOpen, onClose, onAdded }: Props) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const env: Environment = {
      id,
      name,
      type: 'remote',
      host,
      username,
      password: password || undefined,
      privateKey: privateKey || undefined,
    };

    try {
      const res = await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add environment');
      
      onAdded(env);
      onClose();
      // Reset form
      setName('');
      setHost('');
      setUsername('');
      setPassword('');
      setPrivateKey('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={`glass-panel ${styles.modal}`}>
        <div className={styles.header}>
          <h2>Add Remote Environment</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>
        
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label>Environment Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production Server" />
          </div>
          
          <div className={styles.formGroup}>
            <label>Host / IP Address</label>
            <input required value={host} onChange={e => setHost(e.target.value)} placeholder="e.g. 192.168.1.100" />
          </div>
          
          <div className={styles.formGroup}>
            <label>SSH Username</label>
            <input required value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. root" />
          </div>
          
          <div className={styles.formGroup}>
            <label>SSH Password (Optional)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          </div>
          
          <div className={styles.formGroup}>
            <label>SSH Private Key (Optional)</label>
            <textarea 
              value={privateKey} 
              onChange={e => setPrivateKey(e.target.value)} 
              placeholder="-----BEGIN RSA PRIVATE KEY-----..." 
              rows={4}
            />
          </div>
          
          <div className={styles.actions}>
            <button type="button" className="glass-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="glass-button" style={{background: 'var(--accent)', color: 'white'}} disabled={loading}>
              {loading ? 'Adding...' : 'Add Environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
