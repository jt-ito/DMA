const compile = require('innosetup-compiler');

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
