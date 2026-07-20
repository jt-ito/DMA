const fs = require('fs');

let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['build:standalone'] = `node -e "const fs=require('fs');const {execSync}=require('child_process');if(!fs.existsSync('.next/standalone/public')){if(process.platform==='win32')execSync('xcopy /E /I /Y public .next\\\\standalone\\\\public\\\\');else execSync('cp -r public .next/standalone/public');}if(!fs.existsSync('.next/standalone/.next/static')){if(process.platform==='win32')execSync('xcopy /E /I /Y .next\\\\static .next\\\\standalone\\\\.next\\\\static\\\\');else execSync('cp -r .next/static .next/standalone/.next/static');}fs.copyFileSync('start.js','.next/standalone/start.js');"`;
pkg.scripts['build:frontend'] = 'npm run build && npm run build:standalone';
pkg.version = '1.0.11';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

let tc = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tc.build.beforeBuildCommand = 'npm run build:frontend';
tc.version = '1.0.11';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tc, null, 2));

let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace('version = "1.0.10"', 'version = "1.0.11"');
fs.writeFileSync('src-tauri/Cargo.toml', cargo);
