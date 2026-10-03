// Motor de Alertas em Tempo Real (Resgate de Vendas)
// ---------------------------------------------------
// Independente da auditoria/nota. Dois gatilhos:
//  1. PROCESSO (imediato): conduta do vendedor ao enviar preço (panfletagem). Não exige objeção.
//  2. OBJEÇÃO (reativo): resposta do vendedor diante de resistência explícita do cliente.
//     - Se o vendedor respondeu mal: alerta imediato.
//     - Se o vendedor NÃO respondeu: alerta via varredura (sweep) após o tempo de tolerância.
// Decisão final = IA (booleans estruturados) + validação determinística no código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SB = ReturnType<typeof createClient>

export type Infracao = 'panfletagem' | 'objecao_abandonada' | 'desistencia_passiva' | 'nenhuma'

interface AlertRules {
  alert_on_price_unhandled: boolean
  alert_on_dry_price: boolean
  alert_on_drop_unhandled: boolean
  min_confidence_score: number
  wait_minutes_before_alert: number
  alert_phone_override?: string
}

interface AiVerdict {
  houve_investigacao_previa: boolean
  vendedor_enviou_precos: boolean
  vendedor_finalizou_com_pergunta: boolean
  infracao_detectada: Infracao
  disparar_alerta: boolean
  confianca: number
  motivo_resumido: string
  trecho_cliente?: string
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
  min_confidence_score: 85,
  wait_minutes_before_alert: 5,
  alert_phone_override: '',
}

// Detecta valores monetários: "R$ 189", "189,90", "189 reais", "por mês"
const PRICE_REGEX = /(r\$\s?\d)|(\b\d{2,5}[.,]\d{2}\b)|(\b\d{2,5}\s?reais\b)|(\b\d{2,5}\s?(\/|por)\s?m[eê]s\b)/i
// Termina com "?" (ignorando emojis/espaços/pontuação final)
const ENDS_WITH_QUESTION = /\?[^a-zA-Z0-9À-ÿ]*$/

const isAgent = (m: Msg) => m.sender_type === 'agent' || m.sender_type === 'atendente'

const RULE_BY_INFRACAO: Record<Exclude<Infracao, 'nenhuma'>, keyof AlertRules> = {
  panfletagem: 'alert_on_dry_price',
  objecao_abandonada: 'alert_on_price_unhandled',
  desistencia_passiva: 'alert_on_drop_unhandled',
}

const LABEL_BY_INFRACAO: Record<Exclude<Infracao, 'nenhuma'>, string> = {
  panfletagem: 'Envio de Preço sem Diagnóstico / sem Pergunta de Fechamento',
  objecao_abandonada: 'Objeção do Cliente sem Contorno',
  desistencia_passiva: 'Desistência Aceita sem Tentativa de Retenção',
}

