-- Create operators table
CREATE TABLE IF NOT EXISTS public.operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    work_hours TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add operator_id to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL;

-- Enable Row Level Security (RLS) on operators
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- RLS policies for operators
DROP POLICY IF EXISTS "Users can view operators in their organization" ON public.operators;
CREATE POLICY "Users can view operators in their organization"
ON public.operators
FOR SELECT
USING (company_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert operators in their organization" ON public.operators;
CREATE POLICY "Admins can insert operators in their organization"
ON public.operators
FOR INSERT
WITH CHECK (
  company_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS "Admins can update operators in their organization" ON public.operators;
CREATE POLICY "Admins can update operators in their organization"
ON public.operators
FOR UPDATE
USING (
  company_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS "Admins can delete operators in their organization" ON public.operators;
CREATE POLICY "Admins can delete operators in their organization"
ON public.operators
FOR DELETE
USING (
  company_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);
