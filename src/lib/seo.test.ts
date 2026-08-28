import { describe, expect, it } from 'vitest';
import { toSafeJsonLdScript } from './seo';

describe('toSafeJsonLdScript', () => {
  it('escapa "<" para que um valor com "</script>" não feche a tag <script>', () => {
    // Payload sintético equivalente a um nome de passeio malicioso vindo do
    // catálogo do NauticFlow — nunca executado, só usado como string de teste.
    const maliciousName = 'Teste </script><script>alert(1)</script>';

    const result = toSafeJsonLdScript({ name: maliciousName });

    // A substring "</script>" do dado não pode sobreviver literal na saída —
    // senão o navegador fecharia a tag <script type="application/ld+json">
    // antes do fim do JSON e o restante viraria HTML/script interpretado.
    expect(result.includes('</script>')).toBe(false);

    // O "<" precisa ter sido substituído pelo escape Unicode equivalente.
    expect(result.includes('\\u003c')).toBe(true);

    // Continua sendo JSON válido, e o round-trip recupera o dado original —
    // a proteção é só na representação textual embutida no HTML, não perda
    // ou corrupção do dado.
    const parsed = JSON.parse(result) as { name: string };
    expect(parsed.name).toBe(maliciousName);
  });

  it('não altera texto sem "<" (não muda visualmente nome/descrição legítimos)', () => {
    const data = { name: 'Passeio de escuna em Búzios', description: 'Saída às 9h, retorno às 17h.' };

    const result = toSafeJsonLdScript(data);

    expect(JSON.parse(result)).toEqual(data);
    expect(result.includes('\\u003c')).toBe(false);
  });

  it('produz JSON válido para uma estrutura com aninhamento (formato real do TouristTrip)', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: 'Passeio </script>malicioso',
      provider: { '@type': 'Organization', name: 'Operador </script>' },
      touristType: ['Mergulho </script>', 'Pesca'],
    };

    const result = toSafeJsonLdScript(data);

    expect(result.includes('</script>')).toBe(false);
    expect(JSON.parse(result)).toEqual(data);
  });
});
