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
    const lastMessageTime = new Date(lastMessage.created_at).getTime();
    const now = Date.now();
    const inactivityThreshold = 15 * 60 * 1000; // 15 minutes in ms

    const isSeller = lastMessage.sender_type === 'agent' || lastMessage.sender_type === 'atendente';
    const isInactive = (now - lastMessageTime) >= inactivityThreshold;

    if (!isSeller && !isInactive) {
      const delay = inactivityThreshold - (now - lastMessageTime);
      console.log(`[AI Analyzer] Client message received. Scheduling deferred analysis in ${delay / 1000}s for conversation ${conversationId}.`);

      setTimeout(async () => {
        try {
          console.log(`[AI Analyzer] Running scheduled check for conversation ${conversationId}...`);
          const { data: latestMsgs } = await supabase
            .from('messages')
            .select('id, sender_type, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

          if (latestMsgs && latestMsgs.length >= 3) {
            const currentLast = latestMsgs[latestMsgs.length - 1];
            const currentLastTime = new Date(currentLast.created_at).getTime();
            const currentIsSeller = currentLast.sender_type === 'agent' || currentLast.sender_type === 'atendente';
            const currentIsInactive = (Date.now() - currentLastTime) >= inactivityThreshold;

            if (currentIsSeller || currentIsInactive) {
              console.log(`[AI Analyzer] Inactivity check passed. Triggering deferred analysis for conversation ${conversationId}.`);
              await analyzeConversation(conversationId, true);
            } else {
              console.log(`[AI Analyzer] Conversation ${conversationId} had new activity. Postponing analysis.`);
            }
          }
        } catch (err) {
          console.error(`[AI Analyzer] Error in scheduled analysis for conversation ${conversationId}:`, err);
        }
      }, delay);

      return;
    }
  }

  // Step 1.5: Fetch conversation's organization_id, client_phone, operator_id and the AI playbook
  let orgId = null;
  let clientPhone = '';
  let operatorId = null;
  try {
    const { data: convData, error: convErr } = await supabase
      .from('conversations')
      .select('organization_id, client_phone, operator_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr) {
      console.error(`[AI Analyzer] Error fetching conversation data for conversation ${conversationId}:`, convErr);
    } else if (convData) {
      orgId = convData.organization_id;
      clientPhone = convData.client_phone || '';
      operatorId = convData.operator_id;
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

  // Dynamic system prompt construction
  const companyContext = playbook?.company_context || 'Você é um auditor de inteligência comercial especializado em analisar atendimentos de vendas para academias.';
  const knowledgeBase = playbook?.knowledge_base || 'Produtos, serviços e preços padrão de uma academia.';
  const evaluationCriteria = playbook?.evaluation_criteria || `Regras de Negócio para a Avaliação Comercial de Academias:
- empathy (Empatia): O atendente foi cordial, chamou pelo nome, acolheu as necessidades e objetivos do cliente (ex: emagrecimento, saúde)?
- response_time (Tempo de Resposta): O atendente respondeu de forma fluida ou demorou? (Se não houver dados de tempo precisos no histórico, avalie a fluidez da conversa e prontidão).
- investigation (Investigação): O atendente fez perguntas abertas para entender a rotina, histórico de treinos e metas do cliente antes de simplesmente enviar os preços?
- closing (Fechamento): O atendente tentou agendar uma visita experimental, aula experimental, ou convidou o cliente para conhecer a academia pessoalmente? Fez uma chamada para ação clara?
- objections (Objeções): Identifique as objeções levantadas pelo cliente (ex: preço alto, distância, falta de tempo, fidelidade do plano, etc.).`;
  const customPrompt = playbook?.custom_prompt || '';

  // Log values at the moment of injection as requested
  console.log(`[AI Analyzer] Playbook injected dynamic settings for conversation ${conversationId}:`, {
    companyContext,
    knowledgeBase,
    evaluationCriteria,
    customPrompt
  });

  const systemPrompt = `Você é um auditor comercial justo e imparcial. Analise o estágio da conversa antes de julgar. Não exija técnicas de fechamento avançado ou objeção se o cliente apenas fez uma pergunta simples. Justifique cada item no JSON antes de definir o status.

Sua tarefa é analisar o histórico de conversas entre o cliente e o atendente e retornar uma análise estruturada estritamente no formato JSON fornecido abaixo.

Sua auditoria deve verificar item por item do Playbook (tanto os critérios de avaliação quanto instruções adicionais) e retornar uma avaliação com 4 estados para cada critério.

---
REGRAS DE AVALIAÇÃO POR CRITÉRIO (4 ESTADOS):

Para cada critério comercial individual (mínimo de 5 itens baseados nas diretrizes do playbook), você deve definir:
1. "nome_criterio": Nome descritivo da regra ou critério comercial avaliado.
2. "justificativa": Seu raciocínio lógico detalhado e prévio descrevendo a situação real da conversa antes de determinar o status.
3. "status": Um dos seguintes 4 valores estritos:
   - "CUMPRIDO": O atendente executou a técnica de forma clara e correta (vale 1.0 ponto).
   - "PARCIAL": O atendente executou parcialmente, com hesitação ou de forma incompleta (vale 0.5 pontos).
   - "NAO_CUMPRIDO": O atendente teve oportunidade explícita de aplicar, mas falhou completamente (vale 0.0 pontos).
   - "N_A": O cenário para essa regra NÃO aconteceu na conversa (ex: o cliente não fez nenhuma pergunta sobre preço, não apresentou objeção, ou o contato está no início).

---
REGRA RÍGIDA PARA N_A (NÃO APLICÁVEL):
- Você NUNCA deve marcar "NAO_CUMPRIDO" para "Quebra de Objeções" se o cliente não fez nenhuma objeção explícita. Nesses casos, o status DEVE ser obrigatoriamente "N_A".
- Se um critério for classificado como "N_A", ele não entra no cálculo da nota (ele deve ser desconsiderado tanto dos pontos obtidos quanto dos pontos máximos aplicáveis).

---
CÁLCULO DA NOTA FINAL COMERCIAL:
A nota comercial final ("commercial_quality_score") de 0 a 100 é calculada da seguinte forma:
- Pontos Obtidos = Soma de todos os pontos dos critérios avaliados (CUMPRIDO = 1.0, PARCIAL = 0.5, NAO_CUMPRIDO = 0.0).
- Total Aplicável = Quantidade de critérios comerciais cujo status NÃO é "N_A".
- Nota Final = (Pontos Obtidos / Total Aplicável) * 100, arredondado para o inteiro mais próximo.
- Se todos os critérios forem classificados como "N_A" (Total Aplicável = 0), a nota final comercial DEVE ser 100.

O campo "overall_score" deve ser idêntico à "commercial_quality_score".
O tempo de resposta do atendente deve ser avaliado separadamente no campo "response_time_score" (0 a 100) e NÃO interfere no cálculo da nota comercial final.

---
REGRAS DE TRAVAS E LIMITES (HARD LIMITS):
- Síndrome do Panfleteiro: Se o atendente enviou preços antes de investigar os objetivos do cliente, o critério de Investigação deve ser "NAO_CUMPRIDO", a nota legada "scores.investigation" deve ser 0, e a nota comercial final ("commercial_quality_score" e "overall_score") NÃO pode ultrapassar 40.
- Falta de Controle: Se a última mensagem do atendente na conversa NÃO terminar com uma pergunta de condução ("?" na última linha), o critério de Fechamento deve ser "NAO_CUMPRIDO", a nota legada "scores.closing" deve ser 0.
- Falta de Saudação: Se o atendente não saudar o cliente ou não chamá-lo pelo nome na primeira mensagem dele, limite a nota de empatia legada "scores.empathy" a no máximo 30.
- Falhas Graves: Cada alucinação (oferta inexistente na base de conhecimento) ou dor do cliente ignorada conta como Falha Grave. Cada Falha Grave reduz a nota comercial final em 20 pontos de penalidade direta. Insira em "weaknesses" com o prefixo exato "FALHA GRAVE: [descrição]".

---
FORMATO DA RESPOSTA JSON:
Você deve retornar unicamente um objeto JSON válido no seguinte formato (sem tags markdown de código e sem texto antes ou depois):
{
  "overall_score": 80,
  "commercial_quality_score": 80,
  "response_time_score": 90,
  "criterios": [
    {
      "nome_criterio": "Nome do critério / regra avaliada",
      "justificativa": "Descrição do comportamento analisado no chat antes do status...",
      "status": "CUMPRIDO",
      "pontos": 1.0
    }
  ],
  "scores": {
    "empathy": 90,
    "response_time": 90,
    "investigation": 80,
    "closing": 70
  },
  "summary": "Resumo objetivo da auditoria...",
  "strengths": ["Ponto forte 1"],
  "weaknesses": ["Ponto fraco 1"],
  "recommendations": ["Recomendação prática 1"],
  "objections": ["Objeção identificada (somente resistências reais)"]
}

Contexto da empresa:
${companyContext}

Base de conhecimento (Produtos/Preços/FAQ):
${knowledgeBase}

Critérios de avaliação:
${evaluationCriteria}

Instruções adicionais:
${customPrompt}

Atenção: Retorne apenas o objeto JSON válido, sem tags markdown adicionais ou qualquer outro texto explicativo fora do JSON.`;

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
  let analysisResult;
  const resultText = response.choices[0]?.message?.content || '{}';
  try {
    analysisResult = JSON.parse(resultText);
    console.log(`[AI Analyzer] Parsed JSON response successfully for conversation ${conversationId}`);
  } catch (parseErr: any) {
    console.error(`[AI Analyzer] Failed to parse OpenAI JSON response for conversation ${conversationId}. Raw content: "${resultText}":`, parseErr);
    throw new Error(`Invalid JSON format received from OpenAI: ${parseErr.message}`);
  }

  // Step 4.5: Programmatic score calculation to ensure mathematical precision
  if (Array.isArray(analysisResult.criterios)) {
    let pointsObtained = 0;
    let totalApplicable = 0;
    
    analysisResult.criterios.forEach((c: any) => {
      const status = String(c.status).toUpperCase();
      if (status !== 'N_A') {
        totalApplicable += 1;
        if (status === 'CUMPRIDO') {
          pointsObtained += 1.0;
          c.pontos = 1.0;
        } else if (status === 'PARCIAL') {
          pointsObtained += 0.5;
          c.pontos = 0.5;
        } else {
          c.pontos = 0.0;
        }
      } else {
        c.pontos = 0.0;
      }
    });

    let calculatedScore = 100;
    if (totalApplicable > 0) {
      calculatedScore = Math.round((pointsObtained / totalApplicable) * 100);
    }
    
    analysisResult.commercial_quality_score = calculatedScore;
    analysisResult.overall_score = calculatedScore;
    
    console.log(`[AI Analyzer] Programmatic score calculation: Points = ${pointsObtained}, Total = ${totalApplicable}, Score = ${calculatedScore}`);
  }

  // Step 5: Save analysis JSON to Supabase
  try {
    console.log(`[AI Analyzer] Saving analysis to database (analyses table) for conversation ${conversationId}...`);
    
    // Merge the custom criteria evaluation & scores fields into scores JSONB column
    const scoresData = {
      ...analysisResult.scores,
      commercial_quality_score: analysisResult.commercial_quality_score,
      response_time_score: analysisResult.response_time_score,
      criterios: analysisResult.criterios,
      criteria_evaluation: analysisResult.criterios // duplicate for backward compatibility
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

  // Step 6: Dispatch WhatsApp Alert if score <= 50 and owner_whatsapp is configured
  if (analysisResult.overall_score <= 50 && ownerWhatsapp && instanceName) {
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

      // 2. Format list of unfulfilled criteria
      const unfulfilled = (analysisResult.criteria_evaluation || [])
        .filter((c: any) => c.fulfilled === false)
        .map((c: any) => `• *${c.item}*: ${c.explanation}`)
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
      } else {
        const alertErrText = await alertResp.text();
        console.error(`[AI Analyzer] Evolution API failed to send alert (status ${alertResp.status}):`, alertErrText);
      }
    } catch (alertErr) {
      console.error('[AI Analyzer] Failed to send low-score WhatsApp alert:', alertErr);
    }
  }
}
