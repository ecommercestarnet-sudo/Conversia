async function testHost() {
  const url = 'https://evolution-evolution-api.j9jxz3z.easypanel.host/instance/fetchInstances';
  const apiKey = 'minha_chave_secreta_123';
  
  console.log('Testing connection to Easypanel host...');
  try {
    const resp = await fetch(url, {
      headers: { 'apikey': apiKey }
    });
    console.log(`Status: ${resp.status} ${resp.statusText}`);
    if (resp.ok) {
      const data = await resp.json();
      console.log('Instances found on Easypanel host:', data.length);
      data.forEach(i => console.log(`- ${i.instanceName || i.name}`));
    } else {
      console.log(await resp.text());
    }
  } catch (err) {
    console.error('Error connecting to Easypanel host:', err.message);
  }
}

testHost();
