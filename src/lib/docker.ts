import { executeCommand, Environment } from './executor';

export interface DockerContainer {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Labels?: string;
  Project?: string; // from com.docker.compose.project label
  Service?: string; // from com.docker.compose.service label
  WorkingDir?: string; // from com.docker.compose.project.working_dir label
  ConfigFiles?: string; // from com.docker.compose.project.config_files label
  EnvironmentFiles?: string; // from com.docker.compose.project.environment_file label
}

export async function getContainers(env: Environment): Promise<DockerContainer[]> {
  // We use format '{{json .}}' to get JSON output per line.
  // We need all containers so `docker ps -a`
  const { stdout } = await executeCommand(env, 'docker ps -a --format "{{json .}}"');
  
  // Docker output might be multiple JSON objects separated by newlines
  const lines = stdout.trim().split('\n').filter(line => line.length > 0);
  
  // Parse basic container info
  const containers: DockerContainer[] = lines.map(line => JSON.parse(line));
  
  // To get labels like compose project/service, we need docker inspect
  // If there are no containers, return early
  if (containers.length === 0) return [];
  
  const containerIds = containers.map(c => c.ID).join(' ');
  const inspectCmd = `docker inspect --format="{{json .Config.Labels}}" ${containerIds}`;
  
  try {
    const { stdout: inspectOut } = await executeCommand(env, inspectCmd);
    const inspectLines = inspectOut.trim().split('\n').filter(line => line.length > 0);
    
    // Merge labels
    for (let i = 0; i < containers.length; i++) {
       if (inspectLines[i] && inspectLines[i] !== 'null') {
           const labels = JSON.parse(inspectLines[i]);
           containers[i].Project = labels['com.docker.compose.project'] || null;
           containers[i].Service = labels['com.docker.compose.service'] || null;
           containers[i].WorkingDir = labels['com.docker.compose.project.working_dir'] || null;
           containers[i].ConfigFiles = labels['com.docker.compose.project.config_files'] || null;
           containers[i].EnvironmentFiles = labels['com.docker.compose.project.environment_file'] || null;
       }
    }
  } catch (e) {
    // If inspect fails, we just return basic info
    console.warn("Failed to inspect containers for labels:", e);
  }
  
  return containers;
}

export async function manageContainer(env: Environment, id: string, action: 'start' | 'stop' | 'restart' | 'remove'): Promise<void> {
  const cmd = action === 'remove' ? `docker rm -f ${id}` : `docker ${action} ${id}`;
  await executeCommand(env, cmd);
}

export async function composeCommand(env: Environment, command: string, workingDir: string, serviceName?: string, configFiles?: string, environmentFiles?: string): Promise<void> {
  const serviceArg = serviceName ? ` ${serviceName}` : '';
  
  // Intelligently detect environment files (Portainer uses stack.env)
  let envArg = '';
  
  // If the container has an explicit environment file label, use it
  if (environmentFiles) {
    envArg = `--env-file ${environmentFiles.split(',')[0]} `;
  } else {
    // Build absolute path string based on platform
    const isWindows = workingDir.includes('\\');
    const separator = isWindows ? '\\' : '/';
    
    try {
      const checkFile = async (filename: string) => {
        const cmd = env.type === 'local' ? `if exist "${filename}" echo yes` : `if [ -f "${filename}" ]; then echo yes; fi`;
        const { stdout } = await executeCommand(env, cmd, workingDir);
        return stdout.trim() === 'yes';
      };

      if (await checkFile('docker-compose.env')) {
        envArg = `--env-file "${workingDir}${separator}docker-compose.env" `;
      } else if (await checkFile('.env')) {
        envArg = `--env-file "${workingDir}${separator}.env" `;
      } else if (await checkFile('stack.env')) {
        envArg = `--env-file "${workingDir}${separator}stack.env" `;
      }
    } catch (e) {
      console.warn("Failed to check for env files", e);
    }
  } // end of else

  let fileArg = '';
  if (configFiles) {
    // Pass explicit compose file to perfectly match original startup!
    fileArg = `-f ${configFiles.split(',')[0]} `;
  }

  await executeCommand(env, `docker compose ${fileArg}${envArg}${command}${serviceArg}`, workingDir);
}

export async function pruneImages(env: Environment): Promise<void> {
  try {
    await executeCommand(env, `docker image prune -f`);
  } catch (e) {
    console.warn("Failed to prune images after update", e);
  }
}

export async function removeImage(env: Environment, image: string): Promise<void> {
  try {
    await executeCommand(env, `docker rmi -f ${image}`);
  } catch (e) {
    console.warn(`Failed to remove image ${image}`, e);
  }
}

export async function getContainerLogs(env: Environment, id: string): Promise<string> {
  try {
    const { stdout, stderr } = await executeCommand(env, `docker logs --tail 200 ${id}`);
    // Combine stdout and stderr as docker logs outputs to both
    return stdout + (stderr ? '\n' + stderr : '');
  } catch (e: any) {
    // If it fails (e.g. command fails and throws stderr), return that
    return e.message || String(e);
  }
}

export async function deployCompose(env: Environment, yamlContent: string, composeFilePath?: string, pruneImages?: boolean): Promise<void> {
  if (composeFilePath) {
    // Determine working directory from the file path
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
      const delimiter = 'EOF_DOCKER_MANAGER_' + Date.now();
      await executeCommand(env, `cat << '${delimiter}' > "${composeFilePath}"\n${yamlContent}\n${delimiter}`);
    }
    
    // Deploy using our intelligent composeCommand so it loads stack.env and runs in the right dir!
    await composeCommand(env, 'pull', dir, undefined, composeFilePath);
    await composeCommand(env, 'up -d --remove-orphans', dir, undefined, composeFilePath);
  } else {
    // Legacy sandbox deployment
    const tempFileName = `docker-compose-temp-${Date.now()}.yml`;
    if (env.type === 'local') {
      const fs = await import('fs');
      const path = await import('path');
      const tempPath = path.join(process.cwd(), tempFileName);
      fs.writeFileSync(tempPath, yamlContent);
      try {
        await executeCommand(env, `docker compose -f ${tempFileName} up -d`, process.cwd());
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
