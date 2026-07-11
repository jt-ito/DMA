const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execSync } = require('child_process');

const configDir = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), '.docker-manager');
const envPath = path.join(configDir, '.env');

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function loadEnv() {
  if (fs.existsSync(envPath)) {
    console.log(`[DMA] Loading environment from ${envPath}`);
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
        else if (value.startsWith("'") && value.endsWith("'")) value = value.replace(/^'|'$/g, '');
        process.env[match[1]] = value;
      }
    });
    return process.env.JWT_SECRET && process.env.ADMIN_PASSWORD_HASH;
  }
  return false;
}

async function firstTimeSetup() {
  ensureConfigDir();
  console.log('\n=============================================');
  console.log('🐳 Welcome to Docker Manager App (DMA)');
  console.log('=============================================\n');
  console.log('It looks like this is your first time starting DMA.');
  console.log('Let\'s set up your secure administrator credentials.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const askPassword = () => new Promise(resolve => {
    rl.question('Create an Admin Password (for user "admin"): ', (answer) => {
      if (answer.length < 4) {
        console.log('Password must be at least 4 characters.\n');
        resolve(askPassword());
      } else {
        resolve(answer);
      }
    });
  });

  const password = await askPassword();
  rl.close();

  console.log('\nGenerating secure secrets... Please wait.');
  
  const bcrypt = require('bcrypt');
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  
  const jwtSecret = crypto.randomBytes(32).toString('base64');
  
  const envContent = `ADMIN_PASSWORD_HASH="${hash}"\nJWT_SECRET="${jwtSecret}"\n`;
  fs.writeFileSync(envPath, envContent, { mode: 0o600 });
  
  console.log('\n✅ Setup complete! Your settings are securely saved in: ' + envPath);
  console.log('Starting server...\n');
  
  process.env.ADMIN_PASSWORD_HASH = hash;
  process.env.JWT_SECRET = jwtSecret;
}

function killPort3000() {
  try {
    if (process.platform === 'win32') {
      const output = execSync('netstat -ano', { encoding: 'utf8' });
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(':3000') && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            console.log(`[DMA] Killing process ${pid} on port 3000...`);
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
          }
        }
      }
    } else {
      try {
        const pids = execSync('lsof -t -i:3000', { encoding: 'utf8' }).trim().split('\n');
        for (const pid of pids) {
          if (pid) {
            console.log(`[DMA] Killing process ${pid} on port 3000...`);
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          }
        }
      } catch (e) {
        // lsof exits with 1 if nothing is found
      }
    }
  } catch (e) {
    console.error('[DMA] Warning: Failed to clear port 3000.', e.message);
  }
}

async function main() {
  const isLoaded = loadEnv();
  
  if (!isLoaded) {
    try {
      await firstTimeSetup();
    } catch (e) {
      console.error('Failed to complete setup:', e);
      process.exit(1);
    }
  }

  process.env.PORT = process.env.PORT || 3000;
  process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
  process.env.NODE_ENV = 'production';

  if (process.env.PORT === '3000' || process.env.PORT === 3000) {
    killPort3000();
  }

  console.log(`[DMA] Server is running on http://localhost:${process.env.PORT}`);

  require('./server.js');
}

main();
