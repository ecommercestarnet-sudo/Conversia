import OpenAI from 'openai';
import { supabase } from './supabase';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
let EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

// Fallback manual parser for .env.local
if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          let value = parts.slice(1).join('=').trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          
          if (key === 'EVOLUTION_API_URL') EVOLUTION_API_URL = value;
          if (key === 'EVOLUTION_API_KEY') EVOLUTION_API_KEY = value;
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse .env.local fallback in AI Analyzer:', e);
  }
}

if (!EVOLUTION_API_URL) {
  EVOLUTION_API_URL = 'http://216.238.122.167:8081';
}
if (!EVOLUTION_API_KEY) {
  EVOLUTION_API_KEY = '429683C4C977415CAAFCCE10F7D57E11';
}

// ─── Debouncing constants ───
const DEBOUNCE_INTERVAL_MS = 60_000; // 60 seconds minimum between analyses
const MIN_NEW_MESSAGES_SINCE_LAST = 2; // at least 2 new messages since last analysis

export async function analyzeConversation(conversationId: string, force: boolean = false) {
  console.log(`[AI Analyzer] Starting AI analysis for conversation ID: ${conversationId} (force=${force})`);

  // Step 1: Fetch messages from Supabase
  let messages;
  try {
    console.log(`[AI Analyzer] Fetching messages from Supabase for conversation: ${conversationId}`);
    const { data, error: selectError } = await supabase
      .from('messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (selectError) {
      console.error(`[AI Analyzer] Supabase SELECT query error for conversation ${conversationId}:`, selectError);
      throw new Error(`Database SELECT query failed: ${selectError.message}`);
    }
    messages = data;
  } catch (err: any) {
    console.error(`[AI Analyzer] Failed database operation when fetching messages for conversation ${conversationId}:`, err);
    throw err;
  }

  if (!messages || messages.length === 0) {
    console.warn(`[AI Analyzer] No messages found for conversation ${conversationId}. Skipping analysis.`);
    return;
  }

  // Trigger constraints
  if (!force) {
    if (messages.length < 3) {
      console.log(`[AI Analyzer] Skipping analysis. Conversation ${conversationId} has only ${messages.length} messages (min 3 required).`);
      return;
    }
  }

  // Step 1.5: Fetch conversation data including debouncing fields
  let orgId = null;
  let clientPhone = '';
  let operatorId = null;
  let alertSent = false;
  let lastAnalyzedAt: string | null = null;
  let messageCountAtAnalysis = 0;
  try {
    const { data: convData, error: convErr } = await supabase
      .from('conversations')
      .select('organization_id, client_phone, operator_id, alert_sent, last_analyzed_at, message_count_at_analysis')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr) {
      console.error(`[AI Analyzer] Error fetching conversation data for conversation ${conversationId}:`, convErr);
    } else if (convData) {
      orgId = convData.organization_id;
      clientPhone = convData.client_phone || '';
      operatorId = convData.operator_id;
      alertSent = convData.alert_sent || false;
      lastAnalyzedAt = convData.last_analyzed_at;
      messageCountAtAnalysis = convData.message_count_at_analysis || 0;
    }
  } catch (err: any) {
    console.error(`[AI Analyzer] Failed to fetch conversation data for conversation ${conversationId}:`, err);
  }

  let playbook = null;
  let ownerWhatsapp = null;
  let instanceName = null;
  let orgName = '';

  if (orgId) {
    try {
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
        .maybeSingle();

      if (playbookError) {
        console.error(`[AI Analyzer] Error fetching playbook for organization ${orgId}:`, playbookError);
      } else if (playbookData) {
        playbook = playbookData;
        console.log(`[AI Analyzer] Playbook loaded successfully for organization ${orgId}`);
      }
    } catch (err: any) {
      console.error(`[AI Analyzer] Failed to fetch organization/playbook for organization ${orgId}:`, err);
    }
  }

  // Fallback Playbook Load
  if (!playbook) {
    try {
      console.log(`[AI Analyzer] Fallback to first playbook.`);
      const { data: fallbackPlaybook } = await supabase
        .from('ai_playbooks')
        .select('organization_id, company_context, knowledge_base, evaluation_criteria, custom_prompt')
        .limit(1)
        .maybeSingle();
      if (fallbackPlaybook) {
        playbook = fallbackPlaybook;
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
      }
    } catch (e) {
      console.error('[AI Analyzer] Fallback playbook load failed:', e);
    }
  }

  // Step 1.7: Prevent loop/analysis if conversation is with the business owner
  if (clientPhone && ownerWhatsapp) {
    const cleanClient = clientPhone.replace(/[^0-9]/g, '');
    const cleanOwner = ownerWhatsapp.replace(/[^0-9]/g, '');
    const isOwner = cleanClient === cleanOwner || 
      (cleanClient.length > cleanOwner.length ? cleanClient.endsWith(cleanOwner) : cleanOwner.endsWith(cleanClient));
    if (isOwner) {
      console.log(`[AI Analyzer] Skipping analysis/alert because conversation is with the owner's WhatsApp: ${clientPhone}`);
      return;
    }
  }

  // Step 2: Format conversation history
  let formattedHistory = '';
  try {
    formattedHistory = messages
      .map((msg) => {
        const sender = (msg.sender_type === 'agent' || msg.sender_type === 'atendente') ? 'atendente' : 'cliente';
        return `[${sender}]: ${msg.content}`;
      })
      .join('\n');
    console.log(`[AI Analyzer] Formatted chat history for conversation ${conversationId}:\n${formattedHistory}`);
  } catch (err: any) {
    console.error(`[AI Analyzer] Failed to format messages for conversation ${conversationId}:`, err);
    throw err;
  }

  // Step 3: Build system prompt with Chain of Thought + Few-Shot
  const companyContext = playbook?.company_context || 'Você é um auditor de inteligência comercial especializado em analisar atendimentos de vendas para academias.';
  const knowledgeBase = playbook?.knowledge_base || 'Produtos, serviços e preços padrão de uma academia.';
  const evaluationCriteria = playbook?.evaluation_criteria || `Regras de Negócio para a Avaliação Comercial de Academias:
- empathy (Empatia): O atendente foi cordial, chamou pelo nome, acolheu as necessidades e objetivos do cliente (ex: emagrecimento, saúde)?
- response_time (Tempo de Resposta): O atendente respondeu de forma fluida ou demorou? (Se não houver dados de tempo precisos no histórico, avalie a fluidez da conversa e prontidão).
- investigation (Investigação): O atendente fez perguntas abertas para entender a rotina, histórico de treinos e metas do cliente antes de simplesmente enviar os preços?
- closing (Fechamento): O atendente tentou agendar uma visita experimental, aula experimental, ou convidou o cliente para conhecer a academia pessoalmente? Fez uma chamada para ação clara?
- objections (Objeções): Identifique as objeções levantadas pelo cliente (ex: preço alto, distância, falta de tempo, fidelidade do plano, etc.).`;
  const customPrompt = playbook?.custom_prompt || '';

  console.log(`[AI Analyzer] Playbook injected dynamic settings for conversation ${conversationId}:`, {
    companyContext,
    knowledgeBase,
    evaluationCriteria,
    customPrompt
  });

  const systemPrompt = `Você é um auditor de inteligência comercial. Sua tarefa é analisar conversas de atendimento e avaliar o desempenho do vendedor com base no Playbook Comercial da empresa e, principalmente, no RESULTADO DA CONVERSA (CONVERSÃO).

═══════════════════════════════════════════
ETAPA 1 — RACIOCÍNIO PRÉVIO & DETECÇÃO DE CONVERSÃO (OBRIGATÓRIO)
═══════════════════════════════════════════

ANTES de avaliar qualquer critério, você DEVE preencher o campo "_raciocinio_previo" analisando cuidadosamente o desfecho da conversa:
1. "conversa_convertida": boolean -> Defina como TRUE se o cliente confirmou compra, matrícula, agendamento de visita/aula experimental, envio de comprovante PIX, ou aceitou formalmente a proposta (ex: "quero me matricular", "pode agendar", "vou aí hoje às 18h", "já fiz o pix"). Caso contrário, FALSE.
2. "tipo_conversao": "agendamento_confirmado" | "venda_concluida" | "em_andamento" | "perdida" | "sem_interesse"
3. "cliente_decidido_compra_rapida": boolean -> TRUE se o cliente já chegou direto ao ponto (querendo preço/agendamento imediato sem necessidade de longa investigação).
4. "justificativa_conversao": Descrição do desfecho e das frases finais que comprovam ou não a conversão.
5. "fase_conversa": "contato_inicial" | "investigacao" | "negociacao" | "fechamento" | "pos_venda"
6. "objecoes_detectadas": Lista de objeções reais levantadas pelo cliente.
7. "vendedor_enviou_preco_sem_investigar": boolean (se enviou preço antes de perguntar necessidades — OBS: se o cliente já era decidido ou fechou a venda, isso NÃO será penalizado).
8. "ultima_msg_vendedor_termina_com_pergunta": boolean.
9. "vendedor_saudou_e_usou_nome": boolean.

═══════════════════════════════════════════
ETAPA 2 — AVALIAÇÃO POR CRITÉRIO (COM REGRA DE SUCESSO)
═══════════════════════════════════════════

Para cada critério do Playbook, avalie com UM dos 4 estados estritos:
- "CUMPRIDO": O vendedor executou a técnica corretamente OU o objetivo foi alcançado com sucesso.
- "PARCIAL": Executou de forma incompleta ou com hesitação.
- "NAO_CUMPRIDO": A oportunidade existiu claramente, mas o vendedor falhou.
- "N_A": O cenário para essa regra NÃO ocorreu na conversa.

REGRAS DE OURO EM CASO DE CONVERSÃO / COMPRA DIRETA:
- Se houve CONVERSÃO (venda ou agendamento confirmado), o critério de "Fechamento" (ou CTA) DEVE SER MARCADO COMO "CUMPRIDO".
- Se o cliente foi direto ao ponto ou a venda foi rápida, os critérios de "Investigação Profunda" e "Ancoragem de Valor" DEVEM SER MARCADOS COMO "N_A" (não punir o vendedor por ser ágil e fechar logo).
- Se o cliente NÃO fez objeções → critério "Quebra de Objeções" = "N_A".
- Critérios "N_A" são EXCLUÍDOS do cálculo (não contam contra o vendedor).

REGRA DE EMPATIA:
- Se o vendedor cumprimentou com educação e usou o nome do cliente → "CUMPRIDO".

FALHAS GRAVES:
- Somente registre Falha Grave em caso de grosseria explícita, abandono deliberado ou alucinação de produto/preço inexistente na base de conhecimento. Registre em "weaknesses" com prefixo "FALHA GRAVE: [descrição]".

═══════════════════════════════════════════
EXEMPLOS DE REFERÊNCIA (FEW-SHOT)
═══════════════════════════════════════════

EXEMPLO 1 — Compra Rápida / Conversão Direta (Resultado esperado: ~100):
[cliente]: Olá, qual o valor do plano anual?
[atendente]: Oi Juliana! Tudo bem? O plano anual está R$120/mês com acesso total. Quer garantir sua matrícula agora ou prefere agendar uma aula experimental gratuita hoje às 19h?
[cliente]: Pode agendar hoje às 19h com certeza!
[atendente]: Perfeito Juliana! Está agendado para hoje às 19h, te espero na recepção!

Raciocínio: Conversão confirmada com sucesso em poucas mensagens. Investigação = N_A (cliente direto), Fechamento = CUMPRIDO, Empatia = CUMPRIDO. Nota máxima!

EXEMPLO 2 — Venda Consultiva Completa (Resultado esperado: ~100):
[cliente]: Oi, quero saber sobre a academia
[atendente]: Olá Marcos! Tudo bem? Me conta, qual seu objetivo principal? Emagrecimento, hipertrofia ou saúde?
[cliente]: Quero emagrecer e ganhar disposição
[atendente]: Maravilha! Temos acompanhamento com instrutor para emagrecimento. O plano trimestral sai R$130/mês. Vamos agendar sua primeira aula amanhã às 8h?
[cliente]: Combinado, amanhã às 8h estarei aí!

Raciocínio: Vendedor investigou, conectou o plano ao objetivo e converteu o agendamento. Todos os critérios CUMPRIDO.

EXEMPLO 3 — Atendimento com Objeção Perdida (Resultado esperado: ~30):
[cliente]: Olá, quanto custa a mensalidade?
[atendente]: R$150.
[cliente]: Achei muito caro, vou ver em outra.
[atendente]: Tá bom.

Raciocínio: Não saudou, não investigou, ignorou objeção de preço, não tentou reter nem convidou para conhecer. Não houve conversão.

═══════════════════════════════════════════
FORMATO JSON DA RESPOSTA
═══════════════════════════════════════════

Retorne UNICAMENTE o JSON abaixo (sem markdown, sem texto fora):
{
  "_raciocinio_previo": {
    "conversa_convertida": true,
    "tipo_conversao": "agendamento_confirmado",
    "cliente_decidido_compra_rapida": false,
    "justificativa_conversao": "O cliente confirmou o agendamento para hoje às 19h.",
    "fase_conversa": "fechamento",
    "resumo_contexto": "Descrição breve do atendimento...",
    "objecoes_detectadas": [],
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
  "response_time_score": 90,
  "summary": "Resumo objetivo da auditoria...",
  "strengths": ["Ponto forte 1"],
  "weaknesses": ["Ponto fraco 1"],
  "recommendations": ["Recomendação prática 1"],
  "objections": []
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

  let response;
  try {
    console.log(`[AI Analyzer] Dispatching completion request to OpenAI API (gpt-4o-mini)...`);
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Aqui está o histórico do atendimento:\n\n${formattedHistory}` },
      ],
      response_format: { type: 'json_object' },
    });
    console.log(`[AI Analyzer] OpenAI API completion response received successfully.`);
  } catch (err: any) {
    console.error(`[AI Analyzer] OpenAI API Call Failed for conversation ${conversationId}:`, err);
    throw new Error(`OpenAI API call failed: ${err.message || err}`);
  }

  // Step 4: Parse OpenAI response content
  let analysisResult: any;
  const resultText = response.choices[0]?.message?.content || '{}';
  try {
    analysisResult = JSON.parse(resultText);
    console.log(`[AI Analyzer] Parsed JSON response successfully for conversation ${conversationId}`);
  } catch (parseErr: any) {
    console.error(`[AI Analyzer] Failed to parse OpenAI JSON response for conversation ${conversationId}. Raw content: "${resultText}":`, parseErr);
    throw new Error(`Invalid JSON format received from OpenAI: ${parseErr.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Step 4.5: DETERMINISTIC SCORING PIPELINE (Outcome-Based)
  // ═══════════════════════════════════════════════════════

  const chainOfThought = analysisResult._raciocinio_previo || {};
  const isConverted = chainOfThought.conversa_convertida === true || 
    chainOfThought.tipo_conversao === 'agendamento_confirmado' || 
    chainOfThought.tipo_conversao === 'venda_concluida';
  const isFastDirect = chainOfThought.cliente_decidido_compra_rapida === true;

  // Stage 1: VALIDATE & AUTO-ADJUST FOR CONVERSION
  if (Array.isArray(analysisResult.criterios)) {
    const validStatuses = ['CUMPRIDO', 'PARCIAL', 'NAO_CUMPRIDO', 'N_A'];
    analysisResult.criterios.forEach((c: any) => {
      c.status = String(c.status || 'N_A').toUpperCase().trim();
      if (!validStatuses.includes(c.status)) {
        console.warn(`[AI Analyzer] Invalid status "${c.status}" for criterion "${c.nome_criterio}". Defaulting to N_A.`);
        c.status = 'N_A';
      }

      const name = String(c.nome_criterio || '').toLowerCase();

      // If converted or fast-track direct, ensure Fechamento is CUMPRIDO and Investigation is excused if N_A/unneeded
      if (isConverted) {
        if (name.includes('fechamento') || name.includes('cta') || name.includes('conversão') || name.includes('conversao') || name.includes('condução') || name.includes('conducao')) {
          c.status = 'CUMPRIDO';
          c.pontos = 1.0;
        }
        if (isFastDirect && name.includes('investiga')) {
          if (c.status === 'NAO_CUMPRIDO') {
            c.status = 'N_A';
            c.pontos = 0.0;
          }
        }
      }
    });
  }

  // Stage 2: BASE SCORE — Calculate from criteria
  let pointsObtained = 0;
  let totalApplicable = 0;

  if (Array.isArray(analysisResult.criterios)) {
    analysisResult.criterios.forEach((c: any) => {
      if (c.status !== 'N_A') {
        totalApplicable += 1;
        if (c.status === 'CUMPRIDO') {
          pointsObtained += 1.0;
          c.pontos = 1.0;
        } else if (c.status === 'PARCIAL') {
          pointsObtained += 0.5;
          c.pontos = 0.5;
        } else {
          c.pontos = 0.0;
        }
      } else {
        c.pontos = 0.0; // N_A does not count
      }
    });
  }

  let calculatedScore = 100;
  if (totalApplicable > 0) {
    calculatedScore = Math.round((pointsObtained / totalApplicable) * 100);
  }

  console.log(`[AI Analyzer] Stage 2 Base Score: Points=${pointsObtained}, Applicable=${totalApplicable}, Score=${calculatedScore}, isConverted=${isConverted}`);

  // Stage 3: HARD LIMIT — Panfleteiro (sent price without investigating)
  // ONLY APPLIES IF NOT CONVERTED AND NOT A DIRECT FAST BUY
  if (!isConverted && !isFastDirect && chainOfThought.vendedor_enviou_preco_sem_investigar === true) {
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        const name = String(c.nome_criterio || '').toLowerCase();
        if (name.includes('investiga')) {
          if (c.status !== 'NAO_CUMPRIDO') {
            console.log(`[AI Analyzer] Panfleteiro: Forcing "${c.nome_criterio}" from ${c.status} to NAO_CUMPRIDO`);
            c.status = 'NAO_CUMPRIDO';
            c.pontos = 0.0;
          }
        }
      });
    }
    if (calculatedScore > 40) {
      console.log(`[AI Analyzer] Stage 3 Panfleteiro: Capping score from ${calculatedScore} to 40`);
      calculatedScore = 40;
    }
  }

  // Stage 4: HARD LIMIT — Falta de Controle (ONLY IF NOT CONVERTED)
  if (!isConverted && chainOfThought.ultima_msg_vendedor_termina_com_pergunta === false) {
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        const name = String(c.nome_criterio || '').toLowerCase();
        if (name.includes('fechamento') || name.includes('condução') || name.includes('controle')) {
          if (c.status !== 'NAO_CUMPRIDO') {
            console.log(`[AI Analyzer] Falta de Controle: Forcing "${c.nome_criterio}" from ${c.status} to NAO_CUMPRIDO`);
            c.status = 'NAO_CUMPRIDO';
            c.pontos = 0.0;
          }
        }
      });
    }
    // Recalculate after forcing criteria
    pointsObtained = 0;
    totalApplicable = 0;
    if (Array.isArray(analysisResult.criterios)) {
      analysisResult.criterios.forEach((c: any) => {
        if (c.status !== 'N_A') {
          totalApplicable += 1;
          pointsObtained += c.pontos;
        }
      });
    }
    if (totalApplicable > 0) {
      const recalculated = Math.round((pointsObtained / totalApplicable) * 100);
      calculatedScore = Math.min(calculatedScore, recalculated);
    }
  }

  // Stage 5: HARD LIMIT — Falha Grave (-20 points each)
  const weaknesses: string[] = Array.isArray(analysisResult.weaknesses) ? analysisResult.weaknesses : [];
  const falhaGraveCount = weaknesses.filter((w: string) => typeof w === 'string' && w.startsWith('FALHA GRAVE:')).length;
  if (falhaGraveCount > 0) {
    const penalty = falhaGraveCount * 20;
    console.log(`[AI Analyzer] Stage 5 Falha Grave: ${falhaGraveCount} found, penalty = -${penalty}`);
    calculatedScore -= penalty;
  }

  // Stage 6: CONVERSION FLOOR — Guarantee minimum score of 85 if conversion succeeded
  if (isConverted) {
    const previousScore = calculatedScore;
    calculatedScore = Math.max(85, calculatedScore);
    console.log(`[AI Analyzer] Stage 6 Conversion Floor: Score adjusted from ${previousScore} to ${calculatedScore} (minimum 85 for conversion)`);
  }

  // Stage 6: CLAMP — Ensure score is within [0, 100]
  calculatedScore = Math.max(0, Math.min(100, calculatedScore));

  // Assign final deterministic scores
  analysisResult.commercial_quality_score = calculatedScore;
  analysisResult.overall_score = calculatedScore;

  console.log(`[AI Analyzer] Final deterministic score for conversation ${conversationId}: ${calculatedScore}/100`);

  // Helper for category scores
  const getCategoryScore = (criterios: any[], keywords: string[], defaultValue = 100) => {
    let points = 0;
    let total = 0;
    criterios.forEach((c: any) => {
      const name = String(c.nome_criterio || '').toLowerCase();
      if (keywords.some(kw => name.includes(kw))) {
        const status = String(c.status || 'N_A').toUpperCase().trim();
        if (status !== 'N_A') {
          total += 1;
          if (status === 'CUMPRIDO') points += 1.0;
          else if (status === 'PARCIAL') points += 0.5;
        }
      }
    });
    return total > 0 ? Math.round((points / total) * 100) : defaultValue;
  };

  const empathyScore = getCategoryScore(analysisResult.criterios || [], ['empatia', 'empathy', 'saudação', 'saudacao', 'educação', 'educacao', 'gentileza', 'cordial'], 100);
  const investigationScore = getCategoryScore(analysisResult.criterios || [], ['investigação', 'investigacao', 'investigar', 'pergunta', 'rotina', 'histórico', 'historico', 'metas', 'objetivo', 'dor'], 100);
  const closingScore = getCategoryScore(analysisResult.criterios || [], ['fechamento', 'closing', 'visita', 'experimental', 'agenda', 'condução', 'conducao', 'chamada', 'cta', 'controle'], 100);
  const responseTimeScore = typeof analysisResult.response_time_score === 'number' ? analysisResult.response_time_score : 100;

  // Step 5: Save analysis JSON to Supabase
  try {
    console.log(`[AI Analyzer] Saving analysis to database (analyses table) for conversation ${conversationId}...`);
    
    // Merge the custom criteria evaluation & scores fields into scores JSONB column
    const scoresData = {
      empathy: empathyScore,
      investigation: investigationScore,
      closing: closingScore,
      response_time: responseTimeScore,
      commercial_quality_score: analysisResult.commercial_quality_score,
      response_time_score: responseTimeScore,
      criterios: analysisResult.criterios,
      criteria_evaluation: analysisResult.criterios, // backward compatibility
      _raciocinio_previo: analysisResult._raciocinio_previo,
    };

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
      });

    if (upsertError) {
      console.error(`[AI Analyzer] Supabase UPSERT query error for analysis of conversation ${conversationId}:`, upsertError);
      throw new Error(`Database UPSERT query failed: ${upsertError.message}`);
    }

    console.log(`[AI Analyzer] Analysis successfully saved/updated for conversation ${conversationId}`);
  } catch (err: any) {
    console.error(`[AI Analyzer] Database operation failed when saving analysis for conversation ${conversationId}:`, err);
    throw err;
  }

  // Step 5.5: Update debouncing columns
  try {
    const { error: debounceErr } = await supabase
      .from('conversations')
      .update({
        last_analyzed_at: new Date().toISOString(),
        message_count_at_analysis: messages.length,
      })
      .eq('id', conversationId);

    if (debounceErr) {
      console.error(`[AI Analyzer] Failed to update debouncing columns:`, debounceErr.message);
    }
  } catch (e) {
    console.error('[AI Analyzer] Error updating debouncing columns:', e);
  }

  // Step 6: Dispatch WhatsApp Alert if score <= 50 and owner_whatsapp is configured (Temporarily disabled)
  const isAlertEnabled = false;
  if (isAlertEnabled && analysisResult.overall_score <= 50 && ownerWhatsapp && instanceName) {
    if (alertSent) {
      console.log(`[AI Analyzer] Low score alert already sent for conversation ${conversationId}. Skipping WhatsApp alert dispatch.`);
      return;
    }
    console.log(`[AI Analyzer] Low score alert triggered (score: ${analysisResult.overall_score}) for organization ${orgName}. Sending alert to: ${ownerWhatsapp}`);
    try {
      // 1. Fetch operator name
      let operatorName = 'Não atribuído';
      if (operatorId) {
        const { data: operatorData } = await supabase
          .from('operators')
          .select('name')
          .eq('id', operatorId)
          .maybeSingle();
        if (operatorData) {
          operatorName = operatorData.name;
        }
      }

      // 2. Format list of unfulfilled criteria (FIXED: uses correct schema)
      const unfulfilled = (analysisResult.criterios || [])
        .filter((c: any) => c.status === 'NAO_CUMPRIDO' || c.status === 'PARCIAL')
        .map((c: any) => `• *${c.nome_criterio}*: ${c.justificativa}`)
        .join('\n');

      const alertText = `⚠️ *Alerta de Auditoria SupervisIA* ⚠️\n\n` +
        `Um atendimento foi avaliado com nota comercial baixa!\n\n` +
        `*Cliente:* ${clientPhone}\n` +
        `*Atendente Responsável:* ${operatorName}\n` +
        `*Nota Comercial:* ${analysisResult.overall_score}/100\n\n` +
        `*Itens do Playbook descumpridos:*\n${unfulfilled || 'Nenhum item comercial explícito listado.'}\n\n` +
        `*Resumo:* ${analysisResult.summary}\n\n` +
        `Acesse o painel para auditar o atendimento completo.`;

      // 3. Dispatch alert via Evolution API
      const cleanPhone = ownerWhatsapp.replace(/[^0-9]/g, '');
      const evolutionUrl = `${EVOLUTION_API_URL?.replace(/\/$/, '')}/message/sendText/${instanceName}`;
      
      console.log(`[AI Analyzer] Sending request to Evolution API URL: ${evolutionUrl}`);
      const alertResp = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY || ''
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: alertText
        })
      });

      if (alertResp.ok) {
        console.log(`[AI Analyzer] WhatsApp alert dispatched successfully to ${cleanPhone}.`);
        // Update alert_sent to true in database to avoid duplicate alerts
        const { error: updateErr } = await supabase
          .from('conversations')
          .update({ alert_sent: true })
          .eq('id', conversationId);
        
        if (updateErr) {
          console.error(`[AI Analyzer] Failed to update conversation alert_sent status:`, updateErr.message);
        } else {
          console.log(`[AI Analyzer] Updated conversation ${conversationId} alert_sent to true.`);
        }
      } else {
        const alertErrText = await alertResp.text();
        console.error(`[AI Analyzer] Evolution API failed to send alert (status ${alertResp.status}):`, alertErrText);
      }
    } catch (alertErr) {
      console.error('[AI Analyzer] Failed to send low-score WhatsApp alert:', alertErr);
    }
  }
}
