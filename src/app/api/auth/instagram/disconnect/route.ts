import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ success: false, error: 'Slug is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    await supabase
      .from('organizations')
      .update({
        instagram_account_id: null,
        instagram_username: null,
        instagram_access_token: null,
        instagram_status: 'disconnected'
      })
      .eq('slug', slug);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