function getOpenAiKey(): string | null {
  const k = Deno.env.get('OPENAI_API_KEY')
  return k && k.startsWith('sk-') ? k : null
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
  if (!messages.some(isAgent)) return // vendedor ainda não falou nada

  // 2. Conversa (com fallback se a coluna alerts_sent ainda não existir)
  let conv: any = null
  let hasAlertsSentColumn = true
  const convRes = await supabase
    .from('conversations')
    .select('organization_id, client_phone, operator_id, alert_sent, alerts_sent')
    .eq('id', conversationId)
    .maybeSingle()
  if (convRes.error) {
    hasAlertsSentColumn = false
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
    .select('id, name, evolution_instance_name, owner_whatsapp')
    .eq('id', conv.organization_id)
    .maybeSingle()
  if (!org?.evolution_instance_name) return

  const { data: playbook } = await supabase
    .from('ai_playbooks')
    .select('company_context, evaluation_criteria, custom_prompt, alert_rules')
    .eq('organization_id', conv.organization_id)
    .maybeSingle()

  const rules: AlertRules = { ...DEFAULT_RULES, ...((playbook as any)?.alert_rules || {}) }
  const anyRuleOn = rules.alert_on_dry_price || rules.alert_on_price_unhandled || rules.alert_on_drop_unhandled
  if (!anyRuleOn) return

  const targetPhone = (rules.alert_phone_override || '').trim() || org.owner_whatsapp
  if (!targetPhone) return

  // Nunca auditar a conversa com o próprio dono/gestor (evita loop com o próprio alerta)
  const cleanClient = String(conv.client_phone || '').replace(/\D/g, '')
  const cleanTarget = String(targetPhone).replace(/\D/g, '')
  const cleanOwner = String(org.owner_whatsapp || '').replace(/\D/g, '')
  const sameNumber = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a))
  if (sameNumber(cleanClient, cleanTarget) || sameNumber(cleanClient, cleanOwner)) return

  // 4. Contexto determinístico
  const last = messages[messages.length - 1]
  const lastSender: 'vendedor' | 'cliente' = isAgent(last) ? 'vendedor' : 'cliente'
  const minutesSinceLast = (Date.now() - new Date(last.created_at).getTime()) / 60000

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

  if (!processCandidate && !objectionCandidate) {
    console.log(`${tag} Sem candidato a alerta (lastSender=${lastSender}, preço=${blockHasPriceRegex}, mode=${opts.mode}).`)
    return
  }

  const alreadySent: string[] = hasAlertsSentColumn
    ? (Array.isArray(conv.alerts_sent) ? conv.alerts_sent : [])
    : (conv.alert_sent ? ['panfletagem', 'objecao_abandonada', 'desistencia_passiva'] : [])

  // 5. IA com saída estruturada
  const openAiKey = getOpenAiKey()
  if (!openAiKey) { console.warn(`${tag} OPENAI_API_KEY ausente.`); return }

  const verdict = await askAi(openAiKey, {
    messages, lastClientIdx, rules, lastSender, minutesSinceLast, playbook: playbook as any,
  })
  if (!verdict) return
  console.log(`${tag} Veredito IA:`, JSON.stringify(verdict))

  // 6. Validação determinística (o código tem a palavra final)
  const confidenceOk = (verdict.confianca ?? 0) >= rules.min_confidence_score
  let finalInfracao: Infracao = 'nenhuma'

  const objectionType = verdict.infracao_detectada === 'objecao_abandonada' || verdict.infracao_detectada === 'desistencia_passiva'
    ? verdict.infracao_detectada : null

  if (objectionCandidate && objectionType && verdict.disparar_alerta && confidenceOk && rules[RULE_BY_INFRACAO[objectionType]]) {
    finalInfracao = objectionType
  } else if (processCandidate) {
    // Panfletagem: regra binária. Preço detectado + (sem diagnóstico OU sem pergunta de fechamento)
    const enviouPrecos = blockHasPriceRegex || verdict.vendedor_enviou_precos === true
    const finalizouComPergunta = lastAgentEndsWithQuestion && verdict.vendedor_finalizou_com_pergunta === true
    const semDiagnostico = verdict.houve_investigacao_previa === false
    const infracaoProcesso = enviouPrecos && (semDiagnostico || !finalizouComPergunta)
    // Se o único problema é a falta de "?" (fato objetivo), não depende da confiança da IA
    const objectiveOnly = !lastAgentEndsWithQuestion
    if (infracaoProcesso && (objectiveOnly || confidenceOk)) finalInfracao = 'panfletagem'
  }

  if (finalInfracao === 'nenhuma') {
    console.log(`${tag} Nenhuma infração validada (confiança=${verdict.confianca}, min=${rules.min_confidence_score}).`)
    return
  }
  if (alreadySent.includes(finalInfracao)) {
    console.log(`${tag} Alerta '${finalInfracao}' já enviado nesta conversa. Ignorando.`)
    return
  }

  // 7. Envio
  let operatorName = 'Não atribuído'
  if (conv.operator_id) {
    const { data: op } = await supabase.from('operators').select('name').eq('id', conv.operator_id).maybeSingle()
    if (op?.name) operatorName = op.name
  }

  const isProcess = finalInfracao === 'panfletagem'
  const checklist = isProcess
    ? `\n📋 *Checklist de preço:*\n` +
      `${verdict.houve_investigacao_previa ? '✅' : '❌'} Identificou o objetivo antes do preço\n` +
      `${lastAgentEndsWithQuestion && verdict.vendedor_finalizou_com_pergunta ? '✅' : '❌'} Finalizou com convite (visita/aula experimental)\n`
    : ''

  const text =
    `🚨 *ConversIA • ${isProcess ? 'Falha de Processo Comercial' : 'Venda em Risco'}*\n\n` +
    `👤 *Cliente:* ${conv.client_phone}\n` +
    `🏋️ *Atendente:* ${operatorName}\n\n` +
    `❌ *Infração:* ${LABEL_BY_INFRACAO[finalInfracao]}\n` +
    (verdict.trecho_cliente && !isProcess ? `💬 *Cliente disse:* "${verdict.trecho_cliente}"\n` : '') +
    `📝 *Motivo:* ${verdict.motivo_resumido || '-'}\n` +
    checklist +
    (verdict.acao_resgate ? `\n🎯 *Sugestão de mensagem agora:*\n"${verdict.acao_resgate}"\n` : '') +
    `\n👉 _Acesse o painel do ConversIA para ver a conversa completa._`

  const resp = await fetch(`${opts.evolutionUrl.replace(/\/$/, '')}/message/sendText/${org.evolution_instance_name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: opts.evolutionKey },
    body: JSON.stringify({ number: cleanTarget, text }),
  })

  if (!resp.ok) {
    console.error(`${tag} Falha ao enviar alerta (${resp.status}):`, await resp.text())
    return
  }
  console.log(`${tag} Alerta '${finalInfracao}' enviado para ${cleanTarget}.`)

  const update: Record<string, unknown> = { alert_sent: true }
  if (hasAlertsSentColumn) update.alerts_sent = [...alreadySent, finalInfracao]
  await supabase.from('conversations').update(update).eq('id', conversationId)
}

async function askAi(apiKey: string, ctx: {
  messages: Msg[]; lastClientIdx: number; rules: AlertRules; lastSender: string; minutesSinceLast: number;
  playbook: { company_context?: string; evaluation_criteria?: string; custom_prompt?: string } | null
}): Promise<AiVerdict | null> {
  const { messages, lastClientIdx, rules, lastSender, minutesSinceLast, playbook } = ctx
  const trim = (s?: string, n = 2500) => (s || '').slice(0, n)

  const activeRules = [
    rules.alert_on_dry_price && '- PANFLETAGEM (processo, imediato): preço enviado sem diagnóstico prévio do objetivo OU sem terminar com pergunta de convite (visita/aula experimental/agendamento).',
    rules.alert_on_price_unhandled && '- OBJEÇÃO ABANDONADA (reativo): cliente demonstrou resistência explícita e o vendedor não contornou.',
    rules.alert_on_drop_unhandled && '- DESISTÊNCIA PASSIVA (reativo): cliente declarou que não vai fechar e o vendedor aceitou sem tentar reter.',
  ].filter(Boolean).join('\n')

  const history = messages.map((m, i) => {
    const who = isAgent(m) ? 'vendedor' : 'cliente'
    const marker = i > lastClientIdx && isAgent(m) ? '>> ' : ''
    return `${marker}[${who}]: ${m.content}`
  }).join('\n')

  const system = `Você é um auditor de PROCESSO COMERCIAL em tempo real. Avalie o histórico recente e responda SOMENTE com JSON válido.

REGRAS ATIVAS NO PLAYBOOK (ignore as que não estiverem listadas):
${activeRules}

CHECKLIST OBRIGATÓRIO DE ENVIO DE PREÇO (binário):
A) O vendedor só pode enviar valores depois que o objetivo/necessidade do aluno estiver identificado no histórico.
B) Toda mensagem com preço deve terminar com pergunta de convite para visita, aula experimental ou agendamento.
Se A ou B falhar = infração "panfletagem". Não exige objeção do cliente.

