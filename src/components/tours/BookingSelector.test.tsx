// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';
import { BookingSelector } from './BookingSelector';

afterEach(() => {
  cleanup();
});

/** Sem @testing-library/jest-dom no projeto — checa a propriedade DOM direto. */
function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled;
}

const available: Departure = {
  id: 'dep-1',
  tourId: 'tour-1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  soldOut: false,
};

const soldOut: Departure = { ...available, id: 'dep-2', departsAt: '2026-10-18T17:00:00+00:00', soldOut: true };
const perGroup: Departure = { ...available, id: 'dep-3', priceType: 'per_group', price: 200 };
const startingFrom: Departure = { ...available, id: 'dep-4', priceType: 'starting_from', price: 100 };
const perBoat: Departure = { ...available, id: 'dep-5', priceType: 'per_boat', price: 1200 };

describe('BookingSelector', () => {
  it('estado vazio quando não há nenhuma saída', () => {
    render(<BookingSelector departures={[]} />);
    expect(screen.getByText(/nenhuma saída programada/i)).toBeTruthy();
  });

  it('avisa quando todas as saídas estão esgotadas', () => {
    render(<BookingSelector departures={[soldOut]} />);
    expect(screen.getByText(/todas as saídas programadas estão esgotadas/i)).toBeTruthy();
  });

  it('saída esgotada não é selecionável', () => {
    render(<BookingSelector departures={[soldOut]} />);
    // O botão da saída esgotada precisa estar desabilitado.
    const departureButtons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
    expect(isDisabled(departureButtons[0])).toBe(true);
    fireEvent.click(departureButtons[0]);
    // Sem seleção possível -> nenhum resumo de quantidade aparece.
    expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();
  });

  it('botão "Continuar reserva" começa desabilitado sem seleção', () => {
    render(<BookingSelector departures={[available]} />);
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(true);
  });

  it('selecionar uma saída disponível habilita o resumo e o botão continuar', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

    fireEvent.click(departureButton);

    expect(departureButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText(/quantidade de pessoas/i)).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  it('quantidade nunca fica abaixo de 1 (botão de diminuir desabilita em 1)', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const decrement = screen.getByRole('button', { name: /diminuir quantidade/i });
    expect(isDisabled(decrement)).toBe(true);

    fireEvent.click(decrement); // não deve fazer nada, já está desabilitado/no mínimo
    const input = screen.getByLabelText(/quantidade de pessoas/i) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('incrementa e decrementa a quantidade corretamente', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    const decrement = screen.getByRole('button', { name: /diminuir quantidade/i });
    const input = screen.getByLabelText(/quantidade de pessoas/i) as HTMLInputElement;

    fireEvent.click(increment);
    fireEvent.click(increment);
    expect(input.value).toBe('3');

    fireEvent.click(decrement);
    expect(input.value).toBe('2');
  });

  it('calcula o total estimado como preço × quantidade (per_person)', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    fireEvent.click(increment); // quantidade = 2

    expect(screen.getByText('R$ 300,00')).toBeTruthy();
  });

  it('"Continuar reserva" avança para o formulário do comprador, sem chamar /api/bookings', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));

    expect(screen.getByText(/dados do comprador/i)).toBeTruthy();
    expect(screen.getByLabelText(/nome completo/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('"Voltar" no formulário do comprador retorna para a seleção, preservando departure/quantidade', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i })); // quantidade = 2
    fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));

    fireEvent.click(screen.getByRole('button', { name: /^voltar$/i }));

    expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
    expect(departureButton.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText(/quantidade de pessoas/i) as HTMLInputElement).value).toBe('2');
  });

  describe('formulário do comprador -> revisão', () => {
    function fillValidForm() {
      fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Turista Teste' } });
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'turista@example.com' } });
      fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11912345678' } });
    }

    function goToCustomerForm() {
      render(<BookingSelector departures={[available]} />);
      const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
      fireEvent.click(departureButton);
      fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));
    }

    it('dados inválidos não avançam para a revisão e mostram erro específico', () => {
      goToCustomerForm();
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      expect(screen.getByText(/informe o nome completo/i)).toBeTruthy();
      expect(screen.getByText(/informe o e-mail/i)).toBeTruthy();
      expect(screen.getByText(/informe o telefone/i)).toBeTruthy();
      expect(screen.queryByText(/revisão da reserva/i)).toBeNull();
    });

    it('dados válidos (CPF opcional em branco) avançam para a revisão', () => {
      goToCustomerForm();
      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      expect(screen.getByText(/revisão da reserva/i)).toBeTruthy();
    });

    it('revisão mascara e-mail e telefone, e nunca chama fetch em nenhum momento do fluxo', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      goToCustomerForm();
      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      expect(screen.getByText('t***@example.com')).toBeTruthy();
      expect(screen.getByText('(11) *****-5678')).toBeTruthy();
      expect(screen.queryByText('turista@example.com')).toBeNull();
      expect(screen.queryByText('11912345678')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('"Editar dados" na revisão volta ao formulário com os dados preenchidos preservados', () => {
      goToCustomerForm();
      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      fireEvent.click(screen.getByRole('button', { name: /editar dados/i }));

      expect((screen.getByLabelText(/nome completo/i) as HTMLInputElement).value).toBe('Turista Teste');
      expect((screen.getByLabelText(/e-mail/i) as HTMLInputElement).value).toBe('turista@example.com');
    });

    it('PII não aparece na URL em nenhum momento do fluxo', () => {
      const initialHref = window.location.href;
      goToCustomerForm();
      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      expect(window.location.href).toBe(initialHref);
      expect(window.location.search).toBe('');
    });
  });

  it('per_group: total fixo, não muda com a quantidade', () => {
    render(<BookingSelector departures={[perGroup]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    expect(screen.getByText('R$ 200,00')).toBeTruthy();

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    fireEvent.click(increment);
    fireEvent.click(increment);

    // Total continua R$200,00 mesmo com quantidade = 3 — só um lugar na tela mostra esse valor
    // (o "Preço por grupo" e o "Total estimado" são iguais aqui), então checamos a quantidade
    // de ocorrências em vez de getByText único.
    expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
    expect(screen.queryByText(/R\$ 600,00/)).toBeNull(); // nunca multiplica
  });

  it('per_group: "Continuar reserva" fica habilitado (tipo vendável)', () => {
    render(<BookingSelector departures={[perGroup]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  it('starting_from (a_partir_de): card desabilitado, mensagem exibida, nunca chega em "Continuar"', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<BookingSelector departures={[startingFrom]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

    expect(isDisabled(departureButton)).toBe(true);
    fireEvent.click(departureButton);
    expect(departureButton.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();
    expect(screen.getByText(/reserva online para este tipo de passeio ainda não está disponível/i)).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('per_boat: card desabilitado e mesma mensagem de indisponibilidade (sem equivalente no NauticFlow)', () => {
    render(<BookingSelector departures={[perBoat]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

    expect(isDisabled(departureButton)).toBe(true);
    expect(screen.getByText(/reserva online para este tipo de passeio ainda não está disponível/i)).toBeTruthy();
  });

  it('mistura de saídas: só a vendável pode ser selecionada', () => {
    render(<BookingSelector departures={[available, startingFrom]} />);
    const buttons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);

    const sellableButton = buttons.find((btn) => !isDisabled(btn))!;
    const unsellableButton = buttons.find((btn) => isDisabled(btn))!;

    expect(sellableButton).toBeTruthy();
    expect(unsellableButton).toBeTruthy();

    fireEvent.click(sellableButton);
    expect(sellableButton.getAttribute('aria-pressed')).toBe('true');
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });
});
