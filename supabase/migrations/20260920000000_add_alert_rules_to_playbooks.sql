-- Migration: Adicionar configurações de alerta de resgate de vendas no ai_playbooks
-- Execute este script no SQL Editor do Supabase se desejar que as configurações fiquem salvas no banco.

ALTER TABLE public.ai_playbooks 
ADD COLUMN IF NOT EXISTS alert_rules JSONB DEFAULT '{
  "alert_on_price_unhandled": true,
  "alert_on_dry_price": true,
  "alert_on_drop_unhandled": true,
  "min_confidence_score": 85,
  "alert_phone_override": ""
}'::jsonb;
