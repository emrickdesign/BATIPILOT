import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register')

  // Un salarié authentifié par code PIN (src/lib/employeeSession.ts, cookie bp_employee_session)
  // peut ne pas avoir de session Supabase admin sur son appareil (tel perso, tablette dédiée).
  // Sa session propre est vérifiée par chaque server action (currentSender) ; le proxy ne doit
  // pas bloquer /terrain sur la seule absence de session admin, sinon toute la messagerie
  // salarié (et /terrain en général) redirige vers /login avant même d'atteindre l'action.
  const hasEmployeeCookie = request.nextUrl.pathname.startsWith('/terrain') &&
    !!request.cookies.get('bp_employee_session')?.value

  // Page de signature électronique : accessible au client final sans aucune session,
  // la sécurité repose sur le token (uuid non-devinable) dans l'URL, pas sur l'auth.
  const isPublicSignaturePath = request.nextUrl.pathname.startsWith('/signature/') ||
    request.nextUrl.pathname.startsWith('/api/signature/')

  if (!user && !isAuthPage && !hasEmployeeCookie && !isPublicSignaturePath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
