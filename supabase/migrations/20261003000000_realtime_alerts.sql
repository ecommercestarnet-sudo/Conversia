-- Motor de alertas em tempo real
-- 1) Controle de alertas por TIPO (panfletagem / objecao_abandonada / desistencia_passiva),
--    para que uma infração de processo não bloqueie um alerta de objeção na mesma conversa.
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS alerts_sent JSONB DEFAULT '[]'::jsonb;

-- 2) Varredura a cada minuto: dispara o alerta de objeção quando o vendedor
--    NÃO respondeu dentro do tempo de tolerância configurado no Playbook.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('conversia-sweep-alerts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conversia-sweep-alerts');

SELECT cron.schedule(
  'conversia-sweep-alerts',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://erojwnigzuhnzxjsdbxe.supabase.co/functions/v1/whatsapp-webhook',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "sweep_alerts"}'::jsonb
  );
  $$
);
