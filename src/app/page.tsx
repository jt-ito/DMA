"use client";

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ContainerList } from '@/components/ContainerList';
import { ComposeEditor } from '@/components/ComposeEditor';
import { TemplateLibrary } from '@/components/TemplateLibrary';
import { CustomModal } from '@/components/CustomModal';
import { Environment } from '@/lib/executor';
import styles from './page.module.css';

export default function Home() {
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [activeTab, setActiveTab] = useState<'containers' | 'compose' | 'templates'>('containers');
  const [isDeploying, setIsDeploying] = useState(false);
  
  // Public IP state
  const [isPullingIp, setIsPullingIp] = useState(false);

  // Custom Modal state
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'info';
    title: string;
    message: string;
    copyText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string, type: 'alert' | 'confirm' | 'info' = 'alert', copyText?: string) => {
    return new Promise<void>((resolve) => {
      setModalConfig({
        isOpen: true,
        type,
        title,
        message,
        copyText,
        onConfirm: () => {
          setModalConfig(null);
          resolve();
        }
      });
    });
  };

  // Update local state when selected env changes
  const handleSelectEnv = (env: Environment | null) => {
    setSelectedEnv(env);
  };


  return (
    <div className={styles.container}>
      <Sidebar onSelectEnv={handleSelectEnv} selectedEnvId={selectedEnv?.id || null} />
      
      <main className={styles.main}>
        {selectedEnv ? (
          <>
            <header className={styles.header}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1>{selectedEnv.name}</h1>
                  <p className={styles.subtitle}>Manage your containers and compose services</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button 
                    className="glass-button" 
                    onClick={async () => {
                      setIsPullingIp(true);
                      try {
                        const res = await fetch(`/api/environments/ip?id=${selectedEnv.id}`);
                        const data = await res.json();
                        if (res.ok && data.ip) {
                          await showAlert('Public IP Address', `Public IP for ${selectedEnv.name}: ${data.ip}`, 'info', data.ip);
                        } else {
                          await showAlert('Error', data.error || 'Failed to pull IP');
                        }
                      } catch (e) {
                        await showAlert('Error', 'Failed to pull IP');
                      }
                      setIsPullingIp(false);
                    }}
                    disabled={isPullingIp}
                  >
                    {isPullingIp ? 'Pulling...' : 'Get Public IP'}
                  </button>
                </div>
              </div>
            </header>
            
            {selectedEnv.disabled ? (
              <div className={styles.emptyState}>
                <h2>This environment is disabled.</h2>
                <p>Enable it in the sidebar to manage containers.</p>
              </div>
            ) : (
              <>
                <div className={styles.tabs}>
                  <button 
                    className={`${styles.tabBtn} ${activeTab === 'containers' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('containers')}
                  >
                    Containers
                  </button>
                  <button 
                    className={`${styles.tabBtn} ${activeTab === 'compose' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('compose')}
                  >
                    Compose Editor
                  </button>
                  <button 
                    className={`${styles.tabBtn} ${activeTab === 'templates' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('templates')}
                  >
                    App Store
                  </button>
                </div>
                
                <div className={styles.content}>
                  <div style={{ display: activeTab === 'containers' ? 'block' : 'none', flex: 1, height: '100%' }}>
                    <ContainerList key={`containers-${selectedEnv.id}`} envId={selectedEnv.id} env={selectedEnv} isDeploying={isDeploying} />
                  </div>
                  <div style={{ display: activeTab === 'compose' ? 'block' : 'none', flex: 1, height: '100%' }}>
                    <ComposeEditor 
                      key={`compose-${selectedEnv.id}`} 
                      envId={selectedEnv.id} 
                      onDeployStart={() => {
                        setIsDeploying(true);
                        setActiveTab('containers');
                      }}
                      onDeployEnd={(success) => {
                        setIsDeploying(false);
                        if (!success) {
                          setActiveTab('compose');
                        }
                      }}
                    />
                  </div>
                  <div style={{ display: activeTab === 'templates' ? 'block' : 'none', flex: 1, height: '100%' }}>
                    <TemplateLibrary 
                      key={`templates-${selectedEnv.id}`} 
                      envId={selectedEnv.id} 
                      onDeployStart={() => {
                        setIsDeploying(true);
                        setActiveTab('containers');
                      }}
                      onDeployEnd={(success) => {
                        setIsDeploying(false);
                        if (!success) {
                          setActiveTab('templates');
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <h2>Select an environment to begin</h2>
          </div>
        )}
      </main>
      
      {modalConfig && <CustomModal {...modalConfig} />}
    </div>
  );
}
