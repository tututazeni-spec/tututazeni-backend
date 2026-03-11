import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",       // qualquer requisição para /api
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`, // encaminha para a API real
      },
    ];
  },
};

export default nextConfig;
