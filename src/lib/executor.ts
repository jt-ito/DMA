import { NodeSSH } from 'node-ssh';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface Environment {
  id: string;
  name: string;
  type: 'local' | 'remote';
  host?: string;
  username?: string;
  password?: string;
  privateKey?: string;
  composeYaml?: string;
  composeFilePath?: string;
  pruneImagesOnDeploy?: boolean;
  disabled?: boolean;
}

export async function executeCommand(env: Environment, command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  if (env.type === 'local') {
    return execAsync(command, { cwd });
  } else {
    const ssh = new NodeSSH();
    await ssh.connect({
      host: env.host,
      username: env.username,
      password: env.password,
      privateKey: env.privateKey,
    });
    
    // node-ssh's cwd option can be flaky with spaces/special characters
    // We manually prepend cd "${cwd}" && to ensure it executes correctly
    const finalCommand = cwd ? `cd "${cwd}" && ${command}` : command;
    const result = await ssh.execCommand(finalCommand);
    ssh.dispose();
    
    if (result.code !== 0 && result.stderr) {
       throw new Error(result.stderr);
    }
    
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
}
