import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    // If Supabase is not configured, just pass through
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')

  if (!user && !isAuthRoute && request.nextUrl.pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Se o usuário está logado e tentando acessar login/signup, redirecione para o tenant dashboard
  if (user && isAuthRoute) {
    const { data: userData } = await supabase
      .from('users')
      .select('organizations(slug)')
      .eq('id', user.id)
      .single()

    const slug = (userData?.organizations as any)?.slug
    if (slug) {
       const url = request.nextUrl.clone()
       url.pathname = `/${slug}/dashboard`
       return NextResponse.redirect(url)
    }
  }

  const pathname = request.nextUrl.pathname

  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    
    if (userData?.role !== 'superadmin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Regra do tenant_slug
  const match = pathname.match(/^\/([^\/]+)\/dashboard/);
  if (match && user) {
    const slugFromUrl = match[1];
    
    const { data: userData } = await supabase
      .from('users')
      .select('organizations(slug)')
      .eq('id', user.id)
      .single()

    const userSlug = (userData?.organizations as any)?.slug

    if (userSlug && userSlug !== slugFromUrl) {
      const url = request.nextUrl.clone()
      url.pathname = `/${userSlug}/dashboard`
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
