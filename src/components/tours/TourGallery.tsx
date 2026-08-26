'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { TourImage } from '@/types';

interface TourGalleryProps {
  images: TourImage[];
  title: string;
}

/**
 * Uma foto grande e miniaturas. No celular vira carrossel horizontal com
 * rolagem por toque, sem controles extras na tela.
 */
export function TourGallery({ images, title }: TourGalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) return null;

  return (
    <section aria-label={`Fotos de ${title}`} className="space-y-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-foam sm:aspect-[16/9]">
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Ver foto ${index + 1}: ${image.alt}`}
              aria-current={index === active}
              className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-xl transition-opacity ${
                index === active ? 'ring-2 ring-sea' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={image.url} alt="" fill sizes="112px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
