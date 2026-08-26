import type { BoardingPoint } from '@/types';

/**
 * Link do mapa para o ponto de embarque.
 * Com coordenadas do NauticFlow usa lat/lng; sem elas, cai para o endereço.
 */
export function boardingMapUrl(point: BoardingPoint): string {
  if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  }
  const query = [point.name, point.address, point.district, point.city, point.state, point.zipCode]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function fullAddress(point: BoardingPoint): string {
  const base = `${point.district} — ${point.city}/${point.state}`;
  return point.zipCode ? `${base}, CEP ${point.zipCode}` : base;
}
