import type { Metadata } from 'next';
import { site } from './site';

interface PageSeo {
  title: string;
  description: string;
  path: string;
  image?: string;
}

/** Imagens do mock são caminho relativo (`/img/...`); fotos reais do NauticFlow já são URL absoluta (signed URL). */
function absoluteImageUrl(image: string): string {
  return /^https?:\/\//.test(image) ? image : `${site.url}${image}`;
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
      images: image ? [{ url: absoluteImageUrl(image) }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
