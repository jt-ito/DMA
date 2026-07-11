const { execSync } = require('child_process');
const fs = require('fs');

async function main() {
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  // Ensure next static assets are copied to standalone
  if (!fs.existsSync('.next/standalone/public') && fs.existsSync('public')) {
    execSync('xcopy /E /I /Y public .next\\standalone\\public\\', { stdio: 'inherit' });
  }
  if (!fs.existsSync('.next/standalone/.next/static') && fs.existsSync('.next/static')) {
    execSync('xcopy /E /I /Y .next\\static .next\\standalone\\.next\\static\\', { stdio: 'inherit' });
  }

  // Copy start.js to standalone directory for caxa
  fs.copyFileSync('start.js', '.next/standalone/start.js');

  console.log('Building CLI executables with caxa...');
  const targets = [
    { name: 'docker-manager-cli-win.exe', platform: 'win64' },
    { name: 'docker-manager-cli-mac', platform: 'mac' },
    { name: 'docker-manager-cli-linux', platform: 'linux' }
  ];

  for (const target of targets) {
    console.log(`Building ${target.name}...`);
    try {
      execSync(`npx caxa -i ".next/standalone" -m "${target.platform}" -o "dist/${target.name}" -- "{{caxa}}/node" "{{caxa}}/start.js"`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed to build ${target.name}`);
    }
  }
  console.log('Done!');
}

main();
