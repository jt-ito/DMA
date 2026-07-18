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
}

export async function getContainers(env: Environment): Promise<DockerContainer[]> {
  const { stdout } = await executeCommand(env, 'docker', ['ps', '-a', '--format', '{{json .}}']);
  
  const lines = stdout.trim().split('\n').filter(line => line.length > 0);
  const containers: DockerContainer[] = lines.map(line => JSON.parse(line));
  
  if (containers.length === 0) return [];
  
  const containerIds = containers.map(c => c.ID);
  
  try {
    const { stdout: inspectOut } = await executeCommand(env, 'docker', ['inspect', '--format={{json .Config.Labels}}---{{json .State.StartedAt}}', ...containerIds]);
    const inspectLines = inspectOut.trim().split('\n').filter(line => line.length > 0);
    
    for (let i = 0; i < containers.length; i++) {
       if (inspectLines[i]) {
           const parts = inspectLines[i].split('---');
           if (parts[0] && parts[0] !== 'null') {
               try {
                   const labels = JSON.parse(parts[0]);
                   containers[i].Project = labels['com.docker.compose.project'] || null;
                   containers[i].Service = labels['com.docker.compose.service'] || null;
                   containers[i].WorkingDir = labels['com.docker.compose.project.working_dir'] || null;
                   containers[i].ConfigFiles = labels['com.docker.compose.project.config_files'] || null;
                   containers[i].EnvironmentFiles = labels['com.docker.compose.project.environment_file'] || null;
               } catch(e) {}
           }
           if (parts[1] && parts[1] !== 'null') {
               try { containers[i].StartedAt = JSON.parse(parts[1]); } catch(e) {}
           }
       }
    }
  } catch (e) {
    console.warn("Failed to inspect containers for labels:", e);
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
    const { stdout, stderr } = await executeCommand(env, 'docker', ['logs', '--timestamps', '--tail', '200', id]);
    return stdout + (stderr ? '\n' + stderr : '');
  } catch (e: any) {
    return e.message || String(e);
  }
}

export async function deployCompose(env: Environment, yamlContent: string, composeFilePath?: string, pruneImages?: boolean): Promise<void> {
  if (composeFilePath) {
    const isWindows = composeFilePath.includes('\\');
    const separator = isWindows ? '\\' : '/';
    const dir = composeFilePath.substring(0, composeFilePath.lastIndexOf(separator));
    
    if (pruneImages) {
      await composeCommand(env, 'down --rmi all', dir, undefined, composeFilePath);
    }
    
    if (env.type === 'local') {
      const fs = await import('fs');
      fs.writeFileSync(composeFilePath, yamlContent);
    } else {
      // For remote we still need to stream the content into a file using shell
      const delimiter = 'EOF_DOCKER_MANAGER_' + Date.now();
      await executeCommand(env, `cat << '${delimiter}' > "${composeFilePath}"\n${yamlContent}\n${delimiter}`);
    }
    
    await composeCommand(env, 'pull', dir, undefined, composeFilePath);
    await composeCommand(env, 'up -d --remove-orphans', dir, undefined, composeFilePath);
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
