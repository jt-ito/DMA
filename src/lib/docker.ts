import { executeCommand, Environment } from './executor';

export interface DockerContainer {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Labels?: string;
  Project?: string;
  Service?: string;
  WorkingDir?: string;
  ConfigFiles?: string;
  EnvironmentFiles?: string;
  StartedAt?: string;
  HealthStatus?: string | null;
  RestartPolicy?: string | null;
}

export async function getContainers(env: Environment): Promise<DockerContainer[]> {
  const { stdout } = await executeCommand(env, 'docker', ['ps', '-a', '--format', '{{json .}}']);
  
  const lines = stdout.trim().split('\n').filter(line => line.length > 0);
  const containers: DockerContainer[] = lines.map(line => JSON.parse(line));
  
  if (containers.length === 0) return [];
  
  const containerIds = containers.map(c => c.ID);
  
  let inspectOut = '';
  try {
    const res = await executeCommand(env, 'docker', ['inspect', '--format={{.Id}}---{{json .Config.Labels}}---{{json .State}}---{{json .HostConfig.RestartPolicy.Name}}', ...containerIds]);
    inspectOut = res.stdout;
  } catch (e: any) {
    inspectOut = e.stdout || '';
    const errMsg = e.stderr?.trim() || e.message || String(e);
    console.warn(`Partial failure inspecting containers: ${errMsg}`);
  }

  const inspectLines = inspectOut.trim().split('\n').filter(line => line.length > 0);
  
  const inspectMap: Record<string, { labels: any, state: any, restartPolicy: any }> = {};
  for (const line of inspectLines) {
    const parts = line.split('---');
    if (parts.length >= 3) {
      const id = parts[0];
      let labels = {};
      let state: any = {};
      let restartPolicy = null;
      try { if (parts[1] && parts[1] !== 'null') labels = JSON.parse(parts[1]); } catch(e) {}
      try { if (parts[2] && parts[2] !== 'null') state = JSON.parse(parts[2]); } catch(e) {}
      try { if (parts[3] && parts[3] !== 'null') restartPolicy = JSON.parse(parts[3]); } catch(e) {}
      inspectMap[id] = { labels, state, restartPolicy };
    }
  }

  for (let i = 0; i < containers.length; i++) {
     const c = containers[i];
     const dataKey = Object.keys(inspectMap).find(k => k.startsWith(c.ID));
     const data = dataKey ? inspectMap[dataKey] : null;
     if (data) {
         c.Project = data.labels['com.docker.compose.project'] || null;
         c.Service = data.labels['com.docker.compose.service'] || null;
         c.WorkingDir = data.labels['com.docker.compose.project.working_dir'] || null;
         c.ConfigFiles = data.labels['com.docker.compose.project.config_files'] || null;
         c.EnvironmentFiles = data.labels['com.docker.compose.project.environment_file'] || null;
         c.StartedAt = data.state?.StartedAt || null;
         c.HealthStatus = data.state?.Health?.Status || null;
         c.RestartPolicy = data.restartPolicy;
     }
  }
  
  return containers;
}

export async function manageContainer(env: Environment, id: string, action: 'start' | 'stop' | 'restart' | 'remove'): Promise<void> {
  const args = action === 'remove' ? ['rm', '-f', id] : [action, id];
  await executeCommand(env, 'docker', args);
}

export async function composeCommand(env: Environment, actionCommand: string, workingDir: string, serviceName?: string, configFiles?: string, environmentFiles?: string): Promise<void> {
  const args = ['compose'];
  
  if (configFiles) {
    args.push('-f', configFiles.split(',')[0]);
  }

  if (environmentFiles) {
    args.push('--env-file', environmentFiles.split(',')[0]);
  } else {
    const isWindows = workingDir.includes('\\');
    const separator = isWindows ? '\\' : '/';
    
    try {
      const checkFile = async (filename: string) => {
        const fullPath = `${workingDir}${separator}${filename}`;
        if (env.type === 'local') {
          // Use Node's own fs — no shell needed and cross-platform
          const { existsSync } = await import('fs');
          return existsSync(fullPath);
        } else {
          // Remote: use POSIX shell
          const { stdout } = await executeCommand(env, `if [ -f "${fullPath}" ]; then echo yes; fi`);
          return stdout.trim() === 'yes';
        }
      };

      if (await checkFile('docker-compose.env')) {
        args.push('--env-file', `${workingDir}${separator}docker-compose.env`);
      } else if (await checkFile('.env')) {
        args.push('--env-file', `${workingDir}${separator}.env`);
      } else if (await checkFile('stack.env')) {
        args.push('--env-file', `${workingDir}${separator}stack.env`);
      }
    } catch (e) {
      console.warn("Failed to check for env files", e);
    }
  }

  // actionCommand might be 'up -d' which is multiple args
  args.push(...actionCommand.split(' '));

  if (serviceName) {
    args.push(serviceName);
  }

  await executeCommand(env, 'docker', args, workingDir);
}

