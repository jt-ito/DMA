"use client";

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ContainerList } from '@/components/ContainerList';
import { ComposeEditor } from '@/components/ComposeEditor';
import { Environment } from '@/lib/executor';
import styles from './page.module.css';

export default function Home() {
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [activeTab, setActiveTab] = useState<'containers' | 'compose'>('containers');
  const [isDeploying, setIsDeploying] = useState(false);

  return (
    <div className={styles.container}>
      <Sidebar onSelectEnv={setSelectedEnv} selectedEnvId={selectedEnv?.id || null} />
      
      <main className={styles.main}>
        {selectedEnv ? (
          <>
            <header className={styles.header}>
              <h1>{selectedEnv.name}</h1>
              <p className={styles.subtitle}>Manage your containers and compose services</p>
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
                </div>
                
                <div className={styles.content}>
                  <div style={{ display: activeTab === 'containers' ? 'block' : 'none', flex: 1, height: '100%' }}>
                    <ContainerList key={`containers-${selectedEnv.id}`} envId={selectedEnv.id} isDeploying={isDeploying} />
                  </div>
                  <div style={{ display: activeTab === 'compose' ? 'block' : 'none', flex: 1, height: '100%' }}>
                    <ComposeEditor 
                      key={`compose-${selectedEnv.id}`} 
                      envId={selectedEnv.id} 
                      onDeployStart={() => {
                        setIsDeploying(true);
                        setActiveTab('containers');
                      }}
                      onDeployEnd={() => setIsDeploying(false)}
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
    </div>
  );
}
