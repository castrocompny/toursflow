/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Mocks usam SVG local em /public. Ao integrar o NauticFlow/Supabase,
    // liberar aqui o host do Storage (ex.: <projeto>.supabase.co).
    remotePatterns: [],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
  },
};

export default nextConfig;
