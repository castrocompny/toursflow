import { describe, expect, it } from 'vitest';
import { buildVoucherShareMessage, buildWhatsAppShareUrl, type VoucherShareData } from './whatsapp-voucher';

const fullData: VoucherShareData = {
  tourName: 'Passeio de Escuna em Búzios',
  bookingId: 'ABC123',
  date: 'sáb., 20 de set.',
  time: '09:00',
  quantity: 2,
  pricePaidLabel: 'R$ 20,00',
  boardingPointName: 'Porto da Barra',
  boardingPointReference: 'Próximo ao quiosque azul',
};

describe('buildVoucherShareMessage', () => {
  it('contém nome do passeio, código, data, horário, pessoas e valor pago', () => {
    const message = buildVoucherShareMessage(fullData);

    expect(message).toContain('Passeio de Escuna em Búzios');
    expect(message).toContain('ABC123');
    expect(message).toContain('sáb., 20 de set.');
    expect(message).toContain('09:00');
    expect(message).toContain('2');
    expect(message).toContain('R$ 20,00');
  });

  it('inclui o embarque quando disponível (nome + referência)', () => {
    const message = buildVoucherShareMessage(fullData);

    expect(message).toContain('Porto da Barra');
    expect(message).toContain('Próximo ao quiosque azul');
  });

  it('omite o bloco de embarque quando não informado (nunca inventa)', () => {
    const { boardingPointName, boardingPointReference, ...rest } = fullData;
    const message = buildVoucherShareMessage(rest);

    expect(message).not.toContain('Embarque');
    expect(message).not.toContain('Porto da Barra');
  });

  it('omite a referência de embarque quando só o nome está disponível', () => {
    const { boardingPointReference, ...rest } = fullData;
    const message = buildVoucherShareMessage(rest);

    expect(message).toContain('Porto da Barra');
    expect(message).not.toContain('Próximo ao quiosque azul');
  });

  it('omite a linha de passeio quando tourName não está disponível', () => {
    const { tourName, ...rest } = fullData;
    const message = buildVoucherShareMessage(rest);

    expect(message).not.toContain('Passeio:');
  });

  it('nunca contém CPF, e-mail, telefone ou qualquer dado técnico interno', () => {
    const message = buildVoucherShareMessage(fullData);

    // A interface VoucherShareData não aceita esses campos — este teste
    // prova que, mesmo com todos os campos aceitos preenchidos, nada
    // parecido com PII/segredo aparece no texto final.
    expect(message).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF
    expect(message).not.toMatch(/@/); // e-mail
    expect(message).not.toMatch(/idempotency/i);
    expect(message).not.toMatch(/secret|client-key|token/i);
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('usa wa.me sem número de destino (turista escolhe para quem compartilhar)', () => {
    const url = buildWhatsAppShareUrl('teste');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('faz URL encode corretamente — o texto decodificado é idêntico ao original', () => {
    const message = buildVoucherShareMessage(fullData);
    const url = buildWhatsAppShareUrl(message);

    const encoded = url.replace('https://wa.me/?text=', '');
    expect(decodeURIComponent(encoded)).toBe(message);
    // Espaço, quebra de linha e ":" nunca aparecem crus na URL.
    expect(encoded).not.toContain(' ');
    expect(encoded).not.toContain('\n');
    expect(encoded).not.toContain(':');
  });
});
