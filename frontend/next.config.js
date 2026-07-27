const { buildCsp } = require('./lib/csp')

const isProd = process.env.NODE_ENV === 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Staging (dev mode, porta separada) usa um distDir próprio — senão o `next dev`
  // reescreve o mesmo `.next/` que o processo de produção serve, corrompendo-o ao vivo.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ]
  },
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy', value: buildCsp() },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]
    if (isProd) headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' })
    return [{ source: '/:path*', headers }]
  },
}

module.exports = nextConfig
