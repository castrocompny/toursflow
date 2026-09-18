// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockedPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname,
}));

const { HeaderNav } = await import('./HeaderNav');

afterEach(() => {
  cleanup();
  mockedPathname = '/';
});

describe('HeaderNav', () => {
  it('mostra os 3 links reais: Passeios, Destinos, Como funciona', () => {
    render(<HeaderNav />);
    expect(screen.getByRole('link', { name: 'Passeios' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Destinos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Como funciona' })).toBeTruthy();
  });

  it('"Como funciona" aponta pra âncora da home, não pra uma rota nova', () => {
    render(<HeaderNav />);
    expect(screen.getByRole('link', { name: 'Como funciona' }).getAttribute('href')).toBe('/#como-funciona');
  });

  it('marca "Passeios" como rota ativa (aria-current) quando o pathname é /passeios', () => {
    mockedPathname = '/passeios';
    render(<HeaderNav />);
    expect(screen.getByRole('link', { name: 'Passeios' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Destinos' }).getAttribute('aria-current')).toBeNull();
  });

  it('marca "Destinos" como ativo em sub-rota de destino', () => {
    mockedPathname = '/destinos/buzios';
    render(<HeaderNav />);
    expect(screen.getByRole('link', { name: 'Destinos' }).getAttribute('aria-current')).toBe('page');
  });

  it('nenhum link fica ativo na home ("/")', () => {
    mockedPathname = '/';
    render(<HeaderNav />);
    for (const label of ['Passeios', 'Destinos', 'Como funciona']) {
      expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBeNull();
    }
  });
});
