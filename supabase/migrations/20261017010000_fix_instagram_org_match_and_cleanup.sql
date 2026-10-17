-- 1. Ajustar get_instagram_webhook_org para NÃO misturar eventos de outra conta de teste da Meta
CREATE OR REPLACE FUNCTION public.get_instagram_webhook_org(p_ig_account_id text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org RECORD;
BEGIN
  -- Busca exata pelo instagram_account_id da empresa conectada
  SELECT id, name, slug, instagram_account_id, instagram_access_token
  INTO v_org
  FROM public.organizations
  WHERE instagram_account_id = p_ig_account_id
  LIMIT 1;

  -- Fallback apenas se a organização conectada ainda estiver com instagram_account_id vazio
  IF v_org.id IS NULL THEN
    SELECT id, name, slug, instagram_account_id, instagram_access_token
    INTO v_org
    FROM public.organizations
    WHERE instagram_status = 'connected'
      AND (instagram_account_id IS NULL OR instagram_account_id = '')
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

-- 2. Limpar as conversas duplicadas/de teste (@640576815415348 e @projovem do teste anterior)
DELETE FROM public.conversations
WHERE client_phone IN ('640576815415348', 'projovem', '558592178768');
