-- Migration SQL to add Instagram fields to organizations and conversations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS instagram_account_id text,
ADD COLUMN IF NOT EXISTS instagram_username text,
ADD COLUMN IF NOT EXISTS instagram_access_token text,
ADD COLUMN IF NOT EXISTS instagram_status text DEFAULT 'disconnected';

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp',
ADD COLUMN IF NOT EXISTS instagram_sender_id text;

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations(channel);

-- Função SECURITY DEFINER para o Webhook do Instagram localizar a organização sem depender de service_role na Vercel
CREATE OR REPLACE FUNCTION public.get_instagram_webhook_org(p_ig_account_id text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org RECORD;
BEGIN
  SELECT id, name, slug, instagram_account_id, instagram_access_token
  INTO v_org
  FROM public.organizations
  WHERE instagram_account_id = p_ig_account_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    SELECT id, name, slug, instagram_account_id, instagram_access_token
    INTO v_org
    FROM public.organizations
    WHERE instagram_status = 'connected'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_org.id IS NULL THEN
    SELECT id, name, slug, instagram_account_id, instagram_access_token
    INTO v_org
    FROM public.organizations
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'instagram_account_id', v_org.instagram_account_id,
    'instagram_access_token', v_org.instagram_access_token
  );
END;
$$;

-- Função SECURITY DEFINER para o Webhook do Instagram criar/atualizar a conversa e inserir a mensagem
CREATE OR REPLACE FUNCTION public.save_instagram_webhook_message(
  p_org_id uuid,
  p_client_identifier text,
  p_customer_id text,
  p_sender_type text,
  p_content text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id public.conversations.id%TYPE;
  v_msg_id public.messages.id%TYPE;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE organization_id = p_org_id
    AND (
      client_phone = p_client_identifier
      OR client_phone = p_customer_id
      OR instagram_sender_id = p_customer_id
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (
      organization_id,
      client_phone,
      instagram_sender_id,
      channel
    )
    VALUES (
      p_org_id,
      p_client_identifier,
      p_customer_id,
      'instagram'
    )
    RETURNING id INTO v_conv_id;
  ELSE
    UPDATE public.conversations
    SET
      client_phone = CASE
        WHEN p_client_identifier <> p_customer_id THEN p_client_identifier
        ELSE client_phone
      END,
      instagram_sender_id = COALESCE(instagram_sender_id, p_customer_id),
      channel = 'instagram'
    WHERE id = v_conv_id;
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_type,
    content
  )
  VALUES (
    v_conv_id,
    p_sender_type,
    p_content
  )
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'message_id', v_msg_id
  );
END;
$$;

