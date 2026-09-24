// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TourChecklist } from './TourChecklist';

afterEach(() => {
  cleanup();
});

describe('TourChecklist', () => {
  it('mostra as duas colunas quando ambas têm itens', () => {
    render(<TourChecklist included={['Colete salva-vidas']} notIncluded={['Almoço']} />);
    expect(screen.getByText('O que está incluído')).toBeTruthy();
    expect(screen.getByText('O que não está incluído')).toBeTruthy();
    expect(screen.getByText('Colete salva-vidas')).toBeTruthy();
    expect(screen.getByText('Almoço')).toBeTruthy();
  });

  it('omite a coluna "incluído" quando a lista vem vazia (nunca um cabeçalho sem conteúdo)', () => {
    render(<TourChecklist included={[]} notIncluded={['Almoço']} />);
    expect(screen.queryByText('O que está incluído')).toBeNull();
    expect(screen.getByText('O que não está incluído')).toBeTruthy();
  });

  it('não renderiza nada quando as duas listas vêm vazias', () => {
    const { container } = render(<TourChecklist included={[]} notIncluded={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
