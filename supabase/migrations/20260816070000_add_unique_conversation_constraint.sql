-- 1. Create a temporary table to store the mapping of duplicates to survivors
CREATE TEMP TABLE conversation_merges AS
WITH ranked_conversations AS (
    SELECT 
        id,
        client_phone,
        organization_id,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY client_phone, organization_id 
            ORDER BY created_at ASC, id ASC
        ) as rn
    FROM public.conversations
),
survivors AS (
    SELECT id, client_phone, organization_id
    FROM ranked_conversations
    WHERE rn = 1
),
duplicates AS (
    SELECT rc.id as duplicate_id, s.id as survivor_id
    FROM ranked_conversations rc
    JOIN survivors s ON rc.client_phone = s.client_phone 
        AND (rc.organization_id = s.organization_id OR (rc.organization_id IS NULL AND s.organization_id IS NULL))
    WHERE rc.rn > 1
)
SELECT duplicate_id, survivor_id FROM duplicates;

-- 2. Update messages to point to the survivor conversations
UPDATE public.messages m
SET conversation_id = cm.survivor_id
FROM conversation_merges cm
WHERE m.conversation_id = cm.duplicate_id;

-- 3. Delete analyses associated with duplicate conversations to avoid unique constraint violations
DELETE FROM public.analyses a
USING conversation_merges cm
WHERE a.conversation_id = cm.duplicate_id;

-- 4. Delete the duplicate conversations
DELETE FROM public.conversations c
USING conversation_merges cm
WHERE c.id = cm.duplicate_id;

-- 5. Drop the temporary table
DROP TABLE conversation_merges;

-- 6. Add the unique constraint on (client_phone, organization_id)
-- Standard UNIQUE (client_phone, organization_id) constraint
ALTER TABLE public.conversations
ADD CONSTRAINT conversations_client_phone_organization_id_key UNIQUE (client_phone, organization_id);
