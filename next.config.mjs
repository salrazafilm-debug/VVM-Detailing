import { readFileSync } from 'node:fs';
// Local SEO pages (built by scripts/build-seo-pages.py). Each is public/<slug>.html, served at /<slug>.
const seoSlugs = JSON.parse(readFileSync(new URL('./scripts/seo-slugs.json', import.meta.url), 'utf8'));

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
      // one address per page: the .html version sends visitors (and Google) to the clean address
      ...seoSlugs.map(slug => ({ source: `/${slug}.html`, destination: `/${slug}`, permanent: true })),
    ];
  },
  // The whole site is public/index.html, served at the home page
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }, ...seoSlugs.map(slug => ({ source: `/${slug}`, destination: `/${slug}.html` }))] };
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
