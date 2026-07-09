const { exec } = require('child_process');
exec('docker ps -a --format "{{json .}}"', (e, stdout, stderr) => {
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
  console.log('ERR:', e);
});
