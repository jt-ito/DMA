const fs = require('fs');
const { execSync } = require('child_process');

if (!fs.existsSync('.next/standalone/public')) {
  if (process.platform === 'win32') {
    execSync('xcopy /E /I /Y public .next\\standalone\\public\\');
  } else {
    execSync('cp -r public .next/standalone/public');
  }
}

if (!fs.existsSync('.next/standalone/.next/static')) {
  if (process.platform === 'win32') {
    execSync('xcopy /E /I /Y .next\\static .next\\standalone\\.next\\static\\');
  } else {
    execSync('cp -r .next/static .next/standalone/.next/static');
  }
}

fs.copyFileSync('start.js', '.next/standalone/start.js');
