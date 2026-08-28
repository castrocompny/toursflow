/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Host específico do Storage do projeto Supabase do NauticFlow, de onde
    // vêm as signed URLs das fotos dos passeios. Só este host — nunca
    // wildcard (`**.supabase.co`), mesmo que outros projetos Supabase
    // também usem esse domínio.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gggpihphjjxndpfntnvm.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
  },
  // Headers de segurança de baixo risco (Fase 2, 2026-08-28) — nenhum
  // depende do fluxo de reserva. CSP fica deliberadamente de fora: exigiria
  // investigação própria (hidratação do Next, JSON-LD inline via
  // dangerouslySetInnerHTML, fontes do Google Fonts) para não quebrar
  // nada — ver docs/SECURITY.md.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
