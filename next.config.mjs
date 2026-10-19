/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Old Squarespace pages: send visitors (and Google) to the matching spot on the new site
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/about', destination: '/', permanent: true },
      { source: '/contact', destination: '/#book', permanent: true },
      { source: '/appointments', destination: '/#book', permanent: true },
      { source: '/services-store', destination: '/#services', permanent: true },
      { source: '/services-store/:path*', destination: '/#services', permanent: true },
    ];
  },
  // The whole site is public/index.html, served at the home page
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }] };
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    return [
      { source: '/:path*', headers: security },
      // Images and uploads: cache for a day, so replacing a photo shows up the next day at the latest
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    ];
  },
};
export default nextConfig;
