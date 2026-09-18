// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockedPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname,
}));

const { MobileMenu } = await import('./MobileMenu');

afterEach(() => {
  cleanup();
  mockedPathname = '/';
});

function menuButton() {
  return screen.getByRole('button', { name: /abrir menu|fechar menu/i });
}

describe('MobileMenu', () => {
  it('começa fechado: aria-expanded="false", painel não existe no DOM', () => {
    render(<MobileMenu />);
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Passeios' })).toBeNull();
  });

  it('clicar no botão abre o painel: aria-expanded="true", aria-controls aponta pro id do painel', () => {
    render(<MobileMenu />);
    fireEvent.click(menuButton());

    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    const controlsId = menuButton().getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId!)).toBeTruthy();
  });

  it('painel aberto mostra Passeios, Destinos, Como funciona e o CTA Buscar passeios', () => {
    render(<MobileMenu />);
    fireEvent.click(menuButton());

    expect(screen.getByRole('link', { name: 'Passeios' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Destinos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Como funciona' })).toBeTruthy();
    const cta = screen.getByRole('link', { name: /buscar passeios/i });
    expect(cta.getAttribute('href')).toBe('/passeios');
  });

  it('clicar de novo no botão fecha o painel', () => {
    render(<MobileMenu />);
    fireEvent.click(menuButton());
    expect(screen.queryByRole('link', { name: 'Passeios' })).toBeTruthy();

    fireEvent.click(menuButton());
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Passeios' })).toBeNull();
  });

  it('clicar num link do painel fecha o menu (não fica aberto depois de navegar)', () => {
    render(<MobileMenu />);
    fireEvent.click(menuButton());

    fireEvent.click(screen.getByRole('link', { name: 'Passeios' }));

    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Passeios' })).toBeNull();
  });

  it('botão tem alvo de toque adequado (>= 44px)', () => {
    render(<MobileMenu />);
    const button = menuButton();
    expect(button.className).toMatch(/h-11/);
    expect(button.className).toMatch(/w-11/);
  });
});
