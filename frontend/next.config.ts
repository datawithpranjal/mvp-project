import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // Next.js injects small inline bootstrap scripts during hydration.
          // A nonce-based CSP is the stronger long-term option, but this keeps
          // the deployed app functional while retaining the rest of the policy.
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.razorpay.com",
          "font-src 'self' data:",
          "connect-src 'self' https: http://localhost:*",
          "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com",
          "object-src 'none'"
        ].join("; ")
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")'
      }
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
