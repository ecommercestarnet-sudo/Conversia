Deno.serve(async (req) => {
  try {
    const { number, message } = await req.json()

    let apiUrl = Deno.env.get('EVOLUTION_API_URL')
    let apiKey = Deno.env.get('EVOLUTION_API_KEY')
    let instance = Deno.env.get('EVOLUTION_INSTANCE')

    if (!apiUrl || apiUrl.includes('216.238.122.167')) {
      apiUrl = 'https://evolution-evolution-api.qo61uu.easypanel.host'
    }
    if (!apiKey || apiKey === '429683C4C977415CAAFCCE10F7D57E11') {
      apiKey = '2C916011-DD14-4A20-AE80-DB4AC1C91FFA'
    }
    if (!instance) {
      instance = 'atendimento'
    }

    // AbortSignal cancela a requisição em 8 segundos em vez de travar o Supabase
    const response = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey || ''
      },
      body: JSON.stringify({
        number: number,
        text: message
      }),
      signal: AbortSignal.timeout(8000)
    })

    const data = await response.json()
    return new Response(JSON.stringify(data), { 
      headers: { 'Content-Type': 'application/json' },
      status: response.status 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Erro de conexão com VPS' }), { 
      headers: { 'Content-Type': 'application/json' },
      status: 500 
    })
  }
})