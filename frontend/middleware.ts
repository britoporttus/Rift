import { NextRequest, NextResponse } from 'next/server'

// P3-50: defesa em profundidade — o gate real de sessão é 100% do backend (toda
// rota /api exige o cookie válido, 401 se não). Isto só evita que o app shell
// renderize (e pisque) atrás do /login para quem nem tem o cookie; não decodifica
// o JWT (ficaria preso ao runtime Node), só checa presença.
const COOKIE_NAME = 'rift_token'

export function middleware(req: NextRequest) {
  if (!req.cookies.has(COOKIE_NAME)) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/dominios/:path*',
    '/vazamentos/:path*',
    '/mapa/:path*',
    '/findings/:path*',
    '/reports/:path*',
    '/admin/:path*',
    '/engagement/:path*',
  ],
}
