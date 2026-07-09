const envId = 'jt-mini-pc-1782266908395';
const cwd = '/home/jt/containers';

async function run() {
  const r1 = await fetch('http://localhost:3000/api/debug', {
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({envId, command: 'if [ -f "docker-compose.env" ]; then echo yes; fi', cwd})
  }).then(r => r.json());
  console.log("r1:", r1);

  const r2 = await fetch('http://localhost:3000/api/debug', {
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({envId, command: 'docker compose -f /home/jt/containers/docker-compose.yml --env-file /home/jt/containers/docker-compose.env up -d', cwd})
  }).then(r => r.json());
  console.log("r2:", r2);
}
run();
