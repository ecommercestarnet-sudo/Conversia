import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, companyId, instanceName } = await req.json()

    if (!companyId || !instanceName) {
      return new Response(JSON.stringify({ error: 'companyId and instanceName are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const apiUrl = Deno.env.get('EVOLUTION_API_URL')
    const apiKey = Deno.env.get('EVOLUTION_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!apiUrl || !apiKey) {
      throw new Error('Evolution API URL or Key not configured in Deno environment.')
    }

    const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '')

    // Action: DISCONNECT
    if (action === 'disconnect') {
      console.log(`[Evolution Manager] Disconnecting instance: ${instanceName}`)
      
      // Delete instance from Evolution API
      // Endpoint: DELETE /instance/delete/{instanceName}
      const deleteUrl = `${apiUrl.replace(/\/$/, '')}/instance/delete/${instanceName}`
      const deleteResp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'apikey': apiKey }
      })

      if (!deleteResp.ok) {
        const errText = await deleteResp.text()
        console.warn(`[Evolution Manager] Evolution delete instance returned status ${deleteResp.status}: ${errText}`)
      }

      // Update companies table
      await supabase
        .from('companies')
        .update({ evolution_instance_name: null, whatsapp_status: 'disconnected' })
        .eq('id', companyId)

      return new Response(JSON.stringify({ success: true, message: 'Instance disconnected and deleted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Action: CONNECT (Get or Create Instance and return QR Code)
    console.log(`[Evolution Manager] Connecting instance: ${instanceName} for company: ${companyId}`)

    // 1. Check if the instance already exists
    // Endpoint: GET /instance/connectionState/{instanceName}
    const stateUrl = `${apiUrl.replace(/\/$/, '')}/instance/connectionState/${instanceName}`
    const stateResp = await fetch(stateUrl, {
      method: 'GET',
      headers: { 'apikey': apiKey }
    })

    let instanceExists = false
    let connectionState = 'close'

    if (stateResp.ok) {
      const stateData = await stateResp.json()
      instanceExists = true
      connectionState = stateData.instance?.state || 'close'
      console.log(`[Evolution Manager] Instance ${instanceName} exists. State: ${connectionState}`)
    } else {
      console.log(`[Evolution Manager] Instance ${instanceName} does not exist. Status: ${stateResp.status}. Creating a new one...`)
    }

    // 2. If it does not exist, create it
    if (!instanceExists) {
      const createUrl = `${apiUrl.replace(/\/$/, '')}/instance/create`
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      })

      if (!createResp.ok) {
        const errText = await createResp.text()
        throw new Error(`Failed to create instance on Evolution API: ${createResp.statusText} - ${errText}`)
      }

      const createData = await createResp.json()
      console.log(`[Evolution Manager] Instance ${instanceName} created successfully.`)

      // 3. Configure webhook automatically for this new instance
      // Endpoint: POST /webhook/set/{instanceName}
      const webhookUrlSetting = `${supabaseUrl}/functions/v1/whatsapp-webhook`
      console.log(`[Evolution Manager] Configuring webhook for ${instanceName} pointing to: ${webhookUrlSetting}`)
      
      const webhookSetUrl = `${apiUrl.replace(/\/$/, '')}/webhook/set/${instanceName}`
      const webhookResp = await fetch(webhookSetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrlSetting,
            byEvents: false,
            base64: true,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE'
            ]
          }
        })
      })

      if (!webhookResp.ok) {
        const errText = await webhookResp.text()
        console.error(`[Evolution Manager] Failed to configure webhook for instance: ${errText}`)
      } else {
        console.log(`[Evolution Manager] Webhook configured successfully for ${instanceName}`)
      }

      // Check if QR code was returned directly during creation
      const createQrcode = createData.base64 || createData.qrcode?.base64
      if (createQrcode) {
        return new Response(JSON.stringify({
          success: true,
          qrcode: createQrcode,
          status: 'connecting'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }
    }

    // 4. If instance exists and is already connected (open), just return success
    if (connectionState === 'open') {
      // Update database status
      await supabase
        .from('companies')
        .update({ whatsapp_status: 'connected' })
        .eq('id', companyId)

      return new Response(JSON.stringify({
        success: true,
        qrcode: null,
        status: 'connected'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // 5. If instance exists but is not connected, retrieve the QR Code
    // Endpoint: GET /instance/connect/{instanceName}
    console.log(`[Evolution Manager] Fetching QR Code for instance: ${instanceName}`)
    const connectUrl = `${apiUrl.replace(/\/$/, '')}/instance/connect/${instanceName}`
    const connectResp = await fetch(connectUrl, {
      method: 'GET',
      headers: { 'apikey': apiKey }
    })

    if (!connectResp.ok) {
      const errText = await connectResp.text()
      throw new Error(`Failed to retrieve QR code from Evolution API: ${connectResp.statusText} - ${errText}`)
    }

    const connectData = await connectResp.json()
    const qrcodeBase64 = connectData.base64 || connectData.qrcode?.base64 || null

    return new Response(JSON.stringify({
      success: true,
      qrcode: qrcodeBase64,
      status: 'connecting'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    const err = error as Error
    console.error('[Evolution Manager] Error processing request:', err)
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
