async function testWebhook() {
  const url = 'https://erojwnigzuhnzxjsdbxe.supabase.co/functions/v1/whatsapp-webhook';
  
  // Simulated MESSAGES_UPSERT payload
  const payload = {
    event: 'messages.upsert',
    instance: 'org_01f18917-6446-4e49-ba48-0c8f2702852f_1786827463',
    data: {
      key: {
        remoteJid: '5585991038188@s.whatsapp.net',
        fromMe: false,
        id: 'TEST_MSG_ID_' + Math.random().toString(36).substring(7)
      },
      pushName: 'Test User',
      message: {
        conversation: 'Olá, teste de envio de webhook!'
      },
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000)
    }
  };

  console.log('Sending simulated MESSAGES_UPSERT payload...');
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`Status: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testWebhook();
