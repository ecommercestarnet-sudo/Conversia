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

    if (!companyId || (!instanceName && action !== 'connect')) {
      return new Response(JSON.stringify({ error: 'companyId is required, and instanceName is required for disconnect' }), {
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
    console.log(`[Evolution Manager] Connecting instance for company: ${companyId}`)

    // 1. Fetch current instance name from DB if it exists
    const { data: company, error: selectError } = await supabase
      .from('companies')
      .select('evolution_instance_name')
      .eq('id', companyId)
      .maybeSingle()

    if (selectError) {
      throw new Error(`Failed to fetch company from DB: ${selectError.message}`)
    }

    const oldInstanceName = company?.evolution_instance_name

    // 2. If an old instance name exists, delete it from Evolution API to prevent session recycling
    if (oldInstanceName) {
      console.log(`[Evolution Manager] Deleting old instance ${oldInstanceName} to avoid session reuse...`)
      const deleteUrl = `${apiUrl.replace(/\/$/, '')}/instance/delete/${oldInstanceName}`
      try {
        const deleteResp = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: { 'apikey': apiKey }
        })
        if (deleteResp.ok) {
          console.log(`[Evolution Manager] Old instance ${oldInstanceName} deleted successfully.`)
        } else {
          console.warn(`[Evolution Manager] Evolution delete instance returned status ${deleteResp.status}`)
        }
      } catch (err) {
        console.warn(`[Evolution Manager] Failed to delete old instance ${oldInstanceName}:`, err)
      }
    }

    // 3. Generate a brand new unique instance name
    const newInstanceName = `org_${companyId}_${Math.floor(Date.now() / 1000)}`
    console.log(`[Evolution Manager] Generated new instance name: ${newInstanceName}`)

    // 4. Create the new instance on Evolution API
    const createUrl = `${apiUrl.replace(/\/$/, '')}/instance/create`
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        instanceName: newInstanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      })
    })

    if (!createResp.ok) {
      const errText = await createResp.text()
      throw new Error(`Failed to create instance on Evolution API: ${createResp.statusText} - ${errText}`)
    }

    const createData = await createResp.json()
    console.log(`[Evolution Manager] Instance ${newInstanceName} created successfully.`)

    // 5. Configure webhook automatically for this new instance
    const webhookUrlSetting = `${supabaseUrl}/functions/v1/whatsapp-webhook`
    const webhookPayload = {
      webhook: {
        enabled: true,
        url: webhookUrlSetting,
        byEvents: false,
        base64: true,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONNECTION_UPDATE'
        ]
      }
    }
    console.log(`[Evolution Manager] Configuring webhook for ${newInstanceName} with payload:`, JSON.stringify(webhookPayload))
    
    const webhookSetUrl = `${apiUrl.replace(/\/$/, '')}/webhook/set/${newInstanceName}`
    const webhookResp = await fetch(webhookSetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(webhookPayload)
    })

    if (!webhookResp.ok) {
      const errText = await webhookResp.text()
      console.error(`[Evolution Manager] Failed to configure webhook for instance: ${errText}`)
    } else {
      const respText = await webhookResp.text()
      console.log(`[Evolution Manager] Webhook configured successfully for ${newInstanceName}. Response: ${respText}`)
    }

    // 6. Configure settings for this new instance (alwaysOnline & readMessages)
    console.log(`[Evolution Manager] Configuring settings for ${newInstanceName} to enable alwaysOnline...`)
    const settingsSetUrl = `${apiUrl.replace(/\/$/, '')}/settings/set/${newInstanceName}`
    const settingsResp = await fetch(settingsSetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: false,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false,
        syncFullHistory: false
      })
    })

    if (!settingsResp.ok) {
      const errText = await settingsResp.text()
      console.error(`[Evolution Manager] Failed to configure settings for instance: ${errText}`)
    } else {
      console.log(`[Evolution Manager] Settings configured successfully for ${newInstanceName}`)
    }

    // 7. Save the new instance name to the DB (companies table)
    console.log(`[Evolution Manager] Saving new instance ${newInstanceName} to companies table...`)
    const { error: updateError } = await supabase
      .from('companies')
      .update({ 
        evolution_instance_name: newInstanceName, 
        whatsapp_status: 'disconnected' 
      })
      .eq('id', companyId)

    if (updateError) {
      console.error(`[Evolution Manager] Failed to update DB with new instance name: ${updateError.message}`)
    }

    // 8. Retrieve the QR Code from the response data or connect endpoint
    const createQrcode = createData.base64 || createData.qrcode?.base64 || null
    let qrcodeBase64 = createQrcode

    if (!qrcodeBase64) {
      console.log(`[Evolution Manager] Fetching QR Code via connect endpoint for instance: ${newInstanceName}`)
      const connectUrl = `${apiUrl.replace(/\/$/, '')}/instance/connect/${newInstanceName}`
      const connectResp = await fetch(connectUrl, {
        method: 'GET',
        headers: { 'apikey': apiKey }
      })

      if (connectResp.ok) {
        const connectData = await connectResp.json()
        qrcodeBase64 = connectData.base64 || connectData.qrcode?.base64 || null
      }
    }

    return new Response(JSON.stringify({
      success: true,
      qrcode: qrcodeBase64,
      status: 'connecting',
      instanceName: newInstanceName
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
