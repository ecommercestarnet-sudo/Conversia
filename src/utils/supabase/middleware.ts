import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')

  if (!user && !isAuthRoute && request.nextUrl.pathname !== '/') {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Se o usuário está logado e tentando acessar login/signup, redirecione para o tenant dashboard
  if (user && isAuthRoute) {
    // Nós precisamos buscar o slug da organização do usuário
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

  // Middleware rules for /[tenant_slug]/dashboard and /admin
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
      return NextResponse.redirect(new URL('/', request.url)) // Or to their dashboard
    }
  }

  // Regra do tenant_slug
  // Se a rota for /[slug]/dashboard, garantir que o usuário pertence a esse slug
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
      // Bloqueia acesso a outro tenant e redireciona pro correto
      const url = request.nextUrl.clone()
      url.pathname = `/${userSlug}/dashboard`
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
