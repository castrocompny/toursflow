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
    // Recomendação oficial do Next.js ao ligar `dangerouslyAllowSVG`:
    // "particularly important... to prevent scripts embedded in the image
    // from executing" — `contentDispositionType: attachment` já cobre o
    // vetor principal (força download em vez de renderizar inline ao
    // navegar direto pra URL da imagem), esta CSP é a camada adicional de
    // defesa em profundidade recomendada junto. Achado de auditoria de
    // segurança (Fase 1, MEDIUM-3), corrigido na Fase 2.
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
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
