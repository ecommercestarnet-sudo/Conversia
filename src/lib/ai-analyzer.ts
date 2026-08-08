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

  // Step 2: Format conversation history
  let formattedHistory = '';
  try {
    formattedHistory = messages
      .map((msg) => {
        const sender = msg.sender_type === 'agent' ? 'atendente' : 'cliente';
        return `[${sender}]: ${msg.content}`;
      })
      .join('\n');
    console.log(`[AI Analyzer] Formatted chat history for conversation ${conversationId}:\n${formattedHistory}`);
  } catch (err: any) {
    console.error(`[AI Analyzer] Failed to format messages for conversation ${conversationId}:`, err);
    throw err;
  }

  // Step 3: Request OpenAI Completion
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
