import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent MIME type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking protection – allow same origin only
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stricter referrer to avoid leaking full URL to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny browser features not needed by this app
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  // Basic XSS protection for older browsers (modern ones use CSP)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // HSTS – enforce HTTPS for 1 year, include subdomains
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // Prevent search engines from indexing internal/staging pages if needed
  // Remove or adjust if you want public indexing
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Remove the X-Powered-By header to avoid leaking stack details
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/login", destination: "/?auth=login", permanent: false },
      { source: "/register", destination: "/?auth=register", permanent: false },
    ];
  },
};

export default nextConfig;
