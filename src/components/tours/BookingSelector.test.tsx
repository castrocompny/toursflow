// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  describe('confirmação de reserva — POST /api/bookings (Fase 3)', () => {
    const successData = {
      bookingId: 'bk-real-1',
      status: 'pendente',
      // Sempre 15 min à frente do momento em que o teste roda — nunca uma
      // data fixa, que acabaria no passado conforme o tempo passa (bug já
      // visto: um valor hardcoded expirou sozinho quando o relógio real
      // avançou além dele).
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      tour: { slug: 't', name: 'T' },
      departure: { id: available.id, departsAt: available.departsAt },
      quantity: 1,
      priceType: 'per_person',
      priceCents: 15000,
      totalCents: 15000,
      currency: 'BRL',
    };

    function mockFetchResponse(response: {
      ok: boolean;
      status: number;
      body: unknown;
      headers?: Record<string, string>;
    }) {
      return vi.fn().mockResolvedValue({
        ok: response.ok,
        status: response.status,
        json: async () => response.body,
        headers: { get: (key: string) => response.headers?.[key.toLowerCase()] ?? null },
      });
    }

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

    async function confirmAndWaitFor(matcher: RegExp) {
      fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));
      await waitFor(() => expect(screen.getByText(matcher)).toBeTruthy());
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('submit válido chama /api/bookings exatamente 1 vez, com payload whitelisted e Idempotency-Key', async () => {
      const fetchSpy = mockFetchResponse({ ok: true, status: 201, body: { data: successData } });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/sua vaga está garantida/i);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/bookings');
      const sentBody = JSON.parse(init.body);
      expect(Object.keys(sentBody)).toEqual(['departureId', 'quantity', 'customer']);
      expect(Object.keys(sentBody.customer)).toEqual(['name', 'email', 'phone']); // sem cpf, ausente no form
      expect(sentBody.customer.phone).toBe('11912345678'); // normalizado, não a máscara
      expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('201 -> avança para STEP 4 com o preço REAL do backend, não o total estimado', async () => {
      const fetchSpy = mockFetchResponse({
        ok: true,
        status: 201,
        body: { data: { ...successData, totalCents: 22250 } }, // divergente do estimado (R$150,00) de propósito
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/sua vaga está garantida/i);

      expect(screen.getByText('R$ 222,50')).toBeTruthy(); // valor do backend
      expect(screen.queryByText('R$ 150,00')).toBeNull(); // nunca o estimado, mesmo divergindo
      expect(screen.getByText('bk-real-1')).toBeTruthy();
    });

    it('200 + Idempotency-Replayed -> tratado como sucesso da mesma reserva, sem erro, sem duplicar', async () => {
      const fetchSpy = mockFetchResponse({
        ok: true,
        status: 200,
        headers: { 'idempotency-replayed': 'true' },
        body: { data: successData },
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/sua vaga está garantida/i);

      expect(screen.queryByRole('alert')).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('double-click no botão confirmar não duplica a chamada', async () => {
      const fetchSpy = mockFetchResponse({ ok: true, status: 201, body: { data: successData } });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      const confirmButton = screen.getByRole('button', { name: /confirmar reserva/i });
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      await waitFor(() => expect(screen.getByText(/sua vaga está garantida/i)).toBeTruthy());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('409 IDEMPOTENCY_CONFLICT: mostra erro e permanece na revisão, sem criar reserva', async () => {
      const fetchSpy = mockFetchResponse({
        ok: false,
        status: 409,
        body: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'raw' } },
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/tentativa anterior com dados diferentes/i);

      expect(screen.getByRole('button', { name: /confirmar reserva/i })).toBeTruthy();
      expect(screen.queryByText(/sua vaga está garantida/i)).toBeNull();
    });

    it('409 INSUFFICIENT_CAPACITY: mensagem específica + atualiza departures (router.refresh)', async () => {
      const fetchSpy = mockFetchResponse({
        ok: false,
        status: 409,
        body: { error: { code: 'INSUFFICIENT_CAPACITY', message: 'raw' } },
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/essa saída não possui mais disponibilidade para a quantidade selecionada/i);

      expect(routerRefresh).toHaveBeenCalled();
    });

    it('422 PRICE_TYPE_NOT_SELLABLE: mensagem tratada, sem vazamento técnico', async () => {
      const fetchSpy = mockFetchResponse({
        ok: false,
        status: 422,
        body: { error: { code: 'PRICE_TYPE_NOT_SELLABLE', message: 'raw' } },
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/não está disponível para reserva online/i);
    });

    it('429 RATE_LIMITED: mensagem de aguardar, sem retry automático', async () => {
      const fetchSpy = mockFetchResponse({ ok: false, status: 429, body: { error: { code: 'RATE_LIMITED' } } });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/aguarde alguns instantes e tente novamente/i);

      expect(fetchSpy).toHaveBeenCalledTimes(1); // nenhum retry automático
    });

    it('503 BOOKING_SERVICE_UNAVAILABLE: erro exibido, dados do formulário preservados para retry', async () => {
      const fetchSpy = mockFetchResponse({
        ok: false,
        status: 503,
        body: { error: { code: 'BOOKING_SERVICE_UNAVAILABLE' } },
      });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/serviço de reservas está indisponível/i);

      fireEvent.click(screen.getByRole('button', { name: /editar dados/i }));
      expect((screen.getByLabelText(/nome completo/i) as HTMLInputElement).value).toBe('Turista Teste');
    });

    it('falha de rede (fetch rejeita): mensagem segura, não assume reserva perdida', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      goToReview();
      await confirmAndWaitFor(/não foi possível confirmar se a reserva foi criada/i);
    });

    it('retry após erro transitório usa a MESMA Idempotency-Key (não gera nova a cada tentativa)', async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'BOOKING_SERVICE_UNAVAILABLE' } }),
          headers: { get: () => null },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ data: successData }),
          headers: { get: () => null },
        });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/serviço de reservas está indisponível/i);

      const firstKey = fetchSpy.mock.calls[0][1].headers['Idempotency-Key'];

      await confirmAndWaitFor(/sua vaga está garantida/i);
      const secondKey = fetchSpy.mock.calls[1][1].headers['Idempotency-Key'];

      expect(secondKey).toBe(firstKey);
    });

    it('mudar um dado do comprador antes de reenviar gera uma Idempotency-Key NOVA', async () => {
      const fetchSpy = mockFetchResponse({ ok: true, status: 201, body: { data: successData } });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      const firstReviewCall = () => {
        fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));
      };

      // Não confirma ainda: volta, muda o e-mail, gera novo fingerprint -> nova key na próxima revisão.
      fireEvent.click(screen.getByRole('button', { name: /editar dados/i }));
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'outro@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));

      firstReviewCall();
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

      expect(fetchSpy.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();
      // O payload precisa refletir o e-mail alterado, não o original.
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).customer.email).toBe('outro@example.com');
    });

    it('nenhuma PII em URL/localStorage/sessionStorage depois de um erro ou de um sucesso', async () => {
      const fetchSpy = mockFetchResponse({ ok: true, status: 201, body: { data: successData } });
      vi.stubGlobal('fetch', fetchSpy);
      const initialHref = window.location.href;

      goToReview();
      await confirmAndWaitFor(/sua vaga está garantida/i);

      expect(window.location.href).toBe(initialHref);
      expect(window.location.search).toBe('');
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
    });

    it('PAYMENTS_UI_ENABLED desligada: STEP 4 não oferece "Pagar com Pix", só o aviso de que pagamento vem depois', async () => {
      const fetchSpy = mockFetchResponse({ ok: true, status: 201, body: { data: successData } });
      vi.stubGlobal('fetch', fetchSpy);

      goToReview();
      await confirmAndWaitFor(/sua vaga está garantida/i);

      expect(screen.queryByRole('button', { name: /pagar com pix/i })).toBeNull();
      expect(screen.getByText(/pagamento será disponibilizado na próxima etapa/i)).toBeTruthy();
    });
  });
});
