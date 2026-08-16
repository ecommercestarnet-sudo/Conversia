CREATE OR REPLACE FUNCTION public.delete_organization_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- 1. Get the role of the caller (bypassing RLS because function is security definer)
  SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
  
  -- 2. Check if the caller is a superadmin
  IF caller_role IS NULL OR caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas superadmins podem deletar organizações.';
  END IF;
  
  -- 3. Perform the delete
  DELETE FROM public.organizations WHERE id = org_id;
  RETURN FOUND;
END;
$$;
