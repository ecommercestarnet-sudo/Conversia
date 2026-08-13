import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

Deno.serve(async (req) => {
  try {
    // Read the payload from the Evolution API v2 webhook
    const body = await req.json()
    console.log('Evolution API Webhook payload received:', JSON.stringify(body, null, 2))

    const data = body.data
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

    // Extract content from message: data.message.conversation / extendedTextMessage.text
    let content = ''
    const message = data.message
    if (message) {
      if (typeof message.conversation === 'string') {
        content = message.conversation
      } else if (message.extendedTextMessage && typeof message.extendedTextMessage.text === 'string') {
        content = message.extendedTextMessage.text
      }
    }

    if (!content) {
      console.log(`Webhook ignored: no text message content resolved for client phone ${clientPhone}.`)
      return new Response(JSON.stringify({ success: true, message: 'No text message content resolved.' }), {
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
    } catch (analysisError: any) {
      console.error(`[AI Analyzer] Failed to run synchronous analysis:`, analysisError)
      // Do not fail the webhook request if AI analysis fails (avoid message redelivery retries)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error('Error processing Evolution webhook:', error)
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

async function analyzeConversation(supabase: any, conversationId: string) {
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
    .map((msg: any) => {
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

  const openai = new OpenAI({
    apiKey: openAiApiKey,
  })

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

  console.log(`[AI Analyzer] Dispatching completion request to OpenAI API (gpt-4o-mini)...`)
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Aqui está o histórico do atendimento:\n\n${formattedHistory}` },
    ],
    response_format: { type: 'json_object' },
  })
  console.log(`[AI Analyzer] OpenAI API completion response received successfully.`)

  const resultText = response.choices[0]?.message?.content || '{}'
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
