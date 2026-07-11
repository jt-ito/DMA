const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running npm run build...');
execSync('npm run build', { stdio: 'inherit' });

console.log('Copying public directory...');
if (fs.existsSync('public')) {
  fs.cpSync('public', path.join('.next', 'standalone', 'public'), { recursive: true });
}

console.log('Copying .next/static directory...');
if (fs.existsSync(path.join('.next', 'static'))) {
  fs.cpSync(path.join('.next', 'static'), path.join('.next', 'standalone', '.next', 'static'), { recursive: true });
}

console.log('Copying start.js...');
fs.copyFileSync('start.js', path.join('.next', 'standalone', 'start.js'));

console.log('Checking for node.exe in standalone...');
if (!fs.existsSync(path.join('.next', 'standalone', 'node.exe'))) {
  console.log('Downloading node.exe (v20.10.0) for packaging...');
  execSync('curl -s -L -o .next/standalone/node.exe https://nodejs.org/dist/v20.10.0/win-x64/node.exe', { stdio: 'inherit' });
}

console.log('Build preparation complete.');