export async function pruneImages(env: Environment): Promise<void> {
  try {
    await executeCommand(env, 'docker', ['image', 'prune', '-f']);
  } catch (e) {
    console.warn("Failed to prune images after update", e);
  }
}

export async function systemPrune(env: Environment): Promise<void> {
  try {
    await executeCommand(env, 'docker', ['system', 'prune', '-a', '-f']);
  } catch (e) {
    console.warn("Failed to system prune", e);
  }
}

export async function removeImage(env: Environment, image: string): Promise<void> {
  try {
    await executeCommand(env, 'docker', ['rmi', '-f', image]);
  } catch (e) {
    console.warn(`Failed to remove image ${image}`, e);
  }
}

export async function getContainerLogs(env: Environment, id: string): Promise<string> {
  try {
    // Increased tail to 1000 and added --details for verbosity
    const { stdout, stderr } = await executeCommand(env, 'docker', ['logs', '--timestamps', '--tail', '1000', '--details', id]);
    
    // Split into lines, combine, and sort chronologically based on the docker timestamp prefix
    const outLines = stdout.split('\n').filter(l => l.trim().length > 0);
    const errLines = stderr.split('\n').filter(l => l.trim().length > 0);
    const allLines = [...outLines, ...errLines];
    
    allLines.sort((a, b) => {
      const timeA = a.substring(0, a.indexOf(' '));
      const timeB = b.substring(0, b.indexOf(' '));
      return timeA.localeCompare(timeB);
    });
    
    return allLines.join('\n');
  } catch (e: any) {
    return e.message || String(e);
  }
}

export async function deployCompose(env: Environment, yamlContent: string, composeFilePath?: string, pruneImages?: boolean, envFilePath?: string): Promise<void> {
  if (composeFilePath) {
    const isWindows = composeFilePath.includes('\\');
    const separator = isWindows ? '\\' : '/';
    const dir = composeFilePath.substring(0, composeFilePath.lastIndexOf(separator));
    
    if (pruneImages) {
      await composeCommand(env, 'down --rmi all', dir, undefined, composeFilePath, envFilePath);
    }
    
    if (env.type === 'local') {
      const fs = await import('fs');
      fs.writeFileSync(composeFilePath, yamlContent);
    } else {
      // For remote we still need to stream the content into a file using shell
      const delimiter = 'EOF_DOCKER_MANAGER_' + Date.now();
      await executeCommand(env, `cat << '${delimiter}' > "${composeFilePath}"\n${yamlContent}\n${delimiter}`);
    }
    
    await composeCommand(env, 'pull -q --ignore-pull-failures', dir, undefined, composeFilePath, envFilePath);
    await composeCommand(env, 'up -d --quiet-pull --remove-orphans', dir, undefined, composeFilePath, envFilePath);
  } else {
    const tempFileName = `docker-compose-temp-${Date.now()}.yml`;
    if (env.type === 'local') {
      const fs = await import('fs');
      const path = await import('path');
      const tempPath = path.join(process.cwd(), tempFileName);
      fs.writeFileSync(tempPath, yamlContent);
      try {
        await executeCommand(env, 'docker', ['compose', '-f', tempFileName, 'up', '-d'], process.cwd());
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    } else {
      const delimiter = 'EOF_DOCKER_MANAGER_' + Date.now();
      const command = `cat << '${delimiter}' > ${tempFileName}\n${yamlContent}\n${delimiter}\ndocker compose -f ${tempFileName} up -d && rm ${tempFileName}`;
      await executeCommand(env, command);
    }
  }
}

export async function getContainerStats(env: Environment, id: string): Promise<any> {
  const { stdout } = await executeCommand(env, 'docker', ['stats', '--no-stream', '--format', '{{json .}}', id]);
  if (!stdout.trim()) {
    throw new Error('No stats available');
  }
  return JSON.parse(stdout.trim().split('\n')[0]);
}

export async function getLocalImageDigest(env: Environment, imageName: string): Promise<string[]> {
  try {
    const { stdout } = await executeCommand(env, 'docker', ['inspect', '--format', '{{json .RepoDigests}}', imageName]);
    if (stdout.trim() && stdout.trim() !== 'null') {
      return JSON.parse(stdout.trim());
    }
  } catch (e) {
    // Image might not exist or error inspecting
  }
  return [];
}
export async function updateRestartPolicy(env: Environment, id: string, policy: string): Promise<void> {
  await executeCommand(env, 'docker', ['update', '--restart', policy, id]);
}
