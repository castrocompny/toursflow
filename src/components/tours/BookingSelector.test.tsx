// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const { BookingSelector } = await import('./BookingSelector');

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
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
  availableSpots: 10,
  soldOut: false,
};

const soldOut: Departure = {
  ...available,
  id: 'dep-2',
  departsAt: '2026-10-18T17:00:00+00:00',
  availableSpots: 0,
  soldOut: true,
};
const perGroup: Departure = { ...available, id: 'dep-3', priceType: 'per_group', price: 200 };
const startingFrom: Departure = { ...available, id: 'dep-4', priceType: 'starting_from', price: 100 };
const perBoat: Departure = { ...available, id: 'dep-5', priceType: 'per_boat', price: 1200 };
const oneSpotLeft: Departure = { ...available, id: 'dep-6', departsAt: '2026-10-25T17:00:00+00:00', availableSpots: 1 };

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
    expect(screen.getByRole('spinbutton', { name: /quantidade de pessoas/i })).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  it('quantidade nunca fica abaixo de 1 (botão de diminuir desabilita em 1)', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const decrement = screen.getByRole('button', { name: /diminuir quantidade/i });
    expect(isDisabled(decrement)).toBe(true);

    fireEvent.click(decrement); // não deve fazer nada, já está desabilitado/no mínimo
    const input = screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('incrementa e decrementa a quantidade corretamente', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    const decrement = screen.getByRole('button', { name: /diminuir quantidade/i });
    const input = screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement;

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
    expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('2');
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

      expect(screen.getByText('t******@example.com')).toBeTruthy();
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

    expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);

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

  it('mostra "N vagas disponíveis" no card de uma saída disponível', () => {
    render(<BookingSelector departures={[available]} />);
    expect(screen.getByText('10 vagas disponíveis')).toBeTruthy();
  });

  it('mostra "Última vaga disponível" quando resta só uma', () => {
    render(<BookingSelector departures={[oneSpotLeft]} />);
    expect(screen.getByText('Última vaga disponível')).toBeTruthy();
  });

  it('mostra a disponibilidade também perto do seletor de quantidade, após selecionar', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    expect(screen.getAllByText('10 vagas disponíveis').length).toBeGreaterThan(0);
  });

  it('botão "+" desabilita ao atingir availableSpots (não deixa passar do teto)', () => {
    render(<BookingSelector departures={[oneSpotLeft]} />);
    const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    const input = screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement;

    expect(input.value).toBe('1');
    expect(isDisabled(increment)).toBe(true);

    fireEvent.click(increment); // não deve fazer nada, já está no teto
    expect(input.value).toBe('1');
  });

  it('trocar para uma saída com menos vagas (data diferente) reajusta a quantidade pro novo teto', () => {
    // `available` (11/out) e `oneSpotLeft` (25/out) caem em datas diferentes
    // -> aparecem como dois chips na faixa de datas, não dois botões de
    // horário simultâneos.
    render(<BookingSelector departures={[available, oneSpotLeft]} />);

    const availableButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(availableButton);
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('3');

    // Troca de data (25/out) -> o horário anterior some, precisa escolher de novo.
    fireEvent.click(screen.getByRole('button', { name: /25$/ }));
    expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();

    const oneSpotButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(oneSpotButton);
    expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('1');
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  describe('agrupamento por data', () => {
    it('a data em destaque (11/out) não tem chip próprio — já vem expandida; 25/out aparece em "Próximas datas"', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);

      // 11/out é a data em destaque (mais próxima disponível): sem chip, já
      // mostrando o horário como botão selecionável diretamente.
      expect(screen.queryByRole('button', { name: /11$/ })).toBeNull();
      const timeButtons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(1);

      // 25/out é a única data "depois" da destacada -> aparece como chip em "Próximas datas".
      expect(screen.getByText('Próximas datas')).toBeTruthy();
      expect(screen.getByRole('button', { name: /25$/ })).toBeTruthy();
    });

    it('data com todos os horários esgotados aparece com o chip desabilitado e rótulo "Esgotado"', () => {
      render(<BookingSelector departures={[soldOut, available]} />);

      const soldOutDateButtons = screen.getAllByRole('button').filter((el) => /esgotado/i.test(el.textContent ?? ''));
      expect(soldOutDateButtons.length).toBeGreaterThan(0);
      expect(isDisabled(soldOutDateButtons[0])).toBe(true);
    });

    it('a primeira data com disponibilidade real vem selecionada, pulando uma data totalmente esgotada', () => {
      // soldOut (18/out) vem ANTES de available (11/out)? Não — precisamos de uma
      // saída esgotada em uma data anterior à disponível pra provar o "pular".
      const soldOutEarlier: Departure = { ...soldOut, departsAt: '2026-10-05T17:00:00+00:00' };
      render(<BookingSelector departures={[soldOutEarlier, available]} />);

      // O horário de `available` (a única data com vaga real) já aparece
      // selecionável sem precisar clicar em nenhum chip.
      const timeButtons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(1);
      expect(isDisabled(timeButtons[0])).toBe(false);
    });

    it('nunca pré-seleciona um horário automaticamente, mesmo a data já vindo selecionada', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);
      const timeButtons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons[0].getAttribute('aria-pressed')).toBe('false');
      expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();
    });

    it('resumo da data mostra "N horários disponíveis", contando só os vendáveis e não esgotados do dia', () => {
      const morningSameDay: Departure = { ...available, id: 'morning', departsAt: '2026-10-11T09:00:00+00:00' };
      const soldOutSameDay: Departure = { ...available, id: 'sold-out-same-day', departsAt: '2026-10-11T20:00:00+00:00', soldOut: true, availableSpots: 0 };
      render(<BookingSelector departures={[available, morningSameDay, soldOutSameDay]} />);

      // available + morningSameDay são vendáveis; soldOutSameDay não conta.
      expect(screen.getByText('2 horários disponíveis')).toBeTruthy();
    });

    it('resumo da data mostra singular "1 horário disponível" quando só um horário do dia é vendável', () => {
      render(<BookingSelector departures={[available]} />);
      expect(screen.getByText('1 horário disponível')).toBeTruthy();
    });

    it('vários horários no mesmo dia viram linhas separadas, sem repetir a data (só um cabeçalho)', () => {
      const morningSameDay: Departure = { ...available, id: 'morning', departsAt: '2026-10-11T09:00:00+00:00' };
      render(<BookingSelector departures={[available, morningSameDay]} />);

      // Só uma ocorrência do cabeçalho de data (11 de outubro é domingo).
      expect(screen.getAllByText('Domingo, 11 de outubro')).toHaveLength(1);
      // Mas dois horários selecionáveis.
      const timeButtons = screen.getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(2);
    });

    it('início + duração calcula o horário final exibido ("09:00 às 14:00" pra 300min)', () => {
      const morning: Departure = { ...available, departsAt: '2026-10-11T12:00:00+00:00' }; // 09:00 em Brasília
      render(<BookingSelector departures={[morning]} durationMinutes={300} />);
      expect(screen.getByText('09:00 às 14:00')).toBeTruthy();
    });

    it('sem durationMinutes, mostra só o horário de início — nunca inventa o horário final', () => {
      const morning: Departure = { ...available, departsAt: '2026-10-11T12:00:00+00:00' };
      render(<BookingSelector departures={[morning]} />);
      expect(screen.getByText('09:00')).toBeTruthy();
      expect(screen.queryByText(/09:00 às/)).toBeNull();
    });

    describe('muitas datas futuras (progressão "Ver mais datas")', () => {
      // Featured (11/out) + 9 datas extras em dias consecutivos (12 a 20/out) -> 9 "remainingGroups".
      const manyDates: Departure[] = Array.from({ length: 10 }, (_, index) => ({
        ...available,
        id: `many-${index}`,
        departsAt: `2026-10-${String(11 + index).padStart(2, '0')}T17:00:00+00:00`,
      }));

      function moreDatesGroup() {
        return screen.getByRole('group', { name: /mais datas/i });
      }

      it('inicialmente só até 3 datas extras aparecem em "Próximas datas", com "Ver mais datas" visível', () => {
        render(<BookingSelector departures={manyDates} />);
        expect(within(moreDatesGroup()).getAllByRole('button')).toHaveLength(3);
        expect(screen.getByRole('button', { name: /ver mais datas/i })).toBeTruthy();
      });

      it('"Ver mais datas" revela mais datas progressivamente (3 -> 7 -> resto) e some quando não há mais', () => {
        render(<BookingSelector departures={manyDates} />);
        const showMore = () => screen.getByRole('button', { name: /ver mais datas/i });
        const chipCount = () => within(moreDatesGroup()).getAllByRole('button').length;

        expect(chipCount()).toBe(3);
        fireEvent.click(showMore());
        expect(chipCount()).toBe(7);
        fireEvent.click(showMore());
        // 9 datas extras no total (10 saídas - 1 destacada) -> preenche tudo, sem passar de 14.
        expect(chipCount()).toBe(9);
        expect(screen.queryByRole('button', { name: /ver mais datas/i })).toBeNull();
      });

      it('as datas extras aparecem em ordem cronológica', () => {
        render(<BookingSelector departures={manyDates} />);
        fireEvent.click(screen.getByRole('button', { name: /ver mais datas/i }));
        fireEvent.click(screen.getByRole('button', { name: /ver mais datas/i }));
        const chipLabels = within(moreDatesGroup())
          .getAllByRole('button')
          .map((el) => el.textContent);
        // 12/out até 20/out, nessa ordem (nenhuma fora de ordem).
        expect(chipLabels).toEqual(['Seg 12', 'Ter 13', 'Qua 14', 'Qui 15', 'Sex 16', 'Sáb 17', 'Dom 18', 'Seg 19', 'Ter 20']);
      });
    });

    it('sem "Ver mais datas" quando há poucas datas extras (menos de 3)', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);
      expect(screen.queryByRole('button', { name: /ver mais datas/i })).toBeNull();
    });
  });

  describe('initialQuantityHint (ex.: "pessoas" vindo da busca)', () => {
    it('usa o hint como quantidade inicial quando a saída escolhida tem vagas suficientes', () => {
      render(<BookingSelector departures={[available]} initialQuantityHint={4} />);
      const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
      fireEvent.click(departureButton);
      expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('4');
    });

    it('reajusta o hint pra baixo quando a saída escolhida tem menos vagas do que o pedido', () => {
      render(<BookingSelector departures={[oneSpotLeft]} initialQuantityHint={4} />);
      const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
      fireEvent.click(departureButton);
      expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('1');
    });

    it('nunca cria reserva nem chama fetch só por causa do hint', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} initialQuantityHint={4} />);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
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

  describe('reserva/checkout desligado (BOOKING_CHECKOUT_ENABLED real, false)', () => {
    function goToReview() {
      render(<BookingSelector departures={[available]} />);
      const departureButton = screen.getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
      fireEvent.click(departureButton);
      fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));
      fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Turista Teste' } });
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'turista@example.com' } });
      fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11912345678' } });
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('revisão não mostra botão funcional "Confirmar reserva", mostra o aviso de falar com o operador', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();

      expect(screen.getByText(/revisão da reserva/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /confirmar reserva/i })).toBeNull();
      expect(screen.getByText(/reserva online chega em breve.*fale com o operador/i)).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('"Voltar"/"Editar dados" continuam funcionando na revisão mesmo com o checkout desligado', () => {
      goToReview();

      fireEvent.click(screen.getByRole('button', { name: /editar dados/i }));
      expect((screen.getByLabelText(/nome completo/i) as HTMLInputElement).value).toBe('Turista Teste');

      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));
      fireEvent.click(screen.getByRole('button', { name: /^voltar$/i }));
      expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
    });

    it('zero POST /api/bookings em todo o fluxo, mesmo indo até a revisão e voltando', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      fireEvent.click(screen.getByRole('button', { name: /editar dados/i }));
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('STEP 4 (BookingConfirmation)/hold countdown/payment-pix/voucher nunca são alcançados: revisão é o fim de linha', () => {
      goToReview();

      expect(screen.queryByTestId('hold-countdown')).toBeNull();
      expect(screen.queryByText(/sua vaga está garantida/i)).toBeNull();
      expect(screen.queryByText(/pague com pix/i)).toBeNull();
      expect(screen.queryByText(/pagamento recebido/i)).toBeNull();
    });
  });
});
