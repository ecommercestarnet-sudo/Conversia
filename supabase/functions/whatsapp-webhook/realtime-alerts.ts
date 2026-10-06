// Motor de Alertas em Tempo Real (Resgate de Vendas & Mentoria)
// -------------------------------------------------------------
// 1. REVISÃO DO SISTEMA DE TRAVAS (ANTI-SPAM INTELIGENTE):
//    - 1 alerta por tipo de infração ('panfletagem', 'objecao_ignorada', 'desistencia_passiva').
//    - Cooldown de no mínimo 15 minutos entre alertas na mesma conversa.
//    - MODO_TESTE: flag que, se true (no Playbook ou MODO_TESTE=true no ambiente), ignora as travas para validação manual.
// 2. DOIS MOTORES DE AVALIAÇÃO INDEPENDENTES:
//    - Gatilho de Processo (Imediato): Panfletagem de preço avaliada no momento do envio do vendedor,
//      sem depender de "conversa esfriar" e sem exigir objeção prévia do cliente.
//    - Gatilho de Objeção (Reativo): Avalia resposta à resistência explícita do cliente (imediata ou por varredura).
// 3. DISPARO DUPLO COM MENSAGENS DIFERENCIADAS (EVOLUTION API):
//    - Confiança >= 85% (ou rigor configurado):
//      A) Disparo para o GESTOR (supervisor_phone): Tom gerencial direto de auditoria.
//      B) Disparo para o VENDEDOR (seller_phone): Tom educacional, amigável e focado em mentoria rápida
//         (sem termos punitivos), com "💡 Dica Rápida do Treinador", "Por que ajustar isso agora" e "O que mandar agora".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SB = ReturnType<typeof createClient>

export type Infracao = 'panfletagem' | 'objecao_ignorada' | 'desistencia_passiva' | 'lead_sem_resposta' | 'nenhuma'

interface AlertRules {
  alert_on_price_unhandled: boolean
  alert_on_dry_price: boolean
  alert_on_drop_unhandled: boolean
  alert_on_unanswered_lead?: boolean
  min_confidence_score: number
  wait_minutes_before_alert: number
  cooldown_minutes?: number
  modo_teste?: boolean
  alert_phone_override?: string
  default_seller_phone?: string
}

interface AiVerdict {
  contexto_atendimento?: 'venda_prospeccao' | 'cobranca_financeiro' | 'suporte_duvida' | 'pos_venda'
  eh_cobranca_ou_suporte?: boolean
  houve_investigacao_previa: boolean
  vendedor_enviou_precos: boolean
  vendedor_finalizou_com_pergunta: boolean
  infracao_detectada: Infracao
  disparar_alerta: boolean
  confianca: number
  motivo_resumido: string
  trecho_cliente?: string
  dica_treinador?: string
  por_que_ajustar?: string
  o_que_mandar_agora?: string
  acao_resgate?: string
}

interface Msg { id: string; sender_type: string; content: string; created_at: string }

interface EngineOpts {
  evolutionUrl: string
  evolutionKey: string
  mode: 'message' | 'sweep'
}

const DEFAULT_RULES: AlertRules = {
  alert_on_price_unhandled: true,
  alert_on_dry_price: true,
  alert_on_drop_unhandled: true,
  alert_on_unanswered_lead: true,
  min_confidence_score: 85,
  wait_minutes_before_alert: 5,
  cooldown_minutes: 15,
  modo_teste: true,
  alert_phone_override: '',
  default_seller_phone: '',
}

// Detecta valores monetários: "R$ 189", "189,90", "189 reais", "por mês"
const PRICE_REGEX = /(r\$\s?\d)|(\b\d{2,5}[.,]\d{2}\b)|(\b\d{2,5}\s?reais\b)|(\b\d{2,5}\s?(\/|por)\s?m[eê]s\b)/i
// Termina com "?" (ignorando emojis/espaços/pontuação final)
const ENDS_WITH_QUESTION = /\?[^a-zA-Z0-9À-ÿ]*$/

const isAgent = (m: Msg) => m.sender_type === 'agent' || m.sender_type === 'atendente'

