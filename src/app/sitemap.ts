import type { MetadataRoute } from 'next';
import { listDestinations, listTourPaths } from '@/data/repository';
import { site } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [destinations, tourPaths] = await Promise.all([listDestinations(), listTourPaths()]);
  const now = new Date();

  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/passeios`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site.url}/destinos`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...destinations.map((destination) => ({
      url: `${site.url}/destinos/${destination.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...tourPaths.map((path) => ({
      url: `${site.url}/passeios/${path.destino}/${path.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
