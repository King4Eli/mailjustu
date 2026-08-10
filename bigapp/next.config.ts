import type { NextConfig } from "next";

// /api/* is served directly by Route Handlers under app/api/ now -- the
// API used to be a separate Express service (mail_justu_api); its logic
// was absorbed in here (see lib/api/). No proxying needed.
//
// NOTE: not using output: 'standalone' -- its dependency-pruned
// node_modules doesn't include untraced files like scripts/bootstrap-admin.js,
// and this app is small enough that the extra image size from shipping
// full node_modules isn't worth that friction.
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/webmail", permanent: false }];
  },
};

export default nextConfig;
