Deno.serve(async (req) => {
  try {
    const { number, message } = await req.json()

    const apiUrl = Deno.env.get('EVOLUTION_API_URL')
    const apiKey = Deno.env.get('EVOLUTION_API_KEY')
    const instance = Deno.env.get('EVOLUTION_INSTANCE')

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