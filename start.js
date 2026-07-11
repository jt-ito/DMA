const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

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

  console.log(`[DMA] Server is running on http://localhost:${process.env.PORT}`);

  require('./server.js');
}

main();
