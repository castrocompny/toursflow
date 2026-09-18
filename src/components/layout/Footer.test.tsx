// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Destination } from '@/types';
import { Footer } from './Footer';

afterEach(() => {
  cleanup();
});

const destinations: Destination[] = [
  { id: 'dest-1', slug: 'buzios', name: 'Búzios', state: 'RJ', tagline: '', description: '', image: '', highlights: [] },
];

describe('Footer', () => {
  it('mostra "Castro Compny" como criadora do ToursFlow, sem link (nenhuma URL oficial configurada)', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText('Castro Compny')).toBeTruthy();
    expect(screen.getByText(/agência de tecnologia/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /castro compny/i })).toBeNull();
  });

  it('coluna "Explorar" tem os 4 links esperados', () => {
    render(<Footer destinations={destinations} />);
    const nav = screen.getByRole('navigation', { name: /explorar/i });
    expect(screen.getByText('Explorar')).toBeTruthy();
    expect(nav.querySelector('a[href="/passeios"]')).toBeTruthy();
    expect(nav.querySelector('a[href="/destinos"]')).toBeTruthy();
    expect(screen.getByText('Passeios privativos')).toBeTruthy();
    expect(screen.getByText('Passeios compartilhados')).toBeTruthy();
  });

  it('coluna "Destinos" lista os destinos reais recebidos', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText(/passeios em búzios/i)).toBeTruthy();
  });

  it('nenhuma comunicação promocional para operador (Sou operador / NauticFlow)', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.queryByText(/sou operador/i)).toBeNull();
    expect(screen.queryByText(/nauticflow/i)).toBeNull();
  });

  it('disclaimer legal de operação independente continua presente', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText(/empresas independentes/i)).toBeTruthy();
  });
});
