/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le package workspace `@salamarket/shared` est livré en TS source
  // (pas pré-compilé). Next 14 doit le passer dans son pipeline SWC
  // sinon les imports échouent en runtime.
  transpilePackages: ["@salamarket/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
  async redirects() {
    return [
      // /staff/preparation déprécié 2026-05-16 → /v2/preparation
      // (cf. app/staff/preparation/DEPRECATED.md). 301 permanente pour
      // que les bookmarks staff existants suivent.
      {
        source: "/staff/preparation",
        destination: "/v2/preparation",
        permanent: true,
      },
      {
        source: "/staff/preparation/:id",
        destination: "/v2/preparation/:id",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Autorise explicitement la caméra (scan code-barre) sur le
          // domaine self. Sans header, certains contextes PWA iOS et les
          // browsers paranoïaques bloquent getUserMedia silencieusement.
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