RACIOCINE CAMPO A CAMPO, NESTA ORDEM:
1. "houve_investigacao_previa": true se, ANTES da primeira mensagem de preço do vendedor, o objetivo do aluno já estava claro — porque o vendedor perguntou e o cliente respondeu, OU porque o cliente declarou espontaneamente (ex: "quero emagrecer", "quero o plano anual pra musculação"). Perguntar só o nome ou "tudo bem?" NÃO conta.
2. "vendedor_enviou_precos": true se alguma mensagem do bloco atual do vendedor (linhas com ">>") contém valores, tabela ou condições de pagamento.
3. "vendedor_finalizou_com_pergunta": true SOMENTE se a ÚLTIMA mensagem do vendedor termina com pergunta de avanço comercial (visita, aula experimental, agendamento, matrícula, escolha de horário). "Qualquer dúvida?", "tudo bem?", "ficou claro?" = false.
4. "infracao_detectada":
   - "objecao_abandonada": cliente expressou resistência explícita (caro, sem tempo, longe, concorrente, "vou pensar", "vou ver com meu marido") e o vendedor respondeu sem contornar (sem valor, sem alternativa, sem convite) OU não respondeu.
   - "desistencia_passiva": cliente declarou que não vai fechar/vai deixar para depois e o vendedor aceitou passivamente.
   - "panfletagem": vendedor_enviou_precos = true E (houve_investigacao_previa = false OU vendedor_finalizou_com_pergunta = false).
   - "nenhuma": nada disso, OU o cliente já confirmou matrícula/agendamento.
   Prioridade: objecao_abandonada / desistencia_passiva > panfletagem.
5. "disparar_alerta": true se infracao_detectada != "nenhuma" e a regra correspondente estiver ATIVA.
6. "confianca": 0 a 100 — sua certeza na classificação. Seja conservador: ambiguidade = abaixo de 80.
7. "motivo_resumido": 1 frase objetiva para o gestor (máx. 160 caracteres) descrevendo o que o vendedor fez.
8. "trecho_cliente": frase exata do cliente que configura a objeção (ou "" se não houver).
9. "acao_resgate": mensagem curta, natural e persuasiva que o vendedor/gestor pode enviar AGORA ao cliente, usando os dados do Playbook.

FORMATO EXATO:
{"houve_investigacao_previa":false,"vendedor_enviou_precos":false,"vendedor_finalizou_com_pergunta":false,"infracao_detectada":"nenhuma","disparar_alerta":false,"confianca":0,"motivo_resumido":"","trecho_cliente":"","acao_resgate":""}

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
    return JSON.parse(j.choices?.[0]?.message?.content || '{}') as AiVerdict
  } catch (e) {
    console.error('[RealtimeAlert] Falha na chamada à IA:', e)
    return null
  }
}

// Varredura: conversas cuja última mensagem é do cliente e o vendedor não respondeu.
// Chamada a cada minuto pelo pg_cron (ver migration 20261003000000).
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
