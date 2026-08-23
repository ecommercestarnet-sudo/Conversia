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

    const lastMessage = messages[messages.length - 1];
    const isSeller = lastMessage.sender_type === 'agent' || lastMessage.sender_type === 'atendente';

    if (!isSeller) {
      console.log(`[AI Analyzer] Last message in conversation ${conversationId} is from client. Skipping analysis until seller responds.`);
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

  // Step 1.6: Debouncing — prevent rapid re-analysis
  if (!force) {
    const newMessagesSinceLast = messages.length - messageCountAtAnalysis;
    if (newMessagesSinceLast < MIN_NEW_MESSAGES_SINCE_LAST) {
      console.log(`[AI Analyzer] Debounce: only ${newMessagesSinceLast} new message(s) since last analysis (need ${MIN_NEW_MESSAGES_SINCE_LAST}). Skipping.`);
      return;
    }

    if (lastAnalyzedAt) {
      const elapsed = Date.now() - new Date(lastAnalyzedAt).getTime();
      if (elapsed < DEBOUNCE_INTERVAL_MS) {
        console.log(`[AI Analyzer] Debounce: only ${Math.round(elapsed / 1000)}s since last analysis (need ${DEBOUNCE_INTERVAL_MS / 1000}s). Skipping.`);
        return;
      }
    }
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
  // Step 4.5: DETERMINISTIC SCORING PIPELINE (7 stages)
  // ═══════════════════════════════════════════════════════

  const chainOfThought = analysisResult._raciocinio_previo || {};

  // Stage 1: VALIDATE — Sanitize statuses to valid enum values
  if (Array.isArray(analysisResult.criterios)) {
    const validStatuses = ['CUMPRIDO', 'PARCIAL', 'NAO_CUMPRIDO', 'N_A'];
    analysisResult.criterios.forEach((c: any) => {
      c.status = String(c.status || 'N_A').toUpperCase().trim();
      if (!validStatuses.includes(c.status)) {
        console.warn(`[AI Analyzer] Invalid status "${c.status}" for criterion "${c.nome_criterio}". Defaulting to N_A.`);
        c.status = 'N_A';
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

  console.log(`[AI Analyzer] Stage 2 Base Score: Points=${pointsObtained}, Applicable=${totalApplicable}, Score=${calculatedScore}`);

  // Stage 3: HARD LIMIT — Panfleteiro (sent price without investigating)
  if (chainOfThought.vendedor_enviou_preco_sem_investigar === true) {
    // Also force the Investigation criterion to NAO_CUMPRIDO if it exists
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

  // Stage 4: HARD LIMIT — Falta de Controle (last seller msg doesn't end with question)
  if (chainOfThought.ultima_msg_vendedor_termina_com_pergunta === false) {
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
      // Only apply if lower (don't override panfleteiro cap)
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

  // Stage 6: CLAMP — Ensure score is within [0, 100]
  calculatedScore = Math.max(0, Math.min(100, calculatedScore));

  // Assign final deterministic scores
  analysisResult.commercial_quality_score = calculatedScore;
  analysisResult.overall_score = calculatedScore;

  console.log(`[AI Analyzer] Final deterministic score for conversation ${conversationId}: ${calculatedScore}/100`);

  // Step 5: Save analysis JSON to Supabase
  try {
    console.log(`[AI Analyzer] Saving analysis to database (analyses table) for conversation ${conversationId}...`);
    
    // Merge the custom criteria evaluation & scores fields into scores JSONB column
    const scoresData = {
      commercial_quality_score: analysisResult.commercial_quality_score,
      response_time_score: analysisResult.response_time_score,
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

  // Step 6: Dispatch WhatsApp Alert if score <= 50 and owner_whatsapp is configured
  if (analysisResult.overall_score <= 50 && ownerWhatsapp && instanceName) {
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
