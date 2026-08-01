"use client";

import { useEffect, useRef } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Environment } from '@/lib/executor';
import { DockerContainer } from '@/lib/docker';

export function BackgroundWatcher() {
  const previousStates = useRef<Record<string, DockerContainer>>({});

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();

    const checkEnvironments = async () => {
      if (!isActive) return;
      try {
        // Fetch all environments
        const envRes = await fetch('/api/environments', { signal: abortController.signal });
        if (!envRes.ok) return;
        const environments: Environment[] = await envRes.json();

        // Only check enabled environments
        const activeEnvs = environments.filter(env => !env.disabled);

        for (const env of activeEnvs) {
          if (!isActive) break;

          try {
            const containerRes = await fetch(`/api/containers?envId=${env.id}`, { signal: abortController.signal });
            if (!containerRes.ok) continue;
            const containers: DockerContainer[] = await containerRes.json();

            containers.forEach(container => {
              const prev = previousStates.current[container.ID];
              
              if (prev) {
                // Check for crash (running -> exited/dead/stopped unexpectedly)
                const wasRunning = prev.State === 'running';
                const isStopped = container.State === 'exited' || container.State === 'dead';
                
                // Check for unhealthy status
                const wasHealthyOrStarting = prev.Status?.includes('healthy') || prev.Status?.includes('starting');
                const isUnhealthy = container.Status?.includes('unhealthy');

                if (wasRunning && isStopped) {
                  fireNotification(
                    'Container Crashed!', 
                    `The container "${container.Names}" in environment "${env.name}" has unexpectedly stopped.`
                  );
                } else if (wasHealthyOrStarting && isUnhealthy) {
                  fireNotification(
                    'Container Unhealthy!', 
                    `The container "${container.Names}" in environment "${env.name}" is now reporting as unhealthy.`
                  );
                }
              }

              // Update previous state
              previousStates.current[container.ID] = container;
            });
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            if (err.name === 'TypeError' && err.message === 'Failed to fetch') return;
            console.error(`Error polling containers for env ${env.name}:`, err);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') return;
        console.error('Error in background watcher:', err);
      }
    };

    const fireNotification = async (title: string, body: string) => {
      try {
        if (!('__TAURI__' in window)) {
           // Fallback to browser notification if run without Tauri, mostly for dev
           if (Notification.permission === 'granted') {
             new Notification(title, { body });
           } else if (Notification.permission !== 'denied') {
             const permission = await Notification.requestPermission();
             if (permission === 'granted') new Notification(title, { body });
           }
           return;
        }

        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
          sendNotification({ title, body });
        }
      } catch (e) {
        console.error('Failed to send notification:', e);
      }
    };

    // Poll every 10 seconds
    const interval = setInterval(checkEnvironments, 10000);
    // Initial check (won't fire notifications since previousStates is empty, but populates it)
    checkEnvironments();

    return () => {
      isActive = false;
      abortController.abort();
      clearInterval(interval);
    };
  }, []);

  return null; // This component renders nothing
}
