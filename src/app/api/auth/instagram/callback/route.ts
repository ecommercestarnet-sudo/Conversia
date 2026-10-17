import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '2457047531452520';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || 'eff478aee445118cf14a1aadf30862cf';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contém o tenant_slug
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://conversia-two.vercel.app';
  const tenantSlug = state?.replace(/#_$/, '').trim() || '';

  if (error || !code) {
    console.error('[INSTAGRAM OAUTH] Error in callback:', error, errorReason);
    return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?error=${encodeURIComponent(errorReason || error || 'instagram_auth_cancelled')}`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/instagram/callback`;
    // Remove trailing #_ if Instagram appended it to code
    const cleanCode = code.replace(/#_$/, '').trim();

    // 1. Trocar code por Token de curta duração na API do Instagram (application/x-www-form-urlencoded)
    const params = new URLSearchParams();
    params.append('client_id', INSTAGRAM_APP_ID);
    params.append('client_secret', INSTAGRAM_APP_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);
    params.append('code', cleanCode);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();

    // A API do Instagram Business pode retornar { data: [{ access_token, user_id }] } ou { access_token, user_id }
    const tokenEntry = Array.isArray(tokenData.data) ? tokenData.data[0] : tokenData;
    const shortLivedToken = tokenEntry?.access_token;
    const instagramUserId = tokenEntry?.user_id;

    if (tokenData.error_type || tokenData.error_message || !shortLivedToken) {
      console.error('[INSTAGRAM OAUTH] Failed to exchange code for token:', tokenData);
      const errMsg = tokenData.error_message || tokenData.error?.message || 'Falha ao obter token do Instagram';
      return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?error=${encodeURIComponent(errMsg)}`);
    }

    // 2. Trocar por Token de Longa Duração (60 dias)
    let accessToken = shortLivedToken;
    try {
      const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
      const longTokenRes = await fetch(longTokenUrl);
      const longTokenData = await longTokenRes.json();
      if (longTokenData.access_token) {
        accessToken = longTokenData.access_token;
      }
    } catch (ltErr) {
      console.warn('[INSTAGRAM OAUTH] Could not exchange for long-lived token, using short-lived:', ltErr);
    }

    // 3. Buscar detalhes do usuário do Instagram (Username e ID real)
    let instagramUsername = 'ailton.bf';
    let finalIgId = String(instagramUserId || '');
    try {
      const userRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,user_id,username,name,account_type&access_token=${accessToken}`);
      const userData = await userRes.json();
      if (userData.username) {
        instagramUsername = userData.username;
      }
      if (userData.user_id || userData.id) {
        finalIgId = String(userData.user_id || userData.id);
      }
    } catch (uErr) {
      console.warn('[INSTAGRAM OAUTH] Could not fetch username:', uErr);
    }

    // 4. Salvar na organização no Supabase usando o cliente autenticado do usuário!
    const supabase = await createClient();

    if (tenantSlug) {
      const { data: updatedRows, error: updateError } = await supabase
        .from('organizations')
        .update({
          instagram_account_id: finalIgId,
          instagram_username: instagramUsername,
          instagram_access_token: accessToken,
          instagram_status: 'connected'
        })
        .eq('slug', tenantSlug)
        .select('id, slug, instagram_status, instagram_username');

      if (updateError) {
        console.error('[INSTAGRAM OAUTH] Database update error:', updateError);
        return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?error=${encodeURIComponent('Erro ao salvar no banco: ' + updateError.message)}`);
      }

      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?error=${encodeURIComponent('Permissão negada ou empresa não encontrada no banco para o slug: ' + tenantSlug)}`);
      }
    }

    revalidatePath(`/${tenantSlug}/dashboard/canais`, 'page');
    revalidatePath(`/${tenantSlug}/dashboard`, 'page');

    return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?status=instagram_connected`);
  } catch (err: any) {
    console.error('[INSTAGRAM OAUTH] Unexpected error:', err);
    return NextResponse.redirect(`${baseUrl}/${tenantSlug}/dashboard/canais?error=${encodeURIComponent(err.message || 'server_error')}`);
  }
}