const RULE_BY_INFRACAO: Record<Exclude<Infracao, 'nenhuma'>, keyof AlertRules> = {
  panfletagem: 'alert_on_dry_price',
  objecao_ignorada: 'alert_on_price_unhandled',
  desistencia_passiva: 'alert_on_drop_unhandled',
  lead_sem_resposta: 'alert_on_unanswered_lead',
}

const LABEL_BY_INFRACAO: Record<Exclude<Infracao, 'nenhuma'>, string> = {
  panfletagem: 'Envio de Preço sem Diagnóstico / sem Pergunta de Fechamento',
  objecao_ignorada: 'Objeção do Cliente Ignorada ou Abandonada',
  desistencia_passiva: 'Desistência Aceita sem Tentativa de Retenção',
  lead_sem_resposta: 'Lead Aguardando Resposta do Atendente (Tempo Excedido)',
}

function getOpenAiKey(): string | null {
  const k = Deno.env.get('OPENAI_API_KEY')
  return k && k.startsWith('sk-') ? k : null
}

function isEnvModoTeste(): boolean {
  const envVal = (Deno.env.get('MODO_TESTE') || '').toLowerCase().trim()
  return envVal === 'true' || envVal === '1' || envVal === 'yes'
}

export async function runRealtimeAlertEngine(supabase: SB, conversationId: string, opts: EngineOpts) {
  const tag = `[RealtimeAlert ${conversationId}]`

  // 1. Histórico recente (últimas 20 mensagens)
  const { data: recentDesc, error: msgErr } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (msgErr || !recentDesc || recentDesc.length === 0) return
  const messages = (recentDesc as Msg[]).reverse()
  const sellerSpoke = messages.some(isAgent)

  // 2. Dados da Conversa
  let conv: any = null
  let hasAlertsSentColumn = true
  let hasLastAlertAtColumn = true

  const convRes = await supabase
    .from('conversations')
    .select('organization_id, client_phone, operator_id, alert_sent, alerts_sent, last_alert_at')
    .eq('id', conversationId)
    .maybeSingle()

  if (convRes.error) {
    // Fallback caso colunas da migração ainda não tenham sido criadas
    hasAlertsSentColumn = false
    hasLastAlertAtColumn = false
    const fb = await supabase
      .from('conversations')
      .select('organization_id, client_phone, operator_id, alert_sent')
      .eq('id', conversationId)
      .maybeSingle()
    conv = fb.data
  } else {
    conv = convRes.data
  }

  if (!conv?.organization_id) return

  // 3. Organização + Playbook
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, evolution_instance_name, owner_whatsapp')
    .eq('id', conv.organization_id)
    .maybeSingle()
  if (!org?.evolution_instance_name) return

  const { data: playbook } = await supabase
    .from('ai_playbooks')
    .select('company_context, evaluation_criteria, custom_prompt, alert_rules')
    .eq('organization_id', conv.organization_id)
    .maybeSingle()

  const rules: AlertRules = { ...DEFAULT_RULES, ...((playbook as any)?.alert_rules || {}) }
  const anyRuleOn = rules.alert_on_dry_price || rules.alert_on_price_unhandled || rules.alert_on_drop_unhandled || rules.alert_on_unanswered_lead !== false
  if (!anyRuleOn) return

  const modoTesteAtivo = rules.modo_teste === true || isEnvModoTeste()
  if (modoTesteAtivo) {
    console.log(`${tag} 🧪 MODO TESTE ATIVO: travas anti-spam (1 alerta por tipo e cooldown) serão ignoradas.`)
  }

  // 4. Checagem Anti-Spam: Cooldown de 15 minutos entre alertas na mesma conversa
  const cooldownMin = rules.cooldown_minutes ?? 15
  if (!modoTesteAtivo && hasLastAlertAtColumn && conv.last_alert_at) {
    const elapsedMinutes = (Date.now() - new Date(conv.last_alert_at).getTime()) / 60000
    if (elapsedMinutes < cooldownMin) {
      console.log(`${tag} Cooldown ativo (${elapsedMinutes.toFixed(1)} min < ${cooldownMin} min). Disparo suprimido.`)
      return
    }
  }

  // Telefones destino
  const supervisorPhone = (rules.alert_phone_override || '').trim() || org.owner_whatsapp
  if (!supervisorPhone) {
    console.warn(`${tag} Telefone do gestor/supervisor não configurado.`)
    return
  }
  const cleanSupervisor = supervisorPhone.replace(/\D/g, '')

  // Extrai os últimos 8 dígitos (número base sem DDD e sem 9º dígito móvel)
  const getLast8 = (num: string) => {
    const digits = String(num || '').replace(/\D/g, '')
    return digits.length >= 8 ? digits.slice(-8) : digits
  }

  const sameNumber = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a || !b) return false
    const cleanA = String(a).replace(/\D/g, '')
    const cleanB = String(b).replace(/\D/g, '')
    if (cleanA === cleanB) return true
    const l8A = getLast8(cleanA)
    const l8B = getLast8(cleanB)
    return l8A.length === 8 && l8A === l8B
  }

  // Busca todos os números de atendentes/operadores da empresa para evitar loop/eco interno
  const { data: allOps } = await supabase
    .from('operators')
    .select('phone, whatsapp')
    .eq('company_id', conv.organization_id)

  const internalNumbers = new Set<string>()
  if (supervisorPhone) internalNumbers.add(cleanSupervisor)
  if (org.owner_whatsapp) internalNumbers.add(String(org.owner_whatsapp).replace(/\D/g, ''))
  if (rules.default_seller_phone) internalNumbers.add(String(rules.default_seller_phone).replace(/\D/g, ''))

  if (allOps && allOps.length > 0) {
    allOps.forEach((op: any) => {
      if (op.whatsapp) internalNumbers.add(String(op.whatsapp).replace(/\D/g, ''))
      if (op.phone) internalNumbers.add(String(op.phone).replace(/\D/g, ''))
    })
  }

  const cleanClient = String(conv.client_phone || '').replace(/\D/g, '')

  const clientLast8 = getLast8(cleanClient)
  const isInternalParty = Array.from(internalNumbers).some(internal => {
    if (!internal) return false
    const internalClean = internal.replace(/\D/g, '')
    if (cleanClient === internalClean) return true
    // Se ambos tiverem pelo menos 8 dígitos, compara os últimos 8 dígitos exatos
    return clientLast8.length === 8 && getLast8(internalClean) === clientLast8
  })

  if (isInternalParty) {
    console.log(`${tag} Conversa ignorada: número do lead (${cleanClient}) pertence à equipe interna (gestor ou atendente).`)
    return
  }

  // 5. Contexto determinístico
  const last = messages[messages.length - 1]
  const lastSender: 'vendedor' | 'cliente' = isAgent(last) ? 'vendedor' : 'cliente'
  const minutesSinceLast = (Date.now() - new Date(last.created_at).getTime()) / 60000

  // Se o vendedor nunca falou e o cliente enviou mensagem
  if (!sellerSpoke) {
    // Só avalia se já passou o tempo de tolerância (seja em sweep ou após espera)
    if (lastSender === 'cliente' && minutesSinceLast >= (rules.wait_minutes_before_alert ?? 5)) {
      // Candidato a lead sem resposta
    } else {
      console.log(`${tag} Vendedor ainda não falou e cliente mandou msg há apenas ${minutesSinceLast.toFixed(1)} min. Aguardando.`)
      return
    }
  }

  // Bloco atual do vendedor = mensagens do vendedor após a última mensagem do cliente
  let lastClientIdx = -1
  messages.forEach((m, i) => { if (!isAgent(m)) lastClientIdx = i })
  const agentBlock = messages.slice(lastClientIdx + 1).filter(isAgent)
  const blockHasPriceRegex = agentBlock.some(m => PRICE_REGEX.test(m.content || ''))
  const lastAgentEndsWithQuestion = lastSender === 'vendedor' && ENDS_WITH_QUESTION.test((last.content || '').trim())

  const objectionRulesOn = rules.alert_on_price_unhandled || rules.alert_on_drop_unhandled
  const processCandidate = rules.alert_on_dry_price && lastSender === 'vendedor' && blockHasPriceRegex

  let objectionCandidate = false
  if (objectionRulesOn) {
    if (lastSender === 'vendedor') objectionCandidate = true // vendedor respondeu: avaliar a qualidade da resposta
    else if (opts.mode === 'sweep' && minutesSinceLast >= rules.wait_minutes_before_alert) objectionCandidate = true // vendedor não respondeu
  }

  // Candidato a Lead Sem Resposta (seja 1ª mensagem ou no meio da conversa)
  const unansweredCandidate = rules.alert_on_unanswered_lead !== false &&
    lastSender === 'cliente' &&
    minutesSinceLast >= (rules.wait_minutes_before_alert ?? 5)

  if (!processCandidate && !objectionCandidate && !unansweredCandidate) {
    console.log(`${tag} Sem candidato a alerta (lastSender=${lastSender}, preço=${blockHasPriceRegex}, unanswered=${unansweredCandidate}, mode=${opts.mode}).`)
    return
  }

  // Trava 1: Alerta por tipo de infração ('panfletagem', 'objecao_ignorada', 'desistencia_passiva')
  const rawSent: string[] = hasAlertsSentColumn
    ? (Array.isArray(conv.alerts_sent) ? conv.alerts_sent : [])
    : (conv.alert_sent ? ['panfletagem', 'objecao_ignorada', 'desistencia_passiva'] : [])

  // Normalização caso algum registro antigo tenha salvo 'objecao_abandonada'
  const alreadySent: string[] = rawSent.map(t => t === 'objecao_abandonada' ? 'objecao_ignorada' : t)

  // 6. IA com saída estruturada (Chain of Thought e mentoria)
  const openAiKey = getOpenAiKey()
  if (!openAiKey) { console.warn(`${tag} OPENAI_API_KEY ausente.`); return }

  const verdict = await askAi(openAiKey, {
    messages, lastClientIdx, rules, lastSender, minutesSinceLast, playbook: playbook as any,
  })
  if (!verdict) return
  console.log(`${tag} Veredito IA:`, JSON.stringify(verdict))

  // 7. Validação determinística (o código tem a palavra final)
  // Confiança mínima exigida: 85% (ou a configurada no Playbook)
  const minConfidenceRequired = Math.max(85, rules.min_confidence_score || 85)
  const confidenceOk = (verdict.confianca ?? 0) >= minConfidenceRequired
  let finalInfracao: Infracao = 'nenhuma'

  let normalizedVerdictInfracao = verdict.infracao_detectada
  if ((normalizedVerdictInfracao as any) === 'objecao_abandonada') {
    normalizedVerdictInfracao = 'objecao_ignorada'
  }

  const isObjectionType = normalizedVerdictInfracao === 'objecao_ignorada' || normalizedVerdictInfracao === 'desistencia_passiva'

  if (objectionCandidate && isObjectionType && verdict.disparar_alerta && confidenceOk && rules[RULE_BY_INFRACAO[normalizedVerdictInfracao]]) {
    finalInfracao = normalizedVerdictInfracao
  } else if (unansweredCandidate && (normalizedVerdictInfracao === 'lead_sem_resposta' || lastSender === 'cliente')) {
    // Lead sem resposta: o cliente mandou mensagem (1ª msg ou réplica) e vendedor não respondeu no prazo
    if (rules.alert_on_unanswered_lead !== false) {
      finalInfracao = 'lead_sem_resposta'
    }
  } else if (processCandidate) {
    // Se a IA detectou que é cobrança/suporte/pós-venda ou não é contexto de venda, suprime panfletagem
    const ehCobrancaOuSuporte = verdict.eh_cobranca_ou_suporte === true || 
      verdict.contexto_atendimento === 'cobranca_financeiro' || 
      verdict.contexto_atendimento === 'suporte_duvida' || 
      verdict.contexto_atendimento === 'pos_venda'

    if (ehCobrancaOuSuporte) {
      console.log(`${tag} Mensagem contextualizada como cobrança/suporte/pós-venda (${verdict.contexto_atendimento}). Panfletagem e alertas de venda desconsiderados.`)
    } else {
      // Panfletagem de Preço: Regra de processo imediata para prospecção/venda.
      // Preço enviado + (sem investigação prévia OU sem finalizar com pergunta de agendamento/visita)
      const enviouPrecos = blockHasPriceRegex || verdict.vendedor_enviou_precos === true
      const finalizouComPergunta = lastAgentEndsWithQuestion && verdict.vendedor_finalizou_com_pergunta === true
      const semDiagnostico = verdict.houve_investigacao_previa === false
      const infracaoProcesso = enviouPrecos && (semDiagnostico || !finalizouComPergunta)
      const objectiveOnly = !lastAgentEndsWithQuestion // falta de pontuação/pergunta é fato objetivo
      if (infracaoProcesso && (objectiveOnly || confidenceOk) && verdict.disparar_alerta !== false) {
        finalInfracao = 'panfletagem'
      }
    }
  }

  if (finalInfracao === 'nenhuma') {
    console.log(`${tag} Nenhuma infração validada (confiança=${verdict.confianca}, exigido=${minConfidenceRequired}).`)
    return
  }

  // Trava anti-spam por tipo de infração (ignorada se MODO_TESTE estiver ativo)
  if (!modoTesteAtivo && alreadySent.includes(finalInfracao)) {
    console.log(`${tag} Infração '${finalInfracao}' já enviada anteriormente nesta conversa. Trava anti-spam ativa.`)
    return
  }

  // 8. Buscar Dados do Atendente / Vendedor
  let operatorName = 'Não atribuído'
  let sellerPhone: string | null = null

  if (conv.operator_id) {
    const { data: op } = await supabase
      .from('operators')
      .select('name, phone, whatsapp')
      .eq('id', conv.operator_id)
      .maybeSingle()
    if (op) {
      if (op.name) operatorName = op.name
      const opRaw = op.whatsapp || op.phone
      if (opRaw) sellerPhone = String(opRaw).replace(/\D/g, '')
    }
  }

  if (!sellerPhone || operatorName === 'Não atribuído') {
    if (!sellerPhone && rules.default_seller_phone && rules.default_seller_phone.trim()) {
      sellerPhone = rules.default_seller_phone.replace(/\D/g, '')
    }

    // Busca operador cadastrado na empresa para nome e telefone de fallback
    const { data: fallbackOps } = await supabase
      .from('operators')
      .select('name, phone, whatsapp')
      .eq('company_id', conv.organization_id)
      .limit(5)

    if (fallbackOps && fallbackOps.length > 0) {
      // Prioriza o que tem whatsapp ou telefone
      const opWithPhone = fallbackOps.find((o: any) => o.whatsapp || o.phone) || fallbackOps[0]
      if (operatorName === 'Não atribuído' && opWithPhone.name) {
        operatorName = opWithPhone.name
      }
      if (!sellerPhone) {
        const opRaw = opWithPhone.whatsapp || opWithPhone.phone
        if (opRaw) sellerPhone = String(opRaw).replace(/\D/g, '')
      }
    }
  }

  // Prepara os textos de apoio e sugestão pronta
  const isProcess = finalInfracao === 'panfletagem'
  const falhaNome = LABEL_BY_INFRACAO[finalInfracao]
  const sugestao = verdict.o_que_mandar_agora || verdict.acao_resgate || ''
  const resumo = verdict.motivo_resumido || '-'
  const leadPhone = conv.client_phone || 'Cliente'
  const sellerName = operatorName || 'Atendente'
  const confidence = verdict.confianca || 85

  const baseUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://conversia.app'
  const tenantSlug = org.slug || 'empresa'
  const linkPainel = `${baseUrl}/${tenantSlug}/dashboard`

  const clientDigits = String(conv.client_phone || '').replace(/\D/g, '')
  const waDirectLink = clientDigits ? `https://wa.me/${clientDigits}` : ''

  const checklist = isProcess
    ? `${verdict.houve_investigacao_previa ? '✅' : '❌'} Identificou o objetivo antes do preço\n` +
      `${lastAgentEndsWithQuestion && verdict.vendedor_finalizou_com_pergunta ? '✅' : '❌'} Finalizou com convite (visita/aula experimental/agendamento)`
    : finalInfracao === 'lead_sem_resposta'
      ? `⏳ Lead aguardando resposta há mais de ${Math.round(minutesSinceLast)} min\n` +
        `❌ Nenhum atendente respondeu a mensagem ainda`
      : `${verdict.trecho_cliente ? `💬 Cliente disse: "${verdict.trecho_cliente}"\n` : ''}` +
        `❌ Objeção abandonada ou tratada com passividade sem contorno de valor`

  // =========================================================================
  // 1. Mensagem Unificada de Alerta e Resgate (Gestor + Vendedor)
  // =========================================================================
  const pontoDeAtencao = isProcess
    ? 'Envio de valor antes de identificar o objetivo do aluno ou sem pergunta de agendamento.'
    : (verdict.trecho_cliente ? `Objeção apresentada pelo cliente: "${verdict.trecho_cliente}".` : 'Objeção do cliente não contornada.')

  const dicaConducao = verdict.dica_treinador || (isProcess
    ? 'Descubra a dor/meta do aluno antes de passar valores e finalize com um convite para visita ou aula experimental.'
    : 'Acolha a preocupação, gere valor sobre os resultados e ofereça uma alternativa prática de dia/horário.')

  const mensagemUnificada =
    `🚨 *ConversIA • ${isProcess ? 'Falha de Processo Comercial' : finalInfracao === 'lead_sem_resposta' ? 'Lead Parado sem Resposta' : 'Alerta de Venda em Risco'}*\n\n` +
    `👤 *Lead:* ${leadPhone}\n` +
    `🏋️ *Atendente:* ${sellerName}\n` +
    `📊 *Confiança:* ${confidence}%\n` +
    `❌ *Situação:* ${falhaNome}\n` +
    `📝 *Resumo:* ${resumo}\n\n` +
    `📋 *Diagnóstico:*\n${checklist}\n\n` +
    `💡 *Dica de Condução:*\n${dicaConducao}\n\n` +
    (sugestao ? `🎯 *Copie e envie agora para o cliente:*\n"${sugestao}"\n\n` : '') +
    (waDirectLink ? `📲 *Falar com o cliente agora:*\n${waDirectLink}\n\n` : '') +
    `👉 *Painel:* ${linkPainel}`

  // =========================================================================
  // 2. Disparo Único para o GESTOR (supervisor_phone)
  // =========================================================================
  console.log(`${tag} Enviando alerta unificado para o gestor em ${cleanSupervisor}...`)
  const supervisorResp = await fetch(`${opts.evolutionUrl.replace(/\/$/, '')}/message/sendText/${org.evolution_instance_name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: opts.evolutionKey },
    body: JSON.stringify({ number: cleanSupervisor, text: mensagemUnificada }),
  })

  if (!supervisorResp.ok) {
    console.error(`${tag} Falha ao enviar alerta unificado (${supervisorResp.status}):`, await supervisorResp.text())
  } else {
    console.log(`${tag} Alerta unificado enviado com sucesso para ${cleanSupervisor}.`)
  }

  // Atualiza banco de dados com registro do alerta e timestamp para cooldown
  const updateData: Record<string, unknown> = {
    alert_sent: true,
    last_alert_at: new Date().toISOString(),
  }
  if (hasAlertsSentColumn) {
    updateData.alerts_sent = [...alreadySent, finalInfracao]
  }

  await supabase.from('conversations').update(updateData).eq('id', conversationId)
}

async function askAi(apiKey: string, ctx: {
  messages: Msg[]; lastClientIdx: number; rules: AlertRules; lastSender: string; minutesSinceLast: number;
  playbook: { company_context?: string; evaluation_criteria?: string; custom_prompt?: string } | null
}): Promise<AiVerdict | null> {
  const { messages, lastClientIdx, rules, lastSender, minutesSinceLast, playbook } = ctx
  const trim = (s?: string, n = 2500) => (s || '').slice(0, n)

  const activeRules = [
    rules.alert_on_dry_price && '- PANFLETAGEM (processo imediato): envio de preços/valores sem diagnóstico prévio do objetivo do cliente OU sem terminar com pergunta de convite/agendamento.',
    rules.alert_on_price_unhandled && '- OBJEÇÃO IGNORADA (reativo): cliente manifestou resistência (preço, tempo, concorrente, distância) e o atendente foi passivo, frio ou não contornou.',
    rules.alert_on_drop_unhandled && '- DESISTÊNCIA PASSIVA (reativo): cliente declarou desistência e o atendente aceitou sem tentar reter.',
    (rules.alert_on_unanswered_lead !== false) && '- LEAD SEM RESPOSTA (tempo excedido): o cliente enviou mensagem (primeiro contato, pergunta sobre planos/horários ou réplica) e o vendedor não respondeu no prazo.',
  ].filter(Boolean).join('\n')

  const history = messages.map((m, i) => {
    const who = isAgent(m) ? 'vendedor' : 'cliente'
    const marker = i > lastClientIdx && isAgent(m) ? '>> ' : ''
    return `${marker}[${who}]: ${m.content}`
  }).join('\n')

  const system = `Você é um auditor comercial sênior e mentor de vendas de alta performance. Avalie o histórico recente e responda ESTRITAMENTE com um objeto JSON válido.
 
- CLASSIFICAÇÃO CRÍTICA DO CONTEXTO DO ATENDIMENTO:
Antes de avaliar qualquer regra comercial, identifique a natureza da conversa:
1. "venda_prospeccao": O lead está buscando informações sobre planos, matrículas, cursos ou serviços para comprar/contratar.
2. "cobranca_financeiro": O atendente está tratando de pagamentos, cobrança de mensalidade/parcela atrasada, lembrete de vencimento, envio de boleto/chave PIX ou acerto financeiro de cliente já ativo.
3. "suporte_duvida": O cliente já é aluno/cliente e está tirando dúvidas de uso, horários, acesso ao sistema, agendamento de treino, etc.
4. "pos_venda": Atendimento de relacionamento e acompanhamento de cliente existente.

⚠️ REGRA DE OURO PARA COBRANÇA, FINANCEIRO E SUPORTE:
Se o atendimento for classificado como "cobranca_financeiro", "suporte_duvida" ou "pos_venda" (ou se a mensagem do vendedor for cobrança de parcela/mensalidade/acerto de valores devidos):
- Enviar valores monetários, parcelas ou taxas NÃO É PANFLETAGEM. É a obrigação do atendente/financeiro!
- NUNCA classifique como "panfletagem" nem dispare alertas de falta de investigação/agendamento de visita para mensagens de cobrança.
- Defina "infracao_detectada": "nenhuma", "disparar_alerta": false, "eh_cobranca_ou_suporte": true.

REGRAS ATIVAS NO PLAYBOOK (APLICÁVEIS APENAS PARA "venda_prospeccao"):
${activeRules}

CHECKLIST BINÁRIO OBRIGATÓRIO DE ENVIO DE PREÇO (GATILHO DE PROCESSO IMEDIATO PARA VENDAS):
1. O vendedor só pode enviar valores após identificar a necessidade/dor/objetivo do aluno no histórico.
2. Toda mensagem contendo preço/valores DEVE obrigatoriamente terminar com uma pergunta de convite (visita à academia, agendamento de aula experimental ou matrícula).
Se o vendedor violar o item 1 ou 2 em um contexto de VENDA, classifique como "panfletagem", mesmo sem objeção do cliente e sem a conversa ter esfriado.

GATILHO DE RESISTÊNCIA, CANCELAMENTO E DESISTÊNCIA PASSIVA (REATIVO):
Considere infração grave ("desistencia_passiva" ou "objecao_ignorada") sempre que o lead apresentar QUALQUER barreira, objeção, cancelamento ou desculpa (seja distância como "é muito longe", falta de tempo, preço/caro, desânimo, imprevisto de última hora, chuva, concorrente) e o atendente aceitar passivamente (ex: "entendo", "se mudar de ideia avisa", "tudo bem", "ok", "estamos à disposição", "qualquer coisa me chama") SEM tentar pelo menos uma alternativa ativa de retenção ou solução (ex: flexibilizar dia/horário, propor aula no sábado, reforçar benefício da visita sem compromisso, acolher a dificuldade e oferecer solução).
Toda desistência ou cancelamento aceito passivamente sem tentativa de reter o lead DEVE disparar alerta ("disparar_alerta": true, "infracao_detectada": "desistencia_passiva").

GATILHO DE LEAD SEM RESPOSTA / PARADO:
Se a última mensagem foi do cliente (seja primeiro contato ou dúvida) e o vendedor ainda não respondeu, classifique como "lead_sem_resposta".

AVALIE RIGOROSAMENTE CADA CAMPO:
1. "contexto_atendimento": "venda_prospeccao" | "cobranca_financeiro" | "suporte_duvida" | "pos_venda".
2. "eh_cobranca_ou_suporte": boolean - true se for cobrança, financeiro, suporte técnico ou dúvidas de aluno já ativo.
3. "houve_investigacao_previa": boolean - true se o objetivo ou necessidade do cliente já havia sido identificado antes do vendedor mandar valores.
4. "vendedor_enviou_precos": boolean - true se o vendedor informou preços, valores numéricos de novos planos nas mensagens com ">>".
5. "vendedor_finalizou_com_pergunta": boolean - true se a última mensagem do vendedor termina com pergunta de avanço comercial (agendar visita, aula experimental, matrícula). Perguntas vazias como "tudo bem?", "qualquer dúvida avisa" = false.
6. "infracao_detectada": "panfletagem" | "objecao_ignorada" | "desistencia_passiva" | "lead_sem_resposta" | "nenhuma".
   Prioridade: Se eh_cobranca_ou_suporte for true -> "nenhuma".
   Caso contrário: objecao_ignorada / desistencia_passiva > panfletagem > lead_sem_resposta.
7. "disparar_alerta": boolean - true se houver infração comprovada de acordo com as regras ativas. NUNCA true se for cobrança/suporte.
8. "confianca": number de 0 a 100 indicando sua certeza. Mantenha >= 85 se a regra objetiva for cumprida.
9. "motivo_resumido": string - Frase concisa para o gestor descrevendo a falha exata (ex: "Vendedor passou valores do plano anual sem investigar o objetivo do aluno").
10. "trecho_cliente": string - Fala exata do cliente com a objeção (ou "" se for panfletagem).
11. "dica_treinador": string - Frase construtiva e amigável para o vendedor explicando o que melhorar de forma pedagógica (sem usar palavras punitivas como "infração", "falha" ou "penalidade").
12. "por_que_ajustar": string - Breve explicação do impacto comercial.
13. "o_que_mandar_agora": string - Sugestão pronta de mensagem (copia e cola) extremamente persuasiva, natural e simpática para o vendedor mandar AGORA ao cliente e retomar o diálogo.

FORMATO ESTRITO DO JSON:
{
  "contexto_atendimento": "venda_prospeccao",
  "eh_cobranca_ou_suporte": false,
  "houve_investigacao_previa": false,
  "vendedor_enviou_precos": false,
  "vendedor_finalizou_com_pergunta": false,
  "infracao_detectada": "nenhuma",
  "disparar_alerta": false,
  "confianca": 0,
  "motivo_resumido": "",
  "trecho_cliente": "",
  "dica_treinador": "",
  "por_que_ajustar": "",
  "o_que_mandar_agora": ""
}

CONTEXTO DA EMPRESA:
${trim(playbook?.company_context, 1500)}

CRITÉRIOS DO PLAYBOOK:
${trim(playbook?.evaluation_criteria)}

INSTRUÇÕES EXTRAS:
${trim(playbook?.custom_prompt)}`

  const user = `Última mensagem enviada por: ${lastSender} (há ${minutesSinceLast.toFixed(1)} min).
Linhas com ">>" = bloco atual do vendedor (após a última fala do cliente).

HISTÓRICO RECENTE:
${history}`

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    if (!r.ok) { console.error('[RealtimeAlert] OpenAI error:', r.status, await r.text()); return null }
    const j = await r.json()
    const content = j.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content) as AiVerdict
  } catch (e) {
    console.error('[RealtimeAlert] Falha na chamada à IA:', e)
    return null
  }
}

// Varredura periódica para objeções que ficaram sem resposta do vendedor após o tempo de tolerância
export async function sweepPendingObjectionAlerts(supabase: SB, opts: Omit<EngineOpts, 'mode'>) {
  const since = new Date(Date.now() - 60 * 60000).toISOString() // última 1h
  const { data } = await supabase
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (!data) return { checked: 0 }

  const latestByConv = new Map<string, { sender_type: string; created_at: string }>()
  for (const m of data as any[]) if (!latestByConv.has(m.conversation_id)) latestByConv.set(m.conversation_id, m)

  let checked = 0
  for (const [convId, m] of latestByConv) {
    const isClient = !(m.sender_type === 'agent' || m.sender_type === 'atendente')
    const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60000
    if (isClient && ageMin >= 2 && ageMin <= 60) {
      checked++
      try { await runRealtimeAlertEngine(supabase, convId, { ...opts, mode: 'sweep' }) }
      catch (e) { console.error('[Sweep] erro', convId, e) }
    }
  }
  return { checked }
}
