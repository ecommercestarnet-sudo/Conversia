import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const reqBody = await req.json()
    console.log('Payload completo:', JSON.stringify(reqBody))

    const event = (reqBody.event || '').toLowerCase()
    if (event === 'connection.update' || event === 'connection_update') {
      const connData = reqBody.data || {}
      const state = connData.state || connData.instance?.state || ''
      const statusReason = connData.statusReason ?? connData.disconnectionReasonCode ?? null
      const instanceName = reqBody.instance || ''

      console.log(`[CONNECTION_UPDATE] state="${state}" statusReason=${statusReason} instance=${instanceName}`)

      if (instanceName) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

        // 1. Fetch organization
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, whatsapp_status')
          .eq('evolution_instance_name', instanceName)
          .maybeSingle()

        if (orgError) {
          console.error('[CONNECTION_UPDATE] Error fetching organization:', orgError.message)
        } else if (org) {
          const isConnected = state === 'open'
          const newDbStatus = isConnected ? 'connected' : 'disconnected'
          const newLogStatus = isConnected ? 'open' : 'close'

          // 2. Check if status changed
          if (org.whatsapp_status !== newDbStatus) {
            console.log(`[CONNECTION_UPDATE] Status changed for organization ${org.id} from ${org.whatsapp_status} to ${newDbStatus}`)

            // Update organization
            const { error: updateError } = await supabase
              .from('organizations')
              .update({ whatsapp_status: newDbStatus })
              .eq('id', org.id)

            if (updateError) {
              console.error('[CONNECTION_UPDATE] Failed to update organization status:', updateError.message)
            }

            // Insert connection status log
            const { error: logError } = await supabase
              .from('whatsapp_status_logs')
              .insert({
                company_id: org.id,
                status: newLogStatus,
                reason: statusReason ? String(statusReason) : null,
                created_at: new Date().toISOString()
              })

            if (logError) {
              console.error('[CONNECTION_UPDATE] Failed to insert status log:', logError.message)
            }
          } else {
            console.log(`[CONNECTION_UPDATE] Status for organization ${org.id} is already ${newDbStatus}. No change logged.`)
          }
        } else {
          console.warn(`[CONNECTION_UPDATE] Organization not found for instance: ${instanceName}`)
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Connection update processed.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

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
    if (remoteJid.endsWith('@g.us')) {
      console.log('Webhook ignored: message is from a group (ends with @g.us).')
      return new Response(JSON.stringify({ success: true, message: 'Group messages are ignored.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const fromMe = key.fromMe === true

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseServiceRoleKey) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not defined in the environment!')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Fetch the organization ID that matches the evolution_instance_name from the payload
    const instanceName = reqBody.instance || reqBody.instanceName || ''
    let orgId: string | null = null

    if (instanceName) {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('evolution_instance_name', instanceName)
        .maybeSingle()

      if (orgError) {
        console.error(`Error fetching organization by instance name "${instanceName}":`, orgError)
      } else if (orgData) {
        orgId = orgData.id
        console.log(`Associated organization ID: ${orgId} for instance: ${instanceName}`)
      }
    }

    if (!orgId) {
      console.warn(`[whatsapp-webhook] Organization not found for instance "${instanceName}". Falling back to first organization.`)
      const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)

      if (orgError) {
        console.error('Error fetching organization fallback from database:', orgError)
      } else if (orgs && orgs.length > 0) {
        orgId = orgs[0].id
        console.log(`Associated fallback organization ID: ${orgId}`)
      } else {
        console.warn('No organizations found in database.')
      }
    }

    let content = ''
    const rawMessage = data.message
    const message = rawMessage || {}
    const isAudio = !!(message.audioMessage || data.messageType === 'audioMessage')

    if (isAudio) {
      try {
        console.log('Áudio detectado. Iniciando recuperação do áudio...')
        let audioBytes: Uint8Array | null = null
        let mimeType = 'audio/ogg'

        console.log('Tentando baixar áudio via URL/Base64...')

        const audioMessage = message.audioMessage || {}
        const base64Str = audioMessage.base64 || audioMessage.audio
        const isUrl = (str: string) => typeof str === 'string' && (str.startsWith('http://') || str.startsWith('https://'))
        const isEncryptedUrl = (str: string) => typeof str === 'string' && str.includes('whatsapp.net')

        if (base64Str && !isUrl(base64Str)) {
          console.log('Áudio em base64 direto encontrado no payload. Decodificando...')
          audioBytes = base64ToBytes(base64Str)
          if (audioMessage.mimetype) mimeType = audioMessage.mimetype
          console.log(`Áudio decodificado com sucesso. Tamanho: ${audioBytes.length} bytes.`)
        } else {
          const urlStr = audioMessage.url || audioMessage.mediaUrl || (isUrl(audioMessage.audio) ? audioMessage.audio : null)
          if (urlStr && isEncryptedUrl(urlStr)) {
            console.log(`URL do áudio no payload é da CDN do WhatsApp (${urlStr}) e está criptografada. Pulando download direto para buscar via Evolution API decriptografada.`)
          }
          
          if (urlStr && !isEncryptedUrl(urlStr)) {
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

        if (!audioBytes) {
          console.log('Áudio não encontrado no payload. Buscando na Evolution API...')
          const messageId = key.id
          
          let dbInstanceName = null
          if (orgId) {
            const { data: orgData } = await supabase.from('organizations').select('evolution_instance_name').eq('id', orgId).maybeSingle()
            if (orgData) dbInstanceName = orgData.evolution_instance_name
          }
          
          const instance = dbInstanceName || reqBody.instance || reqBody.instanceName
          const apiUrl = Deno.env.get('EVOLUTION_API_URL')
          const apiKey = Deno.env.get('EVOLUTION_API_KEY')

          console.log(`Configurações de busca - ID Mensagem: ${messageId}, Instância: ${instance}, API URL: ${apiUrl}, API Key: ${apiKey ? 'presente' : 'ausente'}`)

          if (key && instance && apiUrl && apiKey) {
            const url = `${apiUrl.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${instance}`
            console.log(`Fazendo requisição POST para: ${url}`)
            const mediaResp = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
              },
              body: JSON.stringify({
                message: reqBody.data,
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
            throw new Error(`Missing credentials/IDs to fetch audio from Evolution API. messageId: ${messageId}, instance: ${instance}`)
          }
        }

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
        content = `[Erro na transcrição: ${err.message}]`
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

    let conversationId: string | number | null = null

    // Search or create conversation in conversations table, filtering by both phone and organization
    const selectQuery = supabase
      .from('conversations')
      .select('id, organization_id')
      .eq('client_phone', clientPhone)

    if (orgId) {
      selectQuery.eq('organization_id', orgId)
    } else {
      selectQuery.is('organization_id', null)
    }

    const { data: existingConv, error: selectError } = await selectQuery.maybeSingle()

    if (selectError) {
      console.error('Error selecting conversation from database:', selectError)
      throw selectError
    }

    if (existingConv) {
      conversationId = existingConv.id
      // Update existing conversation if organization_id is null
      if (existingConv.organization_id === null && orgId) {
        console.log(`Updating existing conversation ${conversationId} to set organization_id: ${orgId}`)
        const { error: updateConvError } = await supabase
          .from('conversations')
          .update({ organization_id: orgId })
          .eq('id', conversationId)
        
        if (updateConvError) {
          console.error(`Error updating conversation ${conversationId} with organization_id:`, updateConvError)
        }
      }
    } else {
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({ client_phone: clientPhone, organization_id: orgId })
        .select('id')
        .maybeSingle()

      if (insertError) {
        console.error('Error inserting new conversation into database:', insertError)
        
        const retryQuery = supabase
          .from('conversations')
          .select('id, organization_id')
          .eq('client_phone', clientPhone)

        if (orgId) {
          retryQuery.eq('organization_id', orgId)
        } else {
          retryQuery.is('organization_id', null)
        }

        const { data: retryConv, error: retryError } = await retryQuery.maybeSingle()

        if (retryError) {
          console.error('Error retrying conversation selection after insert failure:', retryError)
          throw insertError
        }
        
        if (!retryConv) {
          console.error('Retry conversation selection returned null after insert failure.')
          throw insertError
        }
        
        conversationId = retryConv.id
        if (retryConv.organization_id === null && orgId) {
          console.log(`Updating retried conversation ${conversationId} to set organization_id: ${orgId}`)
          const { error: updateRetryError } = await supabase
            .from('conversations')
            .update({ organization_id: orgId })
            .eq('id', conversationId)
          
          if (updateRetryError) {
            console.error(`Error updating retried conversation ${conversationId} with organization_id:`, updateRetryError)
          }
        }
      } else if (newConv) {
        conversationId = newConv.id
      }
    }

    if (!conversationId) {
      throw new Error('Failed to resolve or create conversation ID.')
    }

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

    if (orgId) {
      const { error: updateAllError } = await supabase
        .from('conversations')
        .update({ organization_id: orgId })
        .is('organization_id', null)

      if (updateAllError) {
        console.error('Error batch updating conversations with null organization_id:', updateAllError)
      }
    }

    try {
      await analyzeConversation(supabase, String(conversationId))
    } catch (analysisError) {
      console.error(`[AI Analyzer] Failed to run synchronous analysis:`, analysisError)
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

  const { data: convData, error: convErr } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .maybeSingle()

  let orgId = convData?.organization_id

  if (!orgId) {
    console.log(`[AI Analyzer] No organization_id directly associated with conversation ${conversationId}. Fetching default organization.`)
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
    if (orgs && orgs.length > 0) {
      orgId = orgs[0].id
    }
  }

  let playbook = null
  if (orgId) {
    const { data: playbookData, error: playbookError } = await supabase
      .from('ai_playbooks')
      .select('company_context, knowledge_base, evaluation_criteria, custom_prompt')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (playbookError) {
      console.error(`[AI Analyzer] Error fetching playbook for organization ${orgId}:`, playbookError)
    } else if (playbookData) {
      playbook = playbookData
      console.log(`[AI Analyzer] Playbook loaded successfully for organization ${orgId}`)
    }
  }

  if (!playbook) {
    console.log(`[AI Analyzer] No playbook found for organization_id ${orgId}. Attempting fallback to the first playbook in database.`)
    const { data: fallbackPlaybook, error: fallbackError } = await supabase
      .from('ai_playbooks')
      .select('company_context, knowledge_base, evaluation_criteria, custom_prompt')
      .limit(1)
      .maybeSingle()

    if (fallbackError) {
      console.error(`[AI Analyzer] Error fetching fallback playbook:`, fallbackError)
    } else if (fallbackPlaybook) {
      playbook = fallbackPlaybook
      console.log(`[AI Analyzer] Fallback playbook loaded successfully.`)
    } else {
      console.log(`[AI Analyzer] No playbooks found in database at all. Using default values.`)
    }
  }

  const formattedHistory = messages
    .map((msg: { sender_type: string; content: string }) => {
      const sender = (msg.sender_type === 'agent' || msg.sender_type === 'atendente') ? 'atendente' : 'cliente'
      return `[${sender}]: ${msg.content}`
    })
    .join('\n')
  console.log(`[AI Analyzer] Formatted chat history for conversation ${conversationId}:\n${formattedHistory}`)

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) {
    console.warn('[AI Analyzer] OPENAI_API_KEY environment variable is not set. Skipping AI analysis.')
    return
  }

  const companyContext = playbook?.company_context || 'Você é um auditor de inteligência comercial especializado em analisar atendimentos de vendas para academias.'
  const knowledgeBase = playbook?.knowledge_base || 'Produtos, serviços e preços padrão de uma academia.'
  const evaluationCriteria = playbook?.evaluation_criteria || `Regras de Negócio para a Avaliação Comercial de Academias:
- empathy (Empatia): O atendente foi cordial, chamou pelo nome, acolheu as necessidades e objetivos do cliente (ex: emagrecimento, saúde)?
- response_time (Tempo de Resposta): O atendente respondeu de forma fluida ou demorou? (Se não houver dados de tempo precisos no histórico, avalie a fluidez da conversa e prontidão).
- investigation (Investigação): O atendente fez perguntas abertas para entender a rotina, histórico de treinos e metas do cliente antes de simplesmente enviar os preços?
- closing (Fechamento): O atendente tentou agendar uma visita experimental, aula experimental, ou convidou o cliente para conhecer a academia pessoalmente? Fez uma chamada para ação clara?
- objections (Objeções): Identifique as objeções levantadas pelo cliente (ex: preço alto, distância, falta de tempo, fidelidade do plano, etc.).`
  const customPrompt = playbook?.custom_prompt || ''

  console.log(`[AI Analyzer] Playbook injected dynamic settings for conversation ${conversationId}:`, {
    companyContext,
    knowledgeBase,
    evaluationCriteria,
    customPrompt
  })

  const systemPrompt = `Você é um auditor de vendas altamente especializado, atuando de forma rigorosa, literal e matemática. Sua tarefa é analisar o histórico de conversas entre o cliente e o atendente e retornar uma análise estruturada estritamente no formato JSON fornecido abaixo.

ATENÇÃO: Você DEVE julgar o atendimento de forma fria, objetiva, literal e com base estrita no Playbook e nas regras abaixo.

---
REGRAS ABSOLUTAS E TRAVAS DE PONTUAÇÃO (HARD LIMITS):

1. Síndrome do Panfleteiro:
Se o atendente enviar preço/tabela sem antes investigar ativamente o objetivo/perfil do cliente (metas de saúde, emagrecimento, histórico de treinos, etc.), você DEVE travar as pontuações da seguinte forma:
- O critério de Investigação ("scores.investigation") deve ser estritamente 0.
- O Score Geral ("overall_score") não pode passar de 40 (limite máximo de 40).

2. Falta de Controle:
Se a última mensagem enviada pelo atendente na conversa NÃO terminar com uma pergunta clara de fechamento ou condução (ou seja, se o atendente não usou o caractere de ponto de interrogação "?" na última linha da última mensagem enviada por ele), você DEVE aplicar a seguinte trava:
- O critério de Fechamento ("scores.closing") deve ser estritamente 0.
Qualquer sugestão ou convite sem uma pergunta final "?" explícita do atendente configura Falta de Controle e a nota deve ser 0.

3. Falta de Saudação:
Se o atendente não der saudações cordiais (como "Olá", "Bom dia", "Boa tarde", "Boa noite" ou equivalentes) ou não usar o nome do cliente na primeira interação/mensagem do atendente, você DEVE aplicar a seguinte trava:
- O critério de Empatia ("scores.empathy") não pode passar de 30 (limite máximo de 30).

---
DEFINIÇÃO RÍGIDA DE FALHAS GRAVES:

Uma Falha Grave ocorre quando o atendente cometer qualquer uma das seguintes ações:
- Alucinação/Mentira: Oferecer descontos, modalidades, planos, condições ou horários que NÃO existem explicitamente na "Base de Conhecimento" do Playbook.
- Ignorar a Dor: O cliente relata/menciona um problema ou dor (ex: dor física, vergonha de treinar, falta de tempo) e o atendente ignora esse relato, focando apenas em preço ou características técnicas.

Sempre que uma Falha Grave ocorrer:
- Ela deve ser obrigatoriamente listada na lista de "Pontos Fracos" ("weaknesses") com o prefixo exato "FALHA GRAVE: [descrição detalhada da falha]".
- O Score Geral ("overall_score") deve sofrer uma penalidade direta e matemática de -20 pontos para cada Falha Grave detectada (por exemplo, se o score calculado antes da penalidade era 70, e ocorreu 1 Falha Grave, o score final deve ser 50. Se ocorreram 2 Falhas Graves, subtraia 40 pontos, resultando em 30).

---
DÚVIDA VS. OBJEÇÃO (PREVENÇÃO DE FALSOS POSITIVOS):

Diferencie rigorosamente o que são simples dúvidas de objeções de vendas:
- Dúvida: Perguntas normais do cliente sobre como funciona, valor, horário, endereço (ex: "Qual o horário?", "Quanto custa?"). Não classifique como objeção. NUNCA coloque dúvidas no array "objections".
- Objeção: Resistência declarada do cliente à compra (ex: "Está caro", "Não tenho limite", "Longe da minha casa", "Vou pensar", "Preciso falar com minha esposa/marido"). Só registre objeções nestes casos.

---
MÉTODO DE AVALIAÇÃO MATEMÁTICA E LITERAL (PASSO A PASSO):

Para garantir a precisão, execute os seguintes passos mentais de auditoria:
Passo 1: Verifique a última mensagem do atendente. Se o caractere "?" não for o encerramento dela, defina scores.closing = 0 imediatamente.
Passo 2: Verifique a primeira mensagem do atendente. Se faltar saudação ou nome do cliente, limite scores.empathy a no máximo 30.
Passo 3: Verifique se houve preço enviado antes de investigação dos objetivos. Se sim, force scores.investigation = 0 e limite overall_score a no máximo 40.
Passo 4: Verifique as Falhas Graves. Identifique mentiras/alucinações contrárias à Base de Conhecimento e dores ignoradas. Para cada uma, adicione "FALHA GRAVE: ..." em weaknesses e retire 20 pontos de overall_score.
Passo 5: Filtre o array "objections". Apenas inclua as objeções reais (resistências). Dúvidas não entram de forma alguma.

---
FORMATO DA RESPOSTA:

Seja direto e cirúrgico no "Resumo do Atendimento" ("summary"). Não invente justificativas ou desculpas para amenizar as falhas do atendente.

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
 
Contexto da empresa:
${companyContext}
 
Base de conhecimento (Produtos/Preços/FAQ):
${knowledgeBase}
 
Critérios de avaliação:
${evaluationCriteria}
 
Instruções adicionais (Instruções Extras do Cliente):
${customPrompt}
 
Atenção: Retorne apenas o objeto JSON válido, sem tags markdown adicionais (não use \`\`\`json) ou qualquer outro texto explicativo fora do JSON.`

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

  const firstBytes = Array.from(audioBytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
  console.log(`[Whisper] Primeiros 16 bytes do áudio: ${firstBytes}`)
  
  let filename = 'audio.ogg'
  let cleanMimeType = 'audio/ogg'

  if (audioBytes.length >= 4) {
    if (audioBytes[0] === 0x4f && audioBytes[1] === 0x67 && audioBytes[2] === 0x67 && audioBytes[3] === 0x53) {
      filename = 'audio.ogg'
      cleanMimeType = 'audio/ogg'
    }
    else if (audioBytes[0] === 0x52 && audioBytes[1] === 0x49 && audioBytes[2] === 0x46 && audioBytes[3] === 0x46) {
      filename = 'audio.wav'
      cleanMimeType = 'audio/wav'
    }
    else if (audioBytes[0] === 0x66 && audioBytes[1] === 0x4c && audioBytes[2] === 0x61 && audioBytes[3] === 0x43) {
      filename = 'audio.flac'
      cleanMimeType = 'audio/flac'
    }
    else if (audioBytes.length >= 8 && audioBytes[4] === 0x66 && audioBytes[5] === 0x74 && audioBytes[6] === 0x79 && audioBytes[7] === 0x70) {
      filename = 'audio.m4a'
      cleanMimeType = 'audio/mp4'
    }
    else if ((audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33) || audioBytes[0] === 0xFF) {
      filename = 'audio.mp3'
      cleanMimeType = 'audio/mpeg'
    }
    else {
      const mime = mimeType.toLowerCase()
      if (mime.includes('mpeg') || mime.includes('mp3')) {
        filename = 'audio.mp3'
        cleanMimeType = 'audio/mpeg'
      } else if (mime.includes('wav')) {
        filename = 'audio.wav'
        cleanMimeType = 'audio/wav'
      } else if (mime.includes('m4a') || mime.includes('mp4')) {
        filename = 'audio.m4a'
        cleanMimeType = 'audio/mp4'
      } else if (mime.includes('webm')) {
        filename = 'audio.webm'
        cleanMimeType = 'audio/webm'
      } else {
        filename = 'audio.ogg'
        cleanMimeType = 'audio/ogg'
      }
    }
  }

  const blob = new Blob([audioBytes], { type: cleanMimeType })
  formData.append('file', blob, filename)
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
