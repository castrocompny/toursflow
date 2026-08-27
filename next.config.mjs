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
};

export default nextConfig;
