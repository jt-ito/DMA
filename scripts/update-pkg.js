const fs = require('fs');

let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['build:standalone'] = 'node scripts/prepare-standalone.js';
pkg.scripts['build:frontend'] = 'npm run build && npm run build:standalone';
pkg.version = '1.0.8';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

let tc = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tc.build.beforeBuildCommand = 'npm run build:frontend';
tc.version = '1.0.8';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tc, null, 2));

let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace('version = "1.0.13"', 'version = "1.0.8"');
fs.writeFileSync('src-tauri/Cargo.toml', cargo);
