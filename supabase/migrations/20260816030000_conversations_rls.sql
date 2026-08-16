-- 1. Truncate existing test conversations, messages, and analyses to clean up dead foreign keys
TRUNCATE TABLE public.analyses, public.messages, public.conversations CASCADE;

-- 2. Rename column company_id to organization_id in conversations
ALTER TABLE public.conversations RENAME COLUMN company_id TO organization_id;

-- 3. Add foreign key constraint to organizations table
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 4. Enable RLS on conversations, messages, and analyses
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- 5. Drop old policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Admins can update conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Admins can delete conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can view messages in their organization" ON public.messages;
DROP POLICY IF EXISTS "Users can view analyses in their organization" ON public.analyses;

-- 6. Create new non-recursive RLS policies for conversations
CREATE POLICY "Users can view conversations in their organization"
ON public.conversations
FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update conversations in their organization"
ON public.conversations
FOR UPDATE
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete conversations in their organization"
ON public.conversations
FOR DELETE
USING (organization_id = public.get_user_org_id(auth.uid()));

-- 7. Create RLS policies for messages
CREATE POLICY "Users can view messages in their organization"
ON public.messages
FOR SELECT
USING (conversation_id IN (
  SELECT id FROM public.conversations 
  WHERE organization_id = public.get_user_org_id(auth.uid())
));

-- 8. Create RLS policies for analyses
CREATE POLICY "Users can view analyses in their organization"
ON public.analyses
FOR SELECT
USING (conversation_id IN (
  SELECT id FROM public.conversations 
  WHERE organization_id = public.get_user_org_id(auth.uid())
));
