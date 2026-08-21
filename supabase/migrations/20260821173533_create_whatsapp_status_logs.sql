-- Create whatsapp_status_logs table
CREATE TABLE IF NOT EXISTS public.whatsapp_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'open' or 'close'
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.whatsapp_status_logs ENABLE ROW LEVEL SECURITY;

-- Select policy: Users can view logs of their organization
DROP POLICY IF EXISTS "Users can view status logs of their organization" ON public.whatsapp_status_logs;
CREATE POLICY "Users can view status logs of their organization"
ON public.whatsapp_status_logs
FOR SELECT
USING (company_id = public.get_user_org_id(auth.uid()));

-- Insert policy: Enable insert for webhook testing and service role
DROP POLICY IF EXISTS "Enable insert for all" ON public.whatsapp_status_logs;
CREATE POLICY "Enable insert for all"
ON public.whatsapp_status_logs
FOR INSERT
WITH CHECK (true);
