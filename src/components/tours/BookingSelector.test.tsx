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
    const departureButtons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

    fireEvent.click(departureButton);

    expect(departureButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('spinbutton', { name: /quantidade de pessoas/i })).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  it('quantidade nunca fica abaixo de 1 (botão de diminuir desabilita em 1)', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const decrement = screen.getByRole('button', { name: /diminuir quantidade/i });
    expect(isDisabled(decrement)).toBe(true);

    fireEvent.click(decrement); // não deve fazer nada, já está desabilitado/no mínimo
    const input = screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('incrementa e decrementa a quantidade corretamente', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);

    const increment = screen.getByRole('button', { name: /aumentar quantidade/i });
    fireEvent.click(increment); // quantidade = 2

    expect(screen.getByText('R$ 300,00')).toBeTruthy();
  });

  it('"Continuar reserva" avança para o formulário do comprador, sem chamar /api/bookings', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<BookingSelector departures={[available]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));

    expect(screen.getByText(/dados do comprador/i)).toBeTruthy();
    expect(screen.getByLabelText(/nome completo/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('"Voltar" no formulário do comprador retorna para a seleção, preservando departure/quantidade', () => {
    render(<BookingSelector departures={[available]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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
      const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  it('starting_from (a_partir_de): card desabilitado, mensagem exibida, nunca chega em "Continuar"', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<BookingSelector departures={[startingFrom]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;

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
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(departureButton);
    expect(screen.getAllByText('10 vagas disponíveis').length).toBeGreaterThan(0);
  });

  it('botão "+" desabilita ao atingir availableSpots (não deixa passar do teto)', () => {
    render(<BookingSelector departures={[oneSpotLeft]} />);
    const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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

    const availableButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(availableButton);
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('3');

    // Troca de data (25/out) -> o horário anterior some, precisa escolher de novo.
    fireEvent.click(screen.getByRole('button', { name: /25$/ }));
    expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();

    const oneSpotButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
    fireEvent.click(oneSpotButton);
    expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('1');
    expect(isDisabled(screen.getByRole('button', { name: /continuar reserva/i }))).toBe(false);
  });

  describe('agrupamento por data', () => {
    function dateChipsGroup() {
      return screen.getByRole('group', { name: /datas disponíveis/i });
    }

    it('a data selecionada aparece como chip destacado em "Escolha a data", com o horário dela expandido abaixo', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);

      // 11/out (mais próxima disponível) é o chip selecionado.
      const selectedChip = screen.getByRole('button', { name: /11$/ });
      expect(selectedChip.getAttribute('aria-pressed')).toBe('true');

      // 25/out também aparece como chip (mesma faixa "Escolha a data"), só não selecionado.
      const otherChip = screen.getByRole('button', { name: /25$/ });
      expect(otherChip.getAttribute('aria-pressed')).toBe('false');

      // O painel abaixo mostra só o horário de 11/out.
      const timeButtons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(1);
    });

    it('data com todos os horários esgotados aparece com o chip desabilitado e rótulo "Esgotado"', () => {
      render(<BookingSelector departures={[soldOut, available]} />);

      const soldOutDateButtons = within(dateChipsGroup())
        .getAllByRole('button')
        .filter((el) => /esgotado/i.test(el.textContent ?? ''));
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
      const timeButtons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(1);
      expect(isDisabled(timeButtons[0])).toBe(false);
    });

    it('nunca pré-seleciona um horário automaticamente, mesmo a data já vindo selecionada', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);
      const timeButtons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons[0].getAttribute('aria-pressed')).toBe('false');
      expect(screen.queryByLabelText(/quantidade de pessoas/i)).toBeNull();
    });

    it('vários horários no mesmo dia viram linhas separadas, sem repetir a data (só um cabeçalho)', () => {
      const morningSameDay: Departure = { ...available, id: 'morning', departsAt: '2026-10-11T09:00:00+00:00' };
      render(<BookingSelector departures={[available, morningSameDay]} />);

      // Só uma ocorrência do cabeçalho de data (11 de outubro é domingo).
      expect(screen.getAllByText('Domingo, 11 de outubro')).toHaveLength(1);
      // Mas dois horários selecionáveis.
      const timeButtons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);
      expect(timeButtons).toHaveLength(2);
    });

    it('trocar de chip de data troca o painel de horários abaixo', () => {
      render(<BookingSelector departures={[available, oneSpotLeft]} />);
      expect(screen.getByText('Domingo, 11 de outubro')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /25$/ }));

      expect(screen.queryByText('Domingo, 11 de outubro')).toBeNull();
      expect(screen.getByText('Domingo, 25 de outubro')).toBeTruthy();
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

    describe('janela de navegação entre datas (‹ ›)', () => {
      // 10 datas em dias consecutivos (11 a 20/out) -> mais que DATE_WINDOW_SIZE (7).
      const manyDates: Departure[] = Array.from({ length: 10 }, (_, index) => ({
        ...available,
        id: `many-${index}`,
        departsAt: `2026-10-${String(11 + index).padStart(2, '0')}T17:00:00+00:00`,
      }));

      function previousButton() {
        return screen.getByRole('button', { name: /datas anteriores/i });
      }
      function nextButton() {
        return screen.getByRole('button', { name: /mais datas/i });
      }

      it('nunca monta mais que 7 chips de data de uma vez, mesmo com dezenas de saídas futuras', () => {
        render(<BookingSelector departures={manyDates} />);
        expect(within(dateChipsGroup()).getAllByRole('button')).toHaveLength(7);
      });

      it('"‹" começa desabilitado (já na primeira data) e "›" habilitado (há mais datas à frente)', () => {
        render(<BookingSelector departures={manyDates} />);
        expect(isDisabled(previousButton())).toBe(true);
        expect(isDisabled(nextButton())).toBe(false);
      });

      it('"›" desliza a janela mantendo a ordem cronológica, sem mudar a data selecionada', () => {
        render(<BookingSelector departures={manyDates} />);
        expect(screen.getByText('Domingo, 11 de outubro')).toBeTruthy();

        fireEvent.click(nextButton());

        // A data selecionada continua a mesma (11/out) — só a janela de chips deslizou.
        expect(screen.getByText('Domingo, 11 de outubro')).toBeTruthy();
        const chipLabels = within(dateChipsGroup())
          .getAllByRole('button')
          .map((el) => el.textContent?.replace('Esgotado', ''));
        expect(chipLabels).toEqual(['Seg 12', 'Ter 13', 'Qua 14', 'Qui 15', 'Sex 16', 'Sáb 17', 'Dom 18']);
      });

      it('"‹" desliza a janela de volta; "›" desabilita ao chegar no fim', () => {
        render(<BookingSelector departures={manyDates} />);
        // 10 datas, janela de 7 -> no máximo 3 passos de "›" (windowStart 0 -> 3).
        fireEvent.click(nextButton());
        fireEvent.click(nextButton());
        fireEvent.click(nextButton());
        expect(isDisabled(nextButton())).toBe(true);

        const chipLabelsAtEnd = within(dateChipsGroup())
          .getAllByRole('button')
          .map((el) => el.textContent?.replace('Esgotado', ''));
        expect(chipLabelsAtEnd).toEqual(['Qua 14', 'Qui 15', 'Sex 16', 'Sáb 17', 'Dom 18', 'Seg 19', 'Ter 20']);

        fireEvent.click(previousButton());
        expect(isDisabled(nextButton())).toBe(false);
      });

      it('quando cabem todas as datas na janela, "‹" e "›" ficam desabilitados dos dois lados', () => {
        render(<BookingSelector departures={[available, oneSpotLeft]} />);
        expect(isDisabled(previousButton())).toBe(true);
        expect(isDisabled(nextButton())).toBe(true);
      });
    });
  });

  describe('initialQuantityHint (ex.: "pessoas" vindo da busca)', () => {
    it('usa o hint como quantidade inicial quando a saída escolhida tem vagas suficientes', () => {
      render(<BookingSelector departures={[available]} initialQuantityHint={4} />);
      const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
      fireEvent.click(departureButton);
      expect((screen.getByRole('spinbutton', { name: /quantidade de pessoas/i }) as HTMLInputElement).value).toBe('4');
    });

    it('reajusta o hint pra baixo quando a saída escolhida tem menos vagas do que o pedido', () => {
      render(<BookingSelector departures={[oneSpotLeft]} initialQuantityHint={4} />);
      const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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
    const buttons = within(screen.getByRole('list')).getAllByRole('button').filter((el) => el.getAttribute('aria-pressed') !== null);

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
      const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
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

    it('revisão não mostra botão funcional "Confirmar reserva", mostra o aviso de reserva online em breve — sem instruir a contatar o operador', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();

      expect(screen.getByText(/revisão da reserva/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /confirmar reserva/i })).toBeNull();
      expect(screen.getByText(/reserva online chega em breve/i)).toBeTruthy();
      expect(screen.queryByText(/fale com o operador/i)).toBeNull();
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
