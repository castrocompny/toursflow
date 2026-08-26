/**
 * Gera as imagens placeholder usadas pelos MOCKS.
 * Rode com: node scripts/generate-placeholders.mjs
 * Ao integrar o NauticFlow, as fotos reais vêm do Storage e /public/img/mock
 * pode ser apagado por inteiro.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = join(process.cwd(), 'public', 'img', 'mock');
mkdirSync(out, { recursive: true });

const palettes = [
  ['#0A5F67', '#3FAFB6'],
  ['#072A38', '#0E7C86'],
  ['#0E7C86', '#7FD3D0'],
  ['#FF6A2B', '#FFB26B'],
  ['#0F3D4E', '#4A9DB0'],
  ['#12606B', '#F2C46B'],
];

function svg(label, sub, index) {
  const [a, b] = palettes[index % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <g fill="#FFFFFF" opacity="0.14">
    <path d="M0 620c120-40 200 40 320 0s200 40 320 0 200 40 320 0 200 40 240 20v160H0z"/>
    <path d="M0 690c140-36 220 36 340 0s200 36 320 0 200 36 320 0 180 26 220 12v98H0z" opacity="0.7"/>
  </g>
  <circle cx="1010" cy="180" r="86" fill="#FFFFFF" opacity="0.16"/>
  <text x="80" y="392" font-family="Verdana,Helvetica,sans-serif" font-size="62" font-weight="700" fill="#FFFFFF">${label}</text>
  <text x="80" y="452" font-family="Verdana,Helvetica,sans-serif" font-size="30" fill="#FFFFFF" opacity="0.82">${sub}</text>
  <text x="80" y="740" font-family="Verdana,Helvetica,sans-serif" font-size="22" letter-spacing="4" fill="#FFFFFF" opacity="0.7">IMAGEM DE EXEMPLO</text>
</svg>`;
}

function logoSvg(initials, index) {
  const [a, b] = palettes[index % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${initials}">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="40" fill="url(#lg)"/>
  <text x="100" y="122" font-family="Verdana,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#FFFFFF" text-anchor="middle">${initials}</text>
</svg>`;
}

const operatorLogos = [
  ['operators/mar-azul-turismo.svg', 'MA'],
  ['operators/costa-brava-passeios.svg', 'CB'],
  ['operators/farol-nautica.svg', 'FN'],
  ['operators/lagoa-marina.svg', 'LM'],
  ['operators/ilha-grande-boat-tours.svg', 'IG'],
  ['operators/saveiro-da-baia.svg', 'SB'],
];

operatorLogos.forEach(([file, initials], index) => {
  const target = join(out, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, logoSvg(initials, index), 'utf8');
});

const items = [
  ['tours/lancha-ilhas-1.svg', 'Passeio de Lancha', 'Ilhas de Búzios'],
  ['tours/lancha-ilhas-2.svg', 'Parada para banho', 'Ilha Feia'],
  ['tours/lancha-ilhas-3.svg', 'A bordo', 'Lancha 30 pés'],
  ['tours/escuna-buzios-1.svg', 'Escuna Búzios', 'Roteiro clássico'],
  ['tours/escuna-buzios-2.svg', 'Praias do roteiro', 'João Fernandes'],
  ['tours/pordosol-1.svg', 'Pôr do sol', 'Orla Bardot'],
  ['tours/pordosol-2.svg', 'Fim de tarde', 'Búzios'],
  ['tours/arraial-barco-1.svg', 'Arraial do Cabo', 'Barco compartilhado'],
  ['tours/arraial-barco-2.svg', 'Água transparente', 'Prainhas'],
  ['tours/arraial-privativo-1.svg', 'Lancha privativa', 'Arraial do Cabo'],
  ['tours/jetski-1.svg', 'Jet ski guiado', 'Cabo Frio'],
  ['tours/cabofrio-escuna-1.svg', 'Escuna Cabo Frio', 'Praia do Forte'],
  ['tours/angra-ilhas-1.svg', 'Ilhas de Angra', 'Dia inteiro'],
  ['tours/angra-ilhas-2.svg', 'Lagoa Azul', 'Angra dos Reis'],
  ['tours/paraty-1.svg', 'Baía de Paraty', 'Saveiro'],
  ['tours/mergulho-1.svg', 'Batismo de mergulho', 'Arraial do Cabo'],
  ['destinations/buzios.svg', 'Búzios', 'Rio de Janeiro'],
  ['destinations/arraial-do-cabo.svg', 'Arraial do Cabo', 'Rio de Janeiro'],
  ['destinations/cabo-frio.svg', 'Cabo Frio', 'Rio de Janeiro'],
  ['destinations/angra-dos-reis.svg', 'Angra dos Reis', 'Rio de Janeiro'],
  ['destinations/paraty.svg', 'Paraty', 'Rio de Janeiro'],
  ['og-cover.svg', 'ToursFlow', 'Encontre seu próximo passeio'],
];

items.forEach(([file, label, sub], index) => {
  const target = join(out, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, svg(label, sub, index), 'utf8');
});

console.log(`${items.length + operatorLogos.length} imagens geradas em public/img/mock`);
