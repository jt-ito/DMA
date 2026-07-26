import fs from 'fs';
import path from 'path';
import os from 'os';
import { Environment } from './executor';

const dataDir = path.join(os.homedir(), '.docker-manager');
const dataFile = path.join(dataDir, 'environments.json');

export function getEnvironments(): Environment[] {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    const defaultEnvs: Environment[] = [{ id: 'local', name: 'Local Machine', type: 'local' }];
    fs.writeFileSync(dataFile, JSON.stringify(defaultEnvs, null, 2));
    return defaultEnvs;
  }
  const data = fs.readFileSync(dataFile, 'utf-8');
  return JSON.parse(data);
}

export function saveEnvironment(env: Environment) {
  const envs = getEnvironments();
  const index = envs.findIndex(e => e.id === env.id);
  if (index >= 0) {
    envs[index] = env;
  } else {
    envs.push(env);
  }
  fs.writeFileSync(dataFile, JSON.stringify(envs, null, 2));
}

export function deleteEnvironment(id: string) {
  if (id === 'local') return; // Cannot delete local
  let envs = getEnvironments();
  envs = envs.filter(e => e.id !== id);
  fs.writeFileSync(dataFile, JSON.stringify(envs, null, 2));
}

export function getEnvironment(id: string): Environment | undefined {
  return getEnvironments().find(e => e.id === id);
}
