"use client";

import { useEffect, useState } from 'react';
import { Server, Plus, Sun, Moon, LogOut, Power, PowerOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './Sidebar.module.css';
import { Environment } from '@/lib/executor';
import { AddEnvironmentModal } from './AddEnvironmentModal';

interface SidebarProps {
  onSelectEnv: (env: Environment | null) => void;
  selectedEnvId: string | null;
}

export function Sidebar({ onSelectEnv, selectedEnvId }: SidebarProps) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  useEffect(() => {
    fetch('/api/environments')
      .then(res => res.json())
      .then(data => {
        setEnvironments(data);
        if (data.length > 0) {
          const savedId = localStorage.getItem('selectedEnvId');
          let targetEnv = data[0];
          if (savedId) {
            const found = data.find((e: Environment) => e.id === savedId);
            if (found) targetEnv = found;
          }
          onSelectEnv(targetEnv);
          localStorage.setItem('selectedEnvId', targetEnv.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDisable = async (e: React.MouseEvent, env: Environment) => {
    e.stopPropagation(); // prevent selecting the env
    const updatedEnv = { ...env, disabled: !env.disabled };
    try {
      await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEnv),
      });
      // Update local state
      const newEnvs = environments.map(e => e.id === env.id ? updatedEnv : e);
      setEnvironments(newEnvs);
      if (selectedEnvId === env.id) {
        onSelectEnv(updatedEnv);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Environments</h2>
        <button className={styles.iconButton} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      
      <ul className={styles.envList}>
        {environments.map(env => (
          <li 
            key={env.id} 
            className={`${styles.envItem} ${selectedEnvId === env.id ? styles.active : ''} ${env.disabled ? styles.disabled : ''}`}
            onClick={() => {
              localStorage.setItem('selectedEnvId', env.id);
              onSelectEnv(env);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <Server size={18} />
              <span>{env.name}</span>
            </div>
            <button 
              className={styles.disableBtn}
              onClick={(e) => toggleDisable(e, env)}
              title={env.disabled ? "Enable Environment" : "Disable Environment"}
            >
              {env.disabled ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
          </li>
        ))}
      </ul>
      
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button className={styles.addButton} onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Add Remote
        </button>
        <button className={styles.addButton} onClick={handleLogout} style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <LogOut size={18} /> Logout
        </button>
      </div>

      <AddEnvironmentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAdded={(env) => {
          setEnvironments([...environments, env]);
          localStorage.setItem('selectedEnvId', env.id);
          onSelectEnv(env);
        }} 
      />
    </div>
  );
}
