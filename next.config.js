/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              "frame-src 'self' https://docs.google.com https://api.leadconnectorhq.com https://services.leadconnectorhq.com https://*.leadconnectorhq.com https://app.gohighlevel.com https://www.youtube.com https://www.youtube-nocookie.com https://www.loom.com https://player.vimeo.com https://drive.google.com",
              "connect-src 'self' https://*.supabase.co https://services.leadconnectorhq.com https://api.leadconnectorhq.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
