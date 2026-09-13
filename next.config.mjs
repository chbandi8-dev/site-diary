/** @type {import('next').NextConfig} */

// Only hosts we actually serve images from. A wildcard here turns the Next
// image optimizer into an open proxy for arbitrary remote images.
const photoHost = process.env.R2_PUBLIC_BASE_URL
  ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
  : undefined;

const nextConfig = {
  images: {
    remotePatterns: [...(photoHost ? [{ protocol: "https", hostname: photoHost }] : [])],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The owner page carries a house link in the session. Referrer leakage
          // is the cheapest way for a token or a private URL to reach a third
          // party through an outbound click.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
