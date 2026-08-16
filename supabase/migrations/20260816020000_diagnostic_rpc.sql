CREATE OR REPLACE FUNCTION public.check_db_diagnostics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auth_count INT;
  users_count INT;
  orgs_count INT;
  last_user RECORD;
  last_org RECORD;
  last_public_user RECORD;
  trigger_info RECORD;
  trigger_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO auth_count FROM auth.users;
  SELECT COUNT(*) INTO users_count FROM public.users;
  SELECT COUNT(*) INTO orgs_count FROM public.organizations;
  
  SELECT id, email, created_at INTO last_user FROM auth.users ORDER BY created_at DESC LIMIT 1;
  SELECT id, name, slug, created_at INTO last_org FROM public.organizations ORDER BY created_at DESC LIMIT 1;
  SELECT id, organization_id, role, created_at INTO last_public_user FROM public.users ORDER BY created_at DESC LIMIT 1;

  -- Check if the trigger exists on auth.users
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) INTO trigger_exists;

  -- Get some details of the trigger if it exists
  SELECT tgname, tgenabled, tgtype INTO trigger_info FROM pg_trigger WHERE tgname = 'on_auth_user_created' LIMIT 1;

  RETURN jsonb_build_object(
    'auth_users_count', auth_count,
    'public_users_count', users_count,
    'organizations_count', orgs_count,
    'last_auth_user', jsonb_build_object('id', last_user.id, 'email', last_user.email, 'created_at', last_user.created_at),
    'last_org', jsonb_build_object('id', last_org.id, 'name', last_org.name, 'slug', last_org.slug, 'created_at', last_org.created_at),
    'last_public_user', jsonb_build_object('id', last_public_user.id, 'organization_id', last_public_user.organization_id, 'role', last_public_user.role, 'created_at', last_public_user.created_at),
    'trigger_exists', trigger_exists,
    'trigger_details', jsonb_build_object('name', trigger_info.tgname, 'enabled', trigger_info.tgenabled, 'type', trigger_info.tgtype)
  );
END;
$$;
