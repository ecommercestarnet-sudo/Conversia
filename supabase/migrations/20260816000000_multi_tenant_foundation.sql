-- 1. Drop existing 'companies' table and cascade its dependencies
DROP TABLE IF EXISTS public.companies CASCADE;

-- 2. Create organizations table
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    evolution_instance_name TEXT,
    whatsapp_status TEXT DEFAULT 'disconnected',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create users table
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Re-add organization_id to ai_playbooks
-- First, truncate ai_playbooks because it has existing test rows that would violate the NOT NULL constraint
TRUNCATE public.ai_playbooks CASCADE;
ALTER TABLE public.ai_playbooks DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.ai_playbooks ADD COLUMN organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. Set up Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_playbooks ENABLE ROW LEVEL SECURITY;

-- Policies for organizations
CREATE POLICY "Users can view their own organization" ON public.organizations FOR SELECT USING (id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Superadmins can view all organizations" ON public.organizations FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Superadmins can insert organizations" ON public.organizations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Admins can update their organization" ON public.organizations FOR UPDATE USING (id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Policies for users
CREATE POLICY "Users can view users in their organization" ON public.users FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Superadmins can view all users" ON public.users FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'));

-- Policies for ai_playbooks
CREATE POLICY "Users can view playbooks of their organization" ON public.ai_playbooks FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Admins can insert playbooks for their organization" ON public.ai_playbooks FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update playbooks for their organization" ON public.ai_playbooks FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete playbooks for their organization" ON public.ai_playbooks FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 6. Trigger to automatically create an organization and user upon auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  new_org_id UUID;
  user_email TEXT;
  org_slug TEXT;
BEGIN
  user_email := NEW.email;
  org_slug := split_part(user_email, '@', 1) || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.organizations (name, slug)
  VALUES (split_part(user_email, '@', 1), org_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO public.users (id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'admin');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

