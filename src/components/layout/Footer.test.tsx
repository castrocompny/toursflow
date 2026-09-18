// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Destination } from '@/types';
import { Footer } from './Footer';

afterEach(() => {
  cleanup();
});

function makeDestination(slug: string, name: string): Destination {
  return { id: slug, slug, name, state: 'RJ', tagline: '', description: '', image: '', highlights: [] };
}

const destinations: Destination[] = [makeDestination('buzios', 'Búzios')];

// Simula um catálogo grande vindo da API/repository, sem nenhuma cidade
// escrita no código — é assim que futuros destinos (Recife, Angra dos Reis
// etc.) entram no footer, sem alteração funcional no frontend.
const manyDestinations: Destination[] = [
  makeDestination('buzios', 'Búzios'),
  makeDestination('arraial-do-cabo', 'Arraial do Cabo'),
  makeDestination('cabo-frio', 'Cabo Frio'),
  makeDestination('angra-dos-reis', 'Angra dos Reis'),
  makeDestination('paraty', 'Paraty'),
  makeDestination('recife', 'Recife'),
  makeDestination('maragogi', 'Maragogi'),
  makeDestination('fernando-de-noronha', 'Fernando de Noronha'),
];

describe('Footer', () => {
  it('mostra "Castro Compny" como criadora do ToursFlow, sem link (nenhuma URL oficial configurada)', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText('Castro Compny')).toBeTruthy();
    expect(screen.getByText(/agência de tecnologia/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /castro compny/i })).toBeNull();
  });

  it('descrição da marca usa copy multidestino, sem mencionar "operadores locais"', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText(/passeios e experiências em diferentes destinos/i)).toBeTruthy();
    expect(screen.queryByText(/operadores locais/i)).toBeNull();
  });

  it('coluna "Explorar" tem os 5 links esperados, incluindo "Como funciona"', () => {
    render(<Footer destinations={destinations} />);
    const nav = screen.getByRole('navigation', { name: /explorar/i });
    expect(screen.getByText('Explorar')).toBeTruthy();
    expect(nav.querySelector('a[href="/passeios"]')).toBeTruthy();
    expect(nav.querySelector('a[href="/destinos"]')).toBeTruthy();
    expect(screen.getByText('Passeios privativos')).toBeTruthy();
    expect(screen.getByText('Passeios compartilhados')).toBeTruthy();
    expect(nav.querySelector('a[href="/#como-funciona"]')).toBeTruthy();
  });

  it('links de categoria usam os values reais da integração (passeio_privativo / passeio_compartilhado)', () => {
    render(<Footer destinations={destinations} />);
    const privativo = screen.getByText('Passeios privativos').closest('a');
    const compartilhado = screen.getByText('Passeios compartilhados').closest('a');
    expect(privativo?.getAttribute('href')).toBe('/passeios?categoria=passeio_privativo');
    expect(compartilhado?.getAttribute('href')).toBe('/passeios?categoria=passeio_compartilhado');
  });

  it('coluna "Destinos" lista os destinos reais recebidos e sempre tem "Ver todos os destinos"', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.getByText(/passeios em búzios/i)).toBeTruthy();
    const verTodos = screen.getByText(/ver todos os destinos/i).closest('a');
    expect(verTodos?.getAttribute('href')).toBe('/destinos');
  });

  it('com apenas 1 destino, mostra esse 1 destino (sem preencher com cidades fictícias)', () => {
    render(<Footer destinations={destinations} />);
    const nav = screen.getByRole('navigation', { name: /destinos/i });
    expect(nav.querySelectorAll('li')).toHaveLength(2); // 1 destino real + "Ver todos os destinos"
  });

  it('com muitos destinos, limita a coluna e ainda assim mantém "Ver todos os destinos"', () => {
    render(<Footer destinations={manyDestinations} />);
    const nav = screen.getByRole('navigation', { name: /destinos/i });
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(7); // 6 destinos (limite) + "Ver todos os destinos"
    expect(screen.queryByText(/passeios em fernando de noronha/i)).toBeNull();
    expect(screen.getByText(/ver todos os destinos/i)).toBeTruthy();
  });

  it('um destino não recebido via props nunca aparece (nenhuma cidade futura hardcoded)', () => {
    render(<Footer destinations={destinations} />);
    expect(screen.queryByText(/recife/i)).toBeNull();
    expect(screen.queryByText(/angra dos reis/i)).toBeNull();
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
