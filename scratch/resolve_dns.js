const dns = require('dns');

dns.lookup('evolution-evolution-api.j9jxz3z.easypanel.host', (err, address, family) => {
  console.log('IP Address of evolution-evolution-api.j9jxz3z.easypanel.host:', address);
  console.log('Error:', err);
});
