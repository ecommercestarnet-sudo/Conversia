CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  new_org_id UUID;
  user_email TEXT;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  user_email := NEW.email;
  
  -- Extract company name from metadata or fallback to email prefix
  org_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', split_part(user_email, '@', 1));
  
  -- Generate slug from company name
  org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := trim(both '-' from org_slug);
  org_slug := org_slug || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO public.users (id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'admin');

  RETURN NEW;
END;
$$;
