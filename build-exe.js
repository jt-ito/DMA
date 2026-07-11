const compile = require('innosetup-compiler');
const { execSync } = require('child_process');
function build(file) {
  return new Promise((resolve, reject) => {
    compile(file, { gui: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main() {
  try {
    console.log('Compiling launcher.cs...');
    const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
    execSync(`"${cscPath}" /target:winexe /out:launcher.exe launcher.cs`, { stdio: 'inherit' });

    console.log('Building setup installer...');
    await build('setup.iss');
    console.log('Building portable executable...');
    await build('portable.iss');
    console.log('All executables built successfully in dist/ folder!');
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
main();
