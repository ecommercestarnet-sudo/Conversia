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

    // Process the message asynchronously to avoid webhook timeouts and duplicate retries
    const processWebhookAsync = async () => {
      try {
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
          return
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
          console.error(`[AI Analyzer] Failed to run background analysis:`, analysisError)
        }
      } catch (err) {
        console.error('Error processing WhatsApp message in background:', err)
      }
    }

    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined') {
      // @ts-ignore
      EdgeRuntime.waitUntil(processWebhookAsync())
    } else {
      // Fallback for non-EdgeRuntime environments
      processWebhookAsync()
    }

    return new Response(JSON.stringify({ success: true, message: 'Message processing started in background.' }), {
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

async function analyzeConversation(supabase: ReturnType<typeof createClient>, conversationId: string, force: boolean = false) {
  console.log(`[AI Analyzer] Starting AI analysis for conversation ID: ${conversationId} (force=${force})`)

  const { data: messages, error: selectError } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
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

  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'http://216.238.122.167:8081'
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '429683C4C977415CAAFCCE10F7D57E11'

  // Trigger constraints
  if (!force) {
    if (messages.length < 3) {
      console.log(`[AI Analyzer] Skipping analysis. Conversation ${conversationId} has only ${messages.length} messages (min 3 required).`)
      return
    }

    const lastMessage = messages[messages.length - 1];
    const isSeller = lastMessage.sender_type === 'agent' || lastMessage.sender_type === 'atendente';

    if (!isSeller) {
      console.log(`[AI Analyzer] Last message in conversation ${conversationId} is from client. Skipping analysis until seller responds.`)
      return
    }
  }

  // Fetch conversation details
  const { data: convData } = await supabase
    .from('conversations')
    .select('organization_id, client_phone, operator_id, alert_sent, last_analyzed_at, message_count_at_analysis')
    .eq('id', conversationId)
    .maybeSingle()

  let orgId = convData?.organization_id
  const clientPhone = convData?.client_phone || ''
  const operatorId = convData?.operator_id
  const alertSent = convData?.alert_sent || false
  const lastAnalyzedAt = convData?.last_analyzed_at || null
  const messageCountAtAnalysis = convData?.message_count_at_analysis || 0

  // Debouncing — prevent rapid re-analysis
  if (!force) {
    const newMessagesSinceLast = messages.length - messageCountAtAnalysis
    if (newMessagesSinceLast < 2) {
      console.log(`[AI Analyzer] Debounce: only ${newMessagesSinceLast} new message(s) since last analysis (need 2). Skipping.`)
      return
    }

    if (lastAnalyzedAt) {
      const elapsed = Date.now() - new Date(lastAnalyzedAt).getTime()
      if (elapsed < 60000) {
        console.log(`[AI Analyzer] Debounce: only ${Math.round(elapsed / 1000)}s since last analysis (need 60s). Skipping.`)
        return
      }
    }
  }

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
  let ownerWhatsapp = null
  let instanceName = null
  let orgName = ''

  if (orgId) {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name, evolution_instance_name, owner_whatsapp')
      .eq('id', orgId)
      .maybeSingle();

    if (orgData) {
      orgName = orgData.name;
      ownerWhatsapp = orgData.owner_whatsapp;
      instanceName = orgData.evolution_instance_name;
    }

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
      .select('organization_id, company_context, knowledge_base, evaluation_criteria, custom_prompt')
      .limit(1)
      .maybeSingle()

    if (fallbackError) {
      console.error(`[AI Analyzer] Error fetching fallback playbook:`, fallbackError)
    } else if (fallbackPlaybook) {
      playbook = fallbackPlaybook
      orgId = fallbackPlaybook.organization_id;
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, evolution_instance_name, owner_whatsapp')
        .eq('id', orgId)
        .maybeSingle();
      if (orgData) {
        orgName = orgData.name;
        ownerWhatsapp = orgData.owner_whatsapp;
        instanceName = orgData.evolution_instance_name;
      }
      console.log(`[AI Analyzer] Fallback playbook loaded successfully.`)
    }
  }

  // Step 1.7: Prevent loop/analysis if conversation is with the business owner
  if (clientPhone && ownerWhatsapp) {
    const cleanClient = clientPhone.replace(/[^0-9]/g, '')
    const cleanOwner = ownerWhatsapp.replace(/[^0-9]/g, '')
    const isOwner = cleanClient === cleanOwner || 
      (cleanClient.length > cleanOwner.length ? cleanClient.endsWith(cleanOwner) : cleanOwner.endsWith(cleanClient))
    if (isOwner) {
      console.log(`[AI Analyzer] Skipping analysis/alert because conversation is with the owner's WhatsApp: ${clientPhone}`)
      return
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

  const systemPrompt = `Você é um auditor de inteligência comercial. Sua tarefa é analisar conversas de atendimento e avaliar o desempenho do vendedor com base no Playbook Comercial da empresa.

═══════════════════════════════════════════
ETAPA 1 — RACIOCÍNIO PRÉVIO (OBRIGATÓRIO)
═══════════════════════════════════════════

ANTES de avaliar qualquer critério, você DEVE preencher o campo "_raciocinio_previo" analisando cuidadosamente:
1. Em que FASE a conversa se encontra: contato_inicial, investigacao, negociacao, fechamento ou pos_venda.
2. Se o cliente apresentou OBJEÇÕES reais (ex: "está caro", "vou pensar", "não tenho tempo") e se o vendedor já respondeu a elas.
3. Se o vendedor enviou PREÇOS ou VALORES antes de fazer perguntas investigativas sobre as necessidades do cliente.
4. Se a ÚLTIMA MENSAGEM do vendedor termina com uma PERGUNTA de condução (contém "?").
5. Se o vendedor SAUDOU o cliente e USOU O NOME dele na primeira interação.

═══════════════════════════════════════════
ETAPA 2 — AVALIAÇÃO POR CRITÉRIO
═══════════════════════════════════════════

Para cada critério do Playbook, avalie com UM dos 4 estados estritos:
- "CUMPRIDO": O vendedor executou a técnica corretamente.
- "PARCIAL": Executou de forma incompleta ou com hesitação.
- "NAO_CUMPRIDO": A oportunidade existiu claramente, mas o vendedor falhou.
- "N_A": O cenário para essa regra NÃO ocorreu na conversa.

REGRAS RÍGIDAS DE N_A:
- Se o cliente NÃO fez nenhuma objeção explícita → critério de "Quebra de Objeções" = "N_A".
- Se o cliente fez objeção mas o vendedor AINDA NÃO respondeu (objeção pendente) → "N_A" (não punir antes da resposta).
- Se a conversa é curta/inicial e o vendedor não teve oportunidade real de aplicar a técnica → "N_A".
- Critérios "N_A" são EXCLUÍDOS do cálculo de nota (não contam contra o vendedor).

REGRA DE EMPATIA:
- Se o vendedor cumprimentou com educação e usou o nome do cliente → "CUMPRIDO".
- NÃO exija elogios poéticos, parabenizações ou frases motivacionais.

FALHAS GRAVES:
- Se o vendedor ofereceu um produto/serviço que NÃO existe na base de conhecimento (alucinação) → registre em "weaknesses" com prefixo "FALHA GRAVE: [descrição]".
- Se o vendedor ignorou completamente uma dor/necessidade explícita do cliente → "FALHA GRAVE: [descrição]".

═══════════════════════════════════════════
ETAPA 3 — NÃO CALCULE NOTAS NUMÉRICAS
═══════════════════════════════════════════

IMPORTANTE: NÃO calcule notas ou percentuais. O sistema backend calcula a nota automaticamente a partir dos status dos critérios. Você deve APENAS:
- Preencher "_raciocinio_previo" com a análise contextual
- Avaliar cada critério com "status" e "justificativa"
- Listar strengths, weaknesses, recommendations e objections
- Fornecer o response_time_score (0-100) baseado na fluidez da conversa

═══════════════════════════════════════════
EXEMPLOS DE REFERÊNCIA (FEW-SHOT)
═══════════════════════════════════════════

EXEMPLO 1 — Atendimento excelente (resultado esperado: ~100):
[cliente]: Oi, quero saber sobre a academia
[atendente]: Olá Maria! Tudo bem? Que bom que nos procurou! Me conta, qual seu objetivo? Emagrecimento, hipertrofia, saúde?
[cliente]: Quero emagrecer
[atendente]: Ótimo! Você já treinou antes? Tem alguma restrição de horário?
[cliente]: Nunca treinei, tenho horário livre de manhã
[atendente]: Perfeito! Temos turmas de musculação com acompanhamento personalizado pela manhã. O plano trimestral sai R$120/mês. Que tal agendar uma aula experimental gratuita amanhã às 9h?

Raciocínio: Vendedor saudou pelo nome, investigou necessidades, apresentou solução personalizada, conduziu para ação. Todos os critérios aplicáveis foram cumpridos.

EXEMPLO 2 — Atendimento mediano (resultado esperado: ~50):
[cliente]: Quanto custa a mensalidade?
[atendente]: Oi! O plano mensal é R$150 e o trimestral R$120/mês. Quer conhecer a academia?

Raciocínio: Saudou mas não usou nome (não sabia), enviou preços direto sem investigar (Panfleteiro), mas fez pergunta de condução no final. Investigação = NAO_CUMPRIDO, Fechamento = CUMPRIDO.

EXEMPLO 3 — Atendimento ruim (resultado esperado: ~0):
[cliente]: Olá, qual o valor da mensalidade da academia?
[atendente]: R$120 no plano anual.
[cliente]: Achei caro, vou pensar.
[atendente]: Ok, tchau.

Raciocínio: Sem saudação, sem investigação (panfleteiro), ignorou objeção de preço do cliente, sem condução/fechamento. Todos os critérios aplicáveis = NAO_CUMPRIDO.

═══════════════════════════════════════════
FORMATO JSON DA RESPOSTA
═══════════════════════════════════════════

Retorne UNICAMENTE o JSON abaixo (sem markdown, sem texto fora):
{
  "_raciocinio_previo": {
    "fase_conversa": "contato_inicial | investigacao | negociacao | fechamento | pos_venda",
    "resumo_contexto": "Descrição breve do que aconteceu na conversa...",
    "objecoes_detectadas": ["lista de objeções reais do cliente, ou array vazio"],
    "objecao_pendente_resposta": false,
    "vendedor_enviou_preco_sem_investigar": false,
    "ultima_msg_vendedor_termina_com_pergunta": true,
    "vendedor_saudou_e_usou_nome": true
  },
  "criterios": [
    {
      "nome_criterio": "Nome do critério avaliado",
      "justificativa": "Raciocínio detalhado antes de definir o status...",
      "status": "CUMPRIDO"
    }
  ],
  "response_time_score": 85,
  "summary": "Resumo objetivo da auditoria...",
  "strengths": ["Ponto forte 1"],
  "weaknesses": ["Ponto fraco 1"],
  "recommendations": ["Recomendação prática 1"],
  "objections": ["Objeção real identificada"]
}

═══════════════════════════════════════════
CONTEXTO DO NEGÓCIO
═══════════════════════════════════════════

Contexto da empresa:
${companyContext}

Base de conhecimento (Produtos/Preços/FAQ):
${knowledgeBase}

Critérios de avaliação do Playbook:
${evaluationCriteria}

${customPrompt ? `Instruções adicionais:\n${customPrompt}` : ''}

Atenção: Retorne APENAS o objeto JSON válido, sem tags markdown ou texto explicativo.`;

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

  // Step 4.5: DETERMINISTIC SCORING PIPELINE (7 stages)
  const chainOfThought = analysisResult._raciocinio_previo || {}

  // Stage 1: VALIDATE — Sanitize statuses to valid enum values
  if (Array.isArray(analysisResult.criterios)) {
    const validStatuses = ['CUMPRIDO', 'PARCIAL', 'NAO_CUMPRIDO', 'N_A']
    analysisResult.criterios.forEach((c: any) => {
      c.status = String(c.status || 'N_A').toUpperCase().trim()
      if (!validStatuses.includes(c.status)) {
        console.warn(`[AI Analyzer] Invalid status "${c.status}" for criterion "${c.nome_criterio}". Defaulting to N_A.`)
        c.status = 'N_A'
      }
    })
  }

  // Stage 2: BASE SCORE — Calculate from criteria
  let pointsObtained = 0
  let totalApplicable = 0

  if (Array.isArray(analysisResult.criterios)) {
    analysisResult.criterios.forEach((c: any) => {
      if (c.status !== 'N_A') {
        totalApplicable += 1
        if (c.status === 'CUMPRIDO') {
          pointsObtained += 1.0
          c.pontos = 1.0
        } else if (c.status === 'PARCIAL') {
          pointsObtained += 0.5
          c.pontos = 0.5
        } else {
          c.pontos = 0.0
        }
      } else {
        c.pontos = 0.0 // N_A does not count
      }
    })
  }

  let calculatedScore = 100
  if (totalApplicable > 0) {
    calculatedScore = Math.round((pointsObtained / totalApplicable) * 100)
  }

  console.log(`[AI Analyzer] Stage 2 Base Score: Points=${pointsObtained}, Applicable=${totalApplicable}, Score=${calculatedScore}`)

  // Stage 3: HARD LIMIT — Panfleteiro (sent price without investigating)
  if (chainOfThought.vendedor_enviou_preco_sem_investigar === true) {
    // Also force the Investigation criterion to NAO_CUMPRIDO if it exists
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        const name = String(c.nome_criterio || '').toLowerCase()
        if (name.includes('investiga')) {
          if (c.status !== 'NAO_CUMPRIDO') {
            console.log(`[AI Analyzer] Panfleteiro: Forcing "${c.nome_criterio}" from ${c.status} to NAO_CUMPRIDO`)
            c.status = 'NAO_CUMPRIDO'
            c.pontos = 0.0
          }
        }
      })
    }
    if (calculatedScore > 40) {
      console.log(`[AI Analyzer] Stage 3 Panfleteiro: Capping score from ${calculatedScore} to 40`)
      calculatedScore = 40
    }
  }

  // Stage 4: HARD LIMIT — Falta de Controle (last seller msg doesn't end with question)
  if (chainOfThought.ultima_msg_vendedor_termina_com_pergunta === false) {
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        const name = String(c.nome_criterio || '').toLowerCase()
        if (name.includes('fechamento') || name.includes('condução') || name.includes('controle')) {
          if (c.status !== 'NAO_CUMPRIDO') {
            console.log(`[AI Analyzer] Falta de Controle: Forcing "${c.nome_criterio}" from ${c.status} to NAO_CUMPRIDO`)
            c.status = 'NAO_CUMPRIDO'
            c.pontos = 0.0
          }
        }
      })
    }
    // Recalculate after forcing criteria
    pointsObtained = 0
    totalApplicable = 0
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        if (c.status !== 'N_A') {
          totalApplicable += 1
          pointsObtained += c.pontos
        }
      })
    }
    if (totalApplicable > 0) {
      const recalculated = Math.round((pointsObtained / totalApplicable) * 100)
      // Only apply if lower (don't override panfleteiro cap)
      calculatedScore = Math.min(calculatedScore, recalculated)
    }
  }

  // Stage 5: HARD LIMIT — Falha Grave (-20 points each)
  const weaknesses: string[] = Array.isArray(analysisResult.weaknesses) ? analysisResult.weaknesses : []
  const falhaGraveCount = weaknesses.filter((w: string) => typeof w === 'string' && w.startsWith('FALHA GRAVE:')).length
  if (falhaGraveCount > 0) {
    const penalty = falhaGraveCount * 20
    console.log(`[AI Analyzer] Stage 5 Falha Grave: ${falhaGraveCount} found, penalty = -${penalty}`)
    calculatedScore -= penalty
  }

  // Stage 6: CLAMP — Ensure score is within [0, 100]
  calculatedScore = Math.max(0, Math.min(100, calculatedScore))

  // Assign final deterministic scores
  analysisResult.commercial_quality_score = calculatedScore
  analysisResult.overall_score = calculatedScore

  console.log(`[AI Analyzer] Final deterministic score for conversation ${conversationId}: ${calculatedScore}/100`)

  const scoresData = {
    commercial_quality_score: analysisResult.commercial_quality_score,
    response_time_score: analysisResult.response_time_score,
    criterios: analysisResult.criterios,
    criteria_evaluation: analysisResult.criterios, // duplicate for backward compatibility
    _raciocinio_previo: analysisResult._raciocinio_previo,
  }

  const { error: upsertError } = await supabase
    .from('analyses')
    .upsert({
      conversation_id: conversationId,
      overall_score: analysisResult.overall_score,
      scores: scoresData,
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

  // Step 5.5: Update debouncing columns
  try {
    const { error: debounceErr } = await supabase
      .from('conversations')
      .update({
        last_analyzed_at: new Date().toISOString(),
        message_count_at_analysis: messages.length,
      })
      .eq('id', conversationId)
    if (debounceErr) {
      console.error('[AI Analyzer] Failed to update debouncing columns:', debounceErr.message)
    }
  } catch (e) {
    console.error('[AI Analyzer] Error updating debouncing columns:', e)
  }

  // Dispatch WhatsApp Alert if score <= 50 and owner_whatsapp is configured
  if (analysisResult.overall_score <= 50 && ownerWhatsapp && instanceName) {
    const alertSent = convData?.alert_sent || false
    if (alertSent) {
      console.log(`[AI Analyzer] Low score alert already sent for conversation ${conversationId}. Skipping WhatsApp alert dispatch.`)
      return
    }

    console.log(`[AI Analyzer] Low score alert triggered (score: ${analysisResult.overall_score}) for organization ${orgName}. Sending alert to: ${ownerWhatsapp}`)
    try {
      let operatorName = 'Não atribuído'
      if (operatorId) {
        const { data: operatorData } = await supabase
          .from('operators')
          .select('name')
          .eq('id', operatorId)
          .maybeSingle()
        if (operatorData) {
          operatorName = operatorData.name
        }
      }

      const unfulfilled = (analysisResult.criterios || [])
        .filter((c: any) => c.status === 'NAO_CUMPRIDO' || c.status === 'PARCIAL')
        .map((c: any) => `• *${c.nome_criterio}*: ${c.justificativa}`)
        .join('\n')

      const alertText = `⚠️ *Alerta de Auditoria SupervisIA* ⚠️\n\n` +
        `Um atendimento foi avaliado com nota comercial baixa!\n\n` +
        `*Cliente:* ${clientPhone}\n` +
        `*Atendente Responsável:* ${operatorName}\n` +
        `*Nota Comercial:* ${analysisResult.overall_score}/100\n\n` +
        `*Itens do Playbook descumpridos:*\n${unfulfilled || 'Nenhum item comercial explícito listado.'}\n\n` +
        `*Resumo:* ${analysisResult.summary}\n\n` +
        `Acesse o painel para auditar o atendimento completo.`

      const cleanPhone = ownerWhatsapp.replace(/[^0-9]/g, '')
      const evolutionUrl = `${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${instanceName}`
      
      console.log(`[AI Analyzer] Sending request to Evolution API URL: ${evolutionUrl}`)
      const alertResp = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: alertText
        })
      })

      if (alertResp.ok) {
        console.log(`[AI Analyzer] WhatsApp alert dispatched successfully to ${cleanPhone}.`)
        const { error: updateErr } = await supabase
          .from('conversations')
          .update({ alert_sent: true })
          .eq('id', conversationId)
        
        if (updateErr) {
          console.error(`[AI Analyzer] Failed to update conversation alert_sent status:`, updateErr.message)
        } else {
          console.log(`[AI Analyzer] Updated conversation ${conversationId} alert_sent to true.`)
        }
      } else {
        const alertErrText = await alertResp.text()
        console.error(`[AI Analyzer] Evolution API failed to send alert (status ${alertResp.status}):`, alertErrText)
      }
    } catch (alertErr) {
      console.error('[AI Analyzer] Failed to send low-score WhatsApp alert:', alertErr)
    }
  }
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
