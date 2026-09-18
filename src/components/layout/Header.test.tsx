// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const { Header } = await import('./Header');

afterEach(() => {
  cleanup();
});

describe('Header', () => {
  it('a logo aponta pra home ("/")', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: /toursflow, página inicial/i }).getAttribute('href')).toBe('/');
  });

  it('CTA "Buscar passeios" (desktop) aponta pra /passeios', () => {
    render(<Header />);
    // Duas ocorrências do CTA: a solta do desktop e a dentro do MobileMenu
    // (fechado por padrão, não renderizada) -- só uma deve estar no DOM agora.
    const ctas = screen.getAllByRole('link', { name: /buscar passeios/i });
    expect(ctas).toHaveLength(1);
    expect(ctas[0].getAttribute('href')).toBe('/passeios');
  });

  it('nenhuma comunicação voltada a operador/NauticFlow no header', () => {
    render(<Header />);
    expect(screen.queryByText(/sou operador/i)).toBeNull();
    expect(screen.queryByText(/nauticflow/i)).toBeNull();
  });

  it('nenhum link inventado (login, favoritos, minha conta, reservas, suporte, blog)', () => {
    render(<Header />);
    for (const term of [/^login$/i, /favoritos/i, /minha conta/i, /^reservas$/i, /suporte/i, /^blog$/i]) {
      expect(screen.queryByText(term)).toBeNull();
    }
  });

  it('renderiza a nav de Passeios/Destinos/Como funciona e o botão de menu mobile', () => {
    render(<Header />);
    expect(screen.getByRole('navigation', { name: /principal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /abrir menu/i })).toBeTruthy();
  });
});
