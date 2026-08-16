import OpenAI from 'openai';
import { supabase } from './supabase';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeConversation(conversationId: string) {
  console.log(`[AI Analyzer] Starting AI analysis for conversation ID: ${conversationId}`);

  // Step 1: Fetch messages from Supabase
  let messages;
  try {
    console.log(`[AI Analyzer] Fetching messages from Supabase for conversation: ${conversationId}`);
    const { data, error: selectError } = await supabase
      .from('messages')
      .select('sender_type, content, created_at')
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

  // Step 1.5: Fetch conversation's company_id and then the AI playbook
  let companyId = null;
  try {
    const { data: convData, error: convErr } = await supabase
      .from('conversations')
      .select('company_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr) {
      console.error(`[AI Analyzer] Error fetching conversation company_id for conversation ${conversationId}:`, convErr);
    } else {
      companyId = convData?.company_id;
    }

    if (!companyId) {
      console.log(`[AI Analyzer] No company_id directly associated with conversation ${conversationId}. Fetching default company.`);
      const { data: companies } = await supabase
        .from('companies')
        .select('id')
        .limit(1);
      if (companies && companies.length > 0) {
        companyId = companies[0].id;
      }
    }
  } catch (err: any) {
    console.error(`[AI Analyzer] Failed to fetch company_id for conversation ${conversationId}:`, err);
  }

  let playbook = null;
  if (companyId) {
    try {
      const { data: playbookData, error: playbookError } = await supabase
        .from('ai_playbooks')
        .select('company_context, knowledge_base, evaluation_criteria, custom_prompt')
        .eq('organization_id', companyId)
        .maybeSingle();

      if (playbookError) {
        console.error(`[AI Analyzer] Error fetching playbook for company ${companyId}:`, playbookError);
      } else if (playbookData) {
        playbook = playbookData;
        console.log(`[AI Analyzer] Playbook loaded successfully for company ${companyId}`);
      }
    } catch (err: any) {
      console.error(`[AI Analyzer] Failed to fetch playbook for company ${companyId}:`, err);
    }
  }

  // Fallback: Se não encontrar o playbook para o ID específico, busca o primeiro cadastrado
  if (!playbook) {
    try {
      console.log(`[AI Analyzer] No playbook found for company_id ${companyId}. Attempting fallback to the first playbook in database.`);
      const { data: fallbackPlaybook, error: fallbackError } = await supabase
        .from('ai_playbooks')
        .select('company_context, knowledge_base, evaluation_criteria, custom_prompt')
        .limit(1)
        .maybeSingle();

      if (fallbackError) {
        console.error(`[AI Analyzer] Error fetching fallback playbook:`, fallbackError);
      } else if (fallbackPlaybook) {
        playbook = fallbackPlaybook;
        console.log(`[AI Analyzer] Fallback playbook loaded successfully.`);
      } else {
        console.log(`[AI Analyzer] No playbooks found in database at all. Using default values.`);
      }
    } catch (err: any) {
      console.error(`[AI Analyzer] Failed to fetch fallback playbook:`, err);
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

  console.log("Playbook carregado:", playbook);

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

4. Polidez Não É Venda:
Não dê nota alta em Empatia ("scores.empathy") ou no Score Geral ("overall_score") apenas porque o atendente usou emojis ou foi educado. A nota exige a aplicação da técnica (investigação de objetivos e condução/fechamento ativa).

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
    if (err.status) console.error(`[AI Analyzer] OpenAI HTTP Status Code: ${err.status}`);
    if (err.message) console.error(`[AI Analyzer] OpenAI Error Message: ${err.message}`);
    if (err.code) console.error(`[AI Analyzer] OpenAI Error Code: ${err.code}`);
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

  // Step 5: Save analysis JSON to Supabase
  try {
    console.log(`[AI Analyzer] Saving analysis to database (analyses table) for conversation ${conversationId}...`);
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
}
