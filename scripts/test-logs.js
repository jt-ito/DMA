const { execSync } = require('child_process');

console.log('Starting a test container with long logs...');
try {
  // Remove the old container if it exists
  try {
    execSync('docker rm -f long-logs-test', { stdio: 'ignore' });
  } catch (e) {
    // Ignore error if container doesn't exist
  }

  // Start a new alpine container that echoes 200 lines
  execSync('docker run -d --name long-logs-test alpine sh -c "for i in $(seq 1 200); do echo \\"Log line $i: Testing scroll functionality with some long text to fill the screen...\\"; sleep 0.05; done"', { stdio: 'inherit' });
  console.log('Container started! Check the Docker Manager UI.');
} catch (e) {
  console.error('Failed to start container:', e.message);
}
