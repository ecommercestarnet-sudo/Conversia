-- Funções SECURITY DEFINER para permitir que o analisador de IA (ai-analyzer.ts)
-- leia mensagens/playbook e salve a análise mesmo quando executado via Webhook na Vercel com chave anon/publishable.

CREATE OR REPLACE FUNCTION public.get_conversation_analysis_context(p_conversation_id text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv RECORD;
  v_org RECORD;
  v_playbook RECORD;
  v_messages JSONB;
BEGIN
  SELECT
    id,
    organization_id,
    client_phone,
    operator_id,
    alert_sent,
    last_analyzed_at,
    message_count_at_analysis
  INTO v_conv
  FROM public.conversations
  WHERE id::text = p_conversation_id
  LIMIT 1;

  IF v_conv.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'sender_type', m.sender_type,
        'content', m.content,
        'created_at', m.created_at
      )
      ORDER BY m.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_messages
  FROM public.messages m
  WHERE m.conversation_id = v_conv.id;

  IF v_conv.organization_id IS NOT NULL THEN
    SELECT id, name, evolution_instance_name, owner_whatsapp
    INTO v_org
    FROM public.organizations
    WHERE id = v_conv.organization_id
    LIMIT 1;

    SELECT organization_id, company_context, knowledge_base, evaluation_criteria, custom_prompt, alert_rules
    INTO v_playbook
    FROM public.ai_playbooks
    WHERE organization_id = v_conv.organization_id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'conversation', to_jsonb(v_conv),
    'organization', CASE WHEN v_org.id IS NOT NULL THEN to_jsonb(v_org) ELSE NULL END,
    'playbook', CASE WHEN v_playbook.organization_id IS NOT NULL THEN to_jsonb(v_playbook) ELSE NULL END,
    'messages', v_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_conversation_analysis_rpc(
  p_conversation_id text,
  p_overall_score numeric,
  p_scores jsonb,
  p_summary text,
  p_strengths jsonb,
  p_weaknesses jsonb,
  p_recommendations jsonb,
  p_objections jsonb,
  p_message_count integer
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id public.conversations.id%TYPE;
  v_existing_analysis_id public.analyses.id%TYPE;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE id::text = p_conversation_id
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_existing_analysis_id
  FROM public.analyses
  WHERE conversation_id = v_conv_id
  LIMIT 1;

  IF v_existing_analysis_id IS NOT NULL THEN
    UPDATE public.analyses
    SET
      overall_score = p_overall_score,
      scores = p_scores,
      summary = p_summary,
      strengths = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_strengths, '[]'::jsonb))),
      weaknesses = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_weaknesses, '[]'::jsonb))),
      recommendations = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_recommendations, '[]'::jsonb))),
      objections = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_objections, '[]'::jsonb))),
      created_at = timezone('utc'::text, now())
    WHERE id = v_existing_analysis_id;
  ELSE
    INSERT INTO public.analyses (
      conversation_id,
      overall_score,
      scores,
      summary,
      strengths,
      weaknesses,
      recommendations,
      objections
    )
    VALUES (
      v_conv_id,
      p_overall_score,
      p_scores,
      p_summary,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_strengths, '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_weaknesses, '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_recommendations, '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_objections, '[]'::jsonb)))
    );
  END IF;

  UPDATE public.conversations
  SET
    last_analyzed_at = timezone('utc'::text, now()),
    message_count_at_analysis = p_message_count
  WHERE id = v_conv_id;

  RETURN TRUE;
END;
$$;
