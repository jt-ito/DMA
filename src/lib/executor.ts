import { NodeSSH } from 'node-ssh';
import { exec, execFile } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

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
  envFilePath?: string;
  pruneImagesOnDeploy?: boolean;
  disabled?: boolean;
}

function escapeShellArg(arg: string) {
  // Safe single-quoting for bash: 'arg' with inner single quotes escaped as '\''
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function executeCommand(env: Environment, command: string, args?: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  if (env.type === 'local') {
    if (args) {
      return execFileAsync(command, args, { cwd, maxBuffer: 1024 * 1024 * 50 });
    } else {
      // Fallback for debug endpoint or complex bash pipes
      return execAsync(command, { cwd, maxBuffer: 1024 * 1024 * 50 });
    }
  } else {
    const ssh = new NodeSSH();
    await ssh.connect({
      host: env.host,
      username: env.username,
      password: env.password,
      privateKey: env.privateKey,
    });
    
    let finalCommand = command;
    if (args) {
      finalCommand = `${command} ${args.map(escapeShellArg).join(' ')}`;
    }
    
    if (cwd) {
      finalCommand = `cd ${escapeShellArg(cwd)} && ${finalCommand}`;
    }
    
    const result = await ssh.execCommand(finalCommand);
    ssh.dispose();
    
    if (result.code !== 0) {
       const err: any = new Error(result.stderr || `Command failed with code ${result.code}`);
       err.stdout = result.stdout;
       err.stderr = result.stderr;
       err.code = result.code;
       throw err;
    }
    
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
}
