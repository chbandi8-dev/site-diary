/** @type {import('next').NextConfig} */

// Only hosts we actually serve images from. A wildcard here turns the Next
// image optimizer into an open proxy for arbitrary remote images.
const photoHost = process.env.R2_PUBLIC_BASE_URL
  ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
  : undefined;

const nextConfig = {
  images: {
    remotePatterns: [
      ...(photoHost ? [{ protocol: "https", hostname: photoHost }] : []),
    ],
  },
};

export default nextConfig;
