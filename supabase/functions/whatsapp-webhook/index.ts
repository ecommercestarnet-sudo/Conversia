import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


Deno.serve(async (req) => {
  try {
    // Read the payload from the Evolution API v2 webhook
    const reqBody = await req.json()
    console.log('Payload completo:', JSON.stringify(reqBody))

    const data = reqBody.data
    if (!data) {
      return new Response(JSON.stringify({ success: true, message: 'No data field in payload.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const key = data.key
    if (!key) {
      return new Response(JSON.stringify({ success: true, message: 'No key field in data payload.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const remoteJid = key.remoteJid || ''
    // Ignore message if it is from a group (remoteJid ends with @g.us)
    if (remoteJid.endsWith('@g.us')) {
      console.log('Webhook ignored: message is from a group (ends with @g.us).')
      return new Response(JSON.stringify({ success: true, message: 'Group messages are ignored.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const fromMe = key.fromMe === true

    // Extract client phone number from remoteJid (or remoteJidAlt if remoteJid ends with @lid)
    let rawPhone = remoteJid
    if (rawPhone.endsWith('@lid') && key.remoteJidAlt) {
      rawPhone = key.remoteJidAlt
    }

    let clientPhone = ''
    if (rawPhone) {
      const phonePart = rawPhone.split('@')[0]
      clientPhone = phonePart.replace(/[^0-9]/g, '')
    }

    if (!clientPhone) {
      console.warn('Webhook ignored: could not extract phone number from remoteJid.', remoteJid)
      return new Response(JSON.stringify({ success: true, message: 'Could not extract phone number.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Extract content from message: audio processing or text conversations
    let content = ''
    const rawMessage = data.message
    const message = rawMessage || {}
    const isAudio = !!(message.audioMessage || data.messageType === 'audioMessage')

    if (isAudio) {
      try {
        console.log('Áudio detectado. Iniciando recuperação do áudio...')
        let audioBytes: Uint8Array | null = null
        let mimeType = 'audio/ogg' // default

        console.log('Tentando baixar áudio via URL/Base64...')

        // Check if there is base64 directly in the payload
        const audioMessage = message.audioMessage || {}
        const base64Str = audioMessage.base64 || audioMessage.audio
        const isUrl = (str: string) => typeof str === 'string' && (str.startsWith('http://') || str.startsWith('https://'))

        if (base64Str && !isUrl(base64Str)) {
          console.log('Áudio em base64 direto encontrado no payload. Decodificando...')
          audioBytes = base64ToBytes(base64Str)
          if (audioMessage.mimetype) mimeType = audioMessage.mimetype
          console.log(`Áudio decodificado com sucesso. Tamanho: ${audioBytes.length} bytes.`)
        } else {
          // Check if URL is provided in payload
          const urlStr = audioMessage.url || audioMessage.mediaUrl || (isUrl(audioMessage.audio) ? audioMessage.audio : null)
          if (urlStr) {
            console.log(`URL do áudio encontrada no payload: ${urlStr}. Baixando...`)
            const downloadResp = await fetch(urlStr)
            if (!downloadResp.ok) {
              throw new Error(`Failed to download audio from payload URL: ${downloadResp.statusText}`)
            }
            const arrayBuffer = await downloadResp.arrayBuffer()
            audioBytes = new Uint8Array(arrayBuffer)
            if (audioMessage.mimetype) mimeType = audioMessage.mimetype
            console.log(`Áudio baixado com sucesso da URL direta. Tamanho: ${audioBytes.length} bytes.`)
          }
        }

        // Fallback: If we still don't have the audio bytes, fetch it from Evolution API
        if (!audioBytes) {
          console.log('Áudio não encontrado no payload. Buscando na Evolution API...')
          const messageId = key.id
          const instance = reqBody.instance || Deno.env.get('EVOLUTION_INSTANCE') || Deno.env.get('EVOLUTION_INSTANCE_NAME')
          const apiUrl = Deno.env.get('EVOLUTION_API_URL')
          const apiKey = Deno.env.get('EVOLUTION_API_KEY')

          console.log(`Configurações de busca - ID Mensagem: ${messageId}, Instância: ${instance}, API URL: ${apiUrl}, API Key: ${apiKey ? 'presente' : 'ausente'}`)

          if (messageId && instance && apiUrl && apiKey) {
            const url = `${apiUrl.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${instance}`
            console.log(`Fazendo requisição POST para: ${url}`)
            const mediaResp = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
              },
              body: JSON.stringify({
                message: { key: { id: messageId } },
                convertToMp4: false
              })
            })

            if (mediaResp.ok) {
              const mediaData = await mediaResp.json()
              if (mediaData && mediaData.base64) {
                console.log('Áudio obtido com sucesso em base64 da Evolution API.')
                audioBytes = base64ToBytes(mediaData.base64)
                if (mediaData.mimetype) mimeType = mediaData.mimetype
                console.log(`Áudio decodificado da Evolution API. Tamanho: ${audioBytes.length} bytes.`)
              } else {
                throw new Error('Evolution API response did not contain base64 field.')
              }
            } else {
              const errText = await mediaResp.text()
              throw new Error(`Failed to fetch media from Evolution API: ${mediaResp.statusText} - ${errText}`)
            }
          } else {
            throw new Error(`Missing credentials/IDs to fetch audio from Evolution API. messageId: ${messageId}, instance: ${instance}, apiUrl: ${apiUrl ? 'presente' : 'ausente'}, apiKey: ${apiKey ? 'presente' : 'ausente'}`)
          }
        }

        // Now transcribe using Whisper
        console.log(`Iniciando transcrição com OpenAI Whisper. MimeType: ${mimeType}`)
        const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
        if (!openAiApiKey) {
          throw new Error('OPENAI_API_KEY is not defined in environment.')
        }

        const transcript = await transcribeAudio(audioBytes, mimeType, openAiApiKey)
        console.log('Resposta do Whisper:', transcript)
        content = transcript
        if (!content) {
          content = '[Áudio sem conteúdo/transcrição vazia]'
        }
      } catch (audioError) {
        const err = audioError as Error
        console.error('Erro detalhado Whisper:', err)
        content = '[Áudio não transcrito]'
      }
    } else if (rawMessage) {
      if (typeof message.conversation === 'string') {
        content = message.conversation
      } else if (message.extendedTextMessage && typeof message.extendedTextMessage.text === 'string') {
        content = message.extendedTextMessage.text
      }
    }

    if (!content) {
      console.log(`Webhook ignored: no message content resolved for client phone ${clientPhone}.`)
      return new Response(JSON.stringify({ success: true, message: 'No message content resolved.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Initialize Supabase Client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseServiceRoleKey) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not defined in the environment!')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Fetch the first company's ID to associate with the conversation
    let companyId: string | null = null
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .limit(1)

    if (companyError) {
      console.error('Error fetching company from database:', companyError)
    } else if (companies && companies.length > 0) {
      companyId = companies[0].id
      console.log(`Associated company ID: ${companyId}`)
    } else {
      console.warn('No companies found in database.')
    }

    let conversationId: string | number | null = null

    // Search or create conversation in conversations table
    const { data: existingConv, error: selectError } = await supabase
      .from('conversations')
      .select('id, company_id')
      .eq('client_phone', clientPhone)
      .maybeSingle()

    if (selectError) {
      console.error('Error selecting conversation from database:', selectError)
      throw selectError
    }

    if (existingConv) {
      conversationId = existingConv.id
      // Update existing conversation if company_id is null
      if (existingConv.company_id === null && companyId) {
        console.log(`Updating existing conversation ${conversationId} to set company_id: ${companyId}`)
        const { error: updateConvError } = await supabase
          .from('conversations')
          .update({ company_id: companyId })
          .eq('id', conversationId)
        
        if (updateConvError) {
          console.error(`Error updating conversation ${conversationId} with company_id:`, updateConvError)
        }
      }
    } else {
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({ client_phone: clientPhone, company_id: companyId })
        .select('id')
        .maybeSingle()

      if (insertError) {
        console.error('Error inserting new conversation into database:', insertError)
        
        // Fallback retry block for concurrent inserts
        const { data: retryConv, error: retryError } = await supabase
          .from('conversations')
          .select('id, company_id')
          .eq('client_phone', clientPhone)
          .maybeSingle()

        if (retryError) {
          console.error('Error retrying conversation selection after insert failure:', retryError)
          throw insertError
        }
        
        if (!retryConv) {
          console.error('Retry conversation selection returned null after insert failure.')
          throw insertError
        }
        
        conversationId = retryConv.id
        // Update retryConv if company_id is null
        if (retryConv.company_id === null && companyId) {
          console.log(`Updating retried conversation ${conversationId} to set company_id: ${companyId}`)
          const { error: updateRetryError } = await supabase
            .from('conversations')
            .update({ company_id: companyId })
            .eq('id', conversationId)
          
          if (updateRetryError) {
            console.error(`Error updating retried conversation ${conversationId} with company_id:`, updateRetryError)
          }
        }
      } else if (newConv) {
        conversationId = newConv.id
      }
    }

    if (!conversationId) {
      throw new Error('Failed to resolve or create conversation ID.')
    }

    // Save the message to messages table (sender_type: 'agent' if fromMe is true, else 'client')
    const senderType = fromMe ? 'agent' : 'client'
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        content: content,
      })

    if (msgError) {
      console.error('Error inserting message into Supabase messages table:', msgError)
      throw msgError
    }

    console.log(`Message successfully saved. Conversation ID: ${conversationId}, Sender Type: ${senderType}`)

    // 3. Batch update other conversations where company_id is null
    if (companyId) {
      const { error: updateAllError } = await supabase
        .from('conversations')
        .update({ company_id: companyId })
        .is('company_id', null)

      if (updateAllError) {
        console.error('Error batch updating conversations with null company_id:', updateAllError)
      }
    }

    // Execute analyzeConversation synchronously
    try {
      await analyzeConversation(supabase, String(conversationId))
    } catch (analysisError) {
      console.error(`[AI Analyzer] Failed to run synchronous analysis:`, analysisError)
      // Do not fail the webhook request if AI analysis fails (avoid message redelivery retries)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    const err = error as Error
    console.error('Error processing Evolution webhook:', err)
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

async function analyzeConversation(supabase: ReturnType<typeof createClient>, conversationId: string) {
  console.log(`[AI Analyzer] Starting AI analysis for conversation ID: ${conversationId}`)

  // Step 1: Fetch messages from Supabase
  const { data: messages, error: selectError } = await supabase
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (selectError) {
    console.error(`[AI Analyzer] Supabase SELECT query error for conversation ${conversationId}:`, selectError)
    throw new Error(`Database SELECT query failed: ${selectError.message}`)
  }

  if (!messages || messages.length === 0) {
    console.warn(`[AI Analyzer] No messages found for conversation ${conversationId}. Skipping analysis.`)
    return
  }

  // Step 2: Format conversation history
  const formattedHistory = messages
    .map((msg: { sender_type: string; content: string }) => {
      const sender = (msg.sender_type === 'agent' || msg.sender_type === 'atendente') ? 'atendente' : 'cliente'
      return `[${sender}]: ${msg.content}`
    })
    .join('\n')
  console.log(`[AI Analyzer] Formatted chat history for conversation ${conversationId}:\n${formattedHistory}`)

  // Step 3: Request OpenAI Completion
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) {
    console.warn('[AI Analyzer] OPENAI_API_KEY environment variable is not set. Skipping AI analysis.')
    return
  }

  const systemPrompt = `Você é um auditor de inteligência comercial especializado em analisar atendimentos de vendas para academias.
Sua tarefa é analisar o histórico de conversas entre o cliente e o atendente da academia e retornar uma análise estruturada estritamente no formato JSON fornecido abaixo.

O JSON de retorno deve possuir exatamente a seguinte estrutura:
{
  "overall_score": 85,
  "scores": {
    "empathy": 90,
    "response_time": 80,
    "investigation": 75,
    "closing": 85
  },
  "summary": "Resumo detalhado da conversa...",
  "strengths": [
    "Ponto forte 1",
    "Ponto forte 2"
  ],
  "weaknesses": [
    "Ponto fraco 1",
    "Ponto fraco 2"
  ],
  "recommendations": [
    "Recomendação prática 1",
    "Recomendação prática 2"
  ],
  "objections": [
    "Objeção de preço",
    "Objeção de horário"
  ]
}

Regras de Negócio para a Avaliação Comercial de Academias:
- empathy (Empatia): O atendente foi cordial, chamou pelo nome, acolheu as necessidades e objetivos do cliente (ex: emagrecimento, saúde)?
- response_time (Tempo de Resposta): O atendente respondeu de forma fluida ou demorou? (Se não houver dados de tempo precisos no histórico, avalie a fluidez da conversa e prontidão).
- investigation (Investigação): O atendente fez perguntas abertas para entender a rotina, histórico de treinos e metas do cliente antes de simplesmente enviar os preços?
- closing (Fechamento): O atendente tentou agendar uma visita experimental, aula experimental, ou convidou o cliente para conhecer a academia pessoalmente? Fez uma chamada para ação clara?
- objections (Objeções): Identifique as objeções levantadas pelo cliente (ex: preço alto, distância, falta de tempo, fidelidade do plano, etc.).

Atenção: Retorne apenas o objeto JSON válido, sem tags markdown adicionais ou qualquer outro texto explicativo fora do JSON.`

  console.log(`[AI Analyzer] Dispatching completion request to OpenAI API (gpt-4o-mini) via fetch...`)
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Aqui está o histórico do atendimento:\n\n${formattedHistory}` },
        ],
        response_format: { type: 'json_object' },
      })
    })
  } catch (fetchError) {
    const err = fetchError as Error
    console.error(`[AI Analyzer] Network or connection error calling OpenAI API:`, err.message, err.stack)
    throw err
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error(`[AI Analyzer] OpenAI API returned error status ${response.status}:`, errText)
    throw new Error(`OpenAI API error: ${response.statusText} - ${errText}`)
  }

  const completionData = await response.json()
  console.log(`[AI Analyzer] OpenAI API completion response received successfully.`)

  const resultText = completionData.choices?.[0]?.message?.content || '{}'
  const analysisResult = JSON.parse(resultText)
  console.log(`[AI Analyzer] Parsed JSON response successfully for conversation ${conversationId}`)

  // Step 4: Save analysis JSON to Supabase
  console.log(`[AI Analyzer] Saving analysis to database (analyses table) for conversation ${conversationId}...`)
  const { error: upsertError } = await supabase
    .from('analyses')
    .upsert({
      conversation_id: conversationId,
      overall_score: analysisResult.overall_score,
      scores: analysisResult.scores,
      summary: analysisResult.summary,
      strengths: analysisResult.strengths,
      weaknesses: analysisResult.weaknesses,
      recommendations: analysisResult.recommendations,
      objections: analysisResult.objections,
    }, {
      onConflict: 'conversation_id',
    })

  if (upsertError) {
    console.error(`[AI Analyzer] Supabase UPSERT query error for analysis of conversation ${conversationId}:`, upsertError)
    throw new Error(`Database UPSERT query failed: ${upsertError.message}`)
  }

  console.log(`[AI Analyzer] Analysis successfully saved/updated for conversation ${conversationId}`)
}

function base64ToBytes(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  const binaryString = atob(cleanBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

async function transcribeAudio(audioBytes: Uint8Array, mimeType: string, openAiApiKey: string): Promise<string> {
  const formData = new FormData()
  
  // Resolve extension and clean mimetype based on input mimeType
  let filename = 'audio.ogg'
  let cleanMimeType = 'audio/ogg'
  const mime = mimeType.toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) {
    filename = 'audio.mp3'
    cleanMimeType = 'audio/mpeg'
  } else if (mime.includes('wav')) {
    filename = 'audio.wav'
    cleanMimeType = 'audio/wav'
  } else if (mime.includes('m4a') || mime.includes('mp4')) {
    filename = 'audio.m4a'
    cleanMimeType = 'audio/mpeg'
  } else if (mime.includes('webm')) {
    filename = 'audio.webm'
    cleanMimeType = 'audio/webm'
  } else {
    filename = 'audio.ogg'
    cleanMimeType = 'audio/ogg'
  }

  const file = new File([audioBytes], filename, { type: cleanMimeType })
  formData.append('file', file)
  formData.append('model', 'whisper-1')

  console.log(`[Whisper] Sending transcription request to OpenAI with filename: ${filename}, mimetype: ${cleanMimeType}, size: ${audioBytes.length} bytes`)
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiApiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error(`[Whisper] OpenAI Whisper API error (status ${response.status}):`, errText)
    throw new Error(`Whisper API error: ${response.statusText} - ${errText}`)
  }

  const result = await response.json()
  console.log(`[Whisper] Transcription result received successfully. Length: ${result.text?.length || 0}`)
  return result.text || ''
}
