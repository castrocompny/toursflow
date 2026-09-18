import { describe, expect, it } from 'vitest';
import { HEADER_NAV_LINKS, isNavLinkActive } from './header-nav-links';

describe('HEADER_NAV_LINKS', () => {
  it('só os 3 links reais do ToursFlow — nada inventado (login, favoritos, etc.)', () => {
    expect(HEADER_NAV_LINKS.map((link) => link.label)).toEqual(['Passeios', 'Destinos', 'Como funciona']);
  });

  it('"Como funciona" aponta pra âncora na home, não pra uma página nova', () => {
    const link = HEADER_NAV_LINKS.find((item) => item.label === 'Como funciona');
    expect(link?.href).toBe('/#como-funciona');
  });
});

describe('isNavLinkActive', () => {
  it('true quando o pathname bate exatamente com o href', () => {
    expect(isNavLinkActive('/passeios', '/passeios')).toBe(true);
    expect(isNavLinkActive('/destinos', '/destinos')).toBe(true);
  });

  it('true numa sub-rota (ex.: página de detalhe do passeio ainda conta como "Passeios" ativo)', () => {
    expect(isNavLinkActive('/passeios/buzios/algum-passeio', '/passeios')).toBe(true);
  });

  it('false quando a rota é outra', () => {
    expect(isNavLinkActive('/destinos', '/passeios')).toBe(false);
  });

  it('false quando o href é só um prefixo textual, não uma sub-rota real (ex.: "/passeios-x")', () => {
    expect(isNavLinkActive('/passeios-x', '/passeios')).toBe(false);
  });

  it('home ("/") só ativa em "/", nunca em toda sub-rota (senão tudo ficaria ativo)', () => {
    expect(isNavLinkActive('/', '/')).toBe(true);
    expect(isNavLinkActive('/passeios', '/')).toBe(false);
  });

  it('âncora (com "#") nunca conta como rota ativa, mesmo estando na home', () => {
    expect(isNavLinkActive('/', '/#como-funciona')).toBe(false);
  });
});
