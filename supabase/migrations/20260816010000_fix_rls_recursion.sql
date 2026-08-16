-- 1. Create a helper function to get the user's organization ID
-- We use SECURITY DEFINER so that this function bypasses RLS checks, avoiding infinite recursion.
CREATE OR REPLACE FUNCTION public.get_user_org_id(user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT organization_id FROM public.users WHERE id = user_id);
END;
$$;

-- 2. Drop old recursive/problematic policies
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can view users in their organization" ON public.users;
DROP POLICY IF EXISTS "Users can view playbooks of their organization" ON public.ai_playbooks;
DROP POLICY IF EXISTS "Admins can insert playbooks for their organization" ON public.ai_playbooks;
DROP POLICY IF EXISTS "Admins can update playbooks for their organization" ON public.ai_playbooks;
DROP POLICY IF EXISTS "Admins can delete playbooks for their organization" ON public.ai_playbooks;

-- 3. Re-create policies using the non-recursive helper function
-- Policies for organizations
CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
USING (id = public.get_user_org_id(auth.uid()));

-- Policies for users
CREATE POLICY "Users can view users in their organization"
ON public.users
FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

-- Policies for ai_playbooks
CREATE POLICY "Users can view playbooks of their organization"
ON public.ai_playbooks
FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can insert playbooks for their organization"
ON public.ai_playbooks
FOR INSERT
WITH CHECK (
  organization_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admins can update playbooks for their organization"
ON public.ai_playbooks
FOR UPDATE
USING (
  organization_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admins can delete playbooks for their organization"
ON public.ai_playbooks
FOR DELETE
USING (
  organization_id = public.get_user_org_id(auth.uid()) 
  AND 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);
