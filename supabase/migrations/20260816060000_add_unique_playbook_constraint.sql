-- Clean up duplicates in case they exist (keeping the newest playbook per organization)
DELETE FROM public.ai_playbooks a USING public.ai_playbooks b 
WHERE a.created_at < b.created_at AND a.organization_id = b.organization_id;

-- Add unique constraint on organization_id to allow upserting (INSERT ... ON CONFLICT)
ALTER TABLE public.ai_playbooks 
ADD CONSTRAINT ai_playbooks_organization_id_key UNIQUE (organization_id);
