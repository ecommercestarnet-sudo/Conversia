-- Insert policy: Enable insert for webhook testing and service role
DROP POLICY IF EXISTS "Enable insert for all" ON public.whatsapp_status_logs;
CREATE POLICY "Enable insert for all"
ON public.whatsapp_status_logs
FOR INSERT
WITH CHECK (true);
