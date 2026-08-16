// Test: Is the Easypanel domain accessible via IP with Host header?
// The Evolution API at port 8080 and the Easypanel manager might be TWO DIFFERENT servers.

async function run() {
  const tests = [
    // Test 1: Direct IP port 8080 (what our code uses)
    { label: 'IP:8080', url: 'http://216.238.122.167:8080/instance/fetchInstances' },
    // Test 2: IP port 80 (might be Easypanel Traefik)
    { label: 'IP:80', url: 'http://216.238.122.167/instance/fetchInstances' },
    // Test 3: IP port 443 (might be Easypanel Traefik HTTPS)
    { label: 'IP:443', url: 'https://216.238.122.167/instance/fetchInstances' },
    // Test 4: IP port 3000 (common alt port)
    { label: 'IP:3000', url: 'http://216.238.122.167:3000/instance/fetchInstances' },
    // Test 5: IP port 8443
    { label: 'IP:8443', url: 'https://216.238.122.167:8443/instance/fetchInstances' },
  ];

  const apiKey = 'minha_chave_secreta_123';

  for (const test of tests) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(test.url, { 
        headers: { 'apikey': apiKey },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : (data.instances || []);
        const names = list.map(i => i.name || i.instanceName || i.instance?.instanceName || '?');
        console.log(`${test.label}: OK - ${list.length} instances: [${names.join(', ')}]`);
      } else {
        console.log(`${test.label}: ${resp.status} ${resp.statusText}`);
      }
    } catch (e) {
      console.log(`${test.label}: FAIL - ${e.message}`);
    }
  }

  // Test 6: Try the Easypanel domain with Host header via the IP
  console.log('\n--- Testing with Host header tricks ---');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://216.238.122.167', {
      headers: { 
        'apikey': apiKey,
        'Host': 'evolution-evolution-api.j9jxz3z.easypanel.host'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    console.log(`IP+Host header: ${resp.status}`, (await resp.text()).slice(0, 200));
  } catch (e) {
    console.log(`IP+Host header HTTPS: FAIL - ${e.message}`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('http://216.238.122.167', {
      headers: { 
        'apikey': apiKey,
        'Host': 'evolution-evolution-api.j9jxz3z.easypanel.host'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    console.log(`IP+Host header HTTP: ${resp.status}`, (await resp.text()).slice(0, 200));
  } catch (e) {
    console.log(`IP+Host header HTTP: FAIL - ${e.message}`);
  }
}

run().catch(console.error);
