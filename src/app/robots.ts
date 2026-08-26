import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Filtros geram URLs quase idênticas: fora do índice.
        disallow: ['/passeios?'],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
