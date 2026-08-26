import type { Metadata } from 'next';
import { site } from './site';

interface PageSeo {
  title: string;
  description: string;
  path: string;
  image?: string;
}

/** Metadata padrão de página, com canonical e Open Graph consistentes. */
export function pageMetadata({ title, description, path, image }: PageSeo): Metadata {
  const url = `${site.url}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      locale: 'pt_BR',
      type: 'website',
      images: image ? [{ url: `${site.url}${image}` }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
