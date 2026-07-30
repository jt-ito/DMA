"use client";

import { useState } from 'react';
import templates from '@/lib/templates.json';
import styles from './TemplateLibrary.module.css';
import { X, Play } from 'lucide-react';
import { RemoteFileBrowser } from './RemoteFileBrowser';

interface Props {
  envId: string;
  onDeployStart?: () => void;
  onDeployEnd?: (success: boolean) => void;
}

export function TemplateLibrary({ envId, onDeployStart, onDeployEnd }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [deployDir, setDeployDir] = useState<string>('');
  const [envContent, setEnvContent] = useState<string>('');
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setEnvContent(template.defaultEnv || '');
  };

  const handleDeploy = async () => {
    if (!deployDir) {
      alert('Please select or enter a deployment directory.');
      return;
    }
    setDeploying(true);
    if (onDeployStart) onDeployStart();

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envId,
          action: 'up -d',
          workingDir: deployDir,
          composeFileContent: selectedTemplate.defaultCompose,
          envFileContent: envContent
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Deployment failed');
      }
      
      alert('Template deployed successfully!');
      if (onDeployEnd) onDeployEnd(true);
      setSelectedTemplate(null);
    } catch (e: any) {
      alert('Error deploying template: ' + e.message);
      if (onDeployEnd) onDeployEnd(false);
    }
    setDeploying(false);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '1rem' }}>
      <h2>Template Library</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        One-click deployment of popular self-hosted applications.
      </p>

      <div className={styles.libraryGrid}>
        {templates.map((tpl) => (
          <div key={tpl.id} className={styles.templateCard} onClick={() => handleSelectTemplate(tpl)}>
            <div className={styles.cardHeader}>
              <div className={styles.iconContainer}>
                {tpl.iconUrl && <img src={tpl.iconUrl} alt={tpl.name} />}
              </div>
              <h3>{tpl.name}</h3>
            </div>
            <p className={styles.description}>{tpl.description}</p>
            <button className="glass-button" style={{ marginTop: 'auto' }}>
              Select Template
            </button>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTemplate(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Deploy {selectedTemplate.name}</h3>
              <button className={styles.closeBtn} onClick={() => setSelectedTemplate(null)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.inputGroup}>
                <label>Deployment Directory</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ flex: 1 }}
                    value={deployDir}
                    onChange={(e) => setDeployDir(e.target.value)}
                    placeholder="/opt/docker/app"
                  />
                  <button className="glass-button" onClick={() => setRemoteBrowserOpen(true)}>
                    Browse
                  </button>
                </div>
                <small style={{ color: 'var(--text-secondary)' }}>The directory where the docker-compose.yml will be saved.</small>
              </div>

              {selectedTemplate.defaultEnv !== undefined && (
                <div className={styles.inputGroup}>
                  <label>Environment Variables (.env)</label>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    value={envContent}
                    onChange={(e) => setEnvContent(e.target.value)}
                    placeholder="KEY=VALUE"
                  />
                  <small style={{ color: 'var(--text-secondary)' }}>These variables will be injected during deployment.</small>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className="glass-button" onClick={() => setSelectedTemplate(null)}>Cancel</button>
              <button 
                className="glass-button" 
                style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying ? 'Deploying...' : <><Play size={16} style={{ marginRight: '6px' }} /> Deploy</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {remoteBrowserOpen && (
        <RemoteFileBrowser
          envId={envId}
          mode="directory"
          onDirSelect={(path) => {
            setDeployDir(path);
            setRemoteBrowserOpen(false);
          }}
          onClose={() => setRemoteBrowserOpen(false)}
        />
      )}
    </div>
  );
}
