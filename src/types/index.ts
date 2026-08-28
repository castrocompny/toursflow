/**
 * Contratos de dados do ToursFlow.
 *
 * Estes tipos são a fronteira entre a camada de dados (hoje MOCK, amanhã
 * NauticFlow/Supabase) e a interface. Nenhum componente conhece a origem
 * dos dados: todos consomem apenas estes tipos.
 */

/**
 * Contrato real do NauticFlow (confirmado — ver docs/RESERVAS-SERVER-TO-SERVER.md):
 * - `per_person` (NauticFlow: `por_pessoa`) — vendável, total = price × quantity.
 * - `per_group` (NauticFlow: `por_grupo`) — vendável, total = price fixo, quantity não multiplica.
 * - `starting_from` (NauticFlow: `a_partir_de`) — só catálogo, NÃO vendável; o NauticFlow
 *   rejeita reserva desse tipo (`PRICE_TYPE_NOT_SELLABLE`).
 * - `per_boat` — existe no tipo do ToursFlow (mock/legado), mas **não tem
 *   equivalente confirmado no NauticFlow hoje**. Nunca produzido pelo
 *   mapeamento de dados reais; tratado como não vendável por segurança.
 */
export type PriceType = 'per_person' | 'per_group' | 'per_boat' | 'starting_from';

export type TourStatus = 'published' | 'draft' | 'paused';

export interface Operator {
  id: string;
  /** company_id do NauticFlow. */
  externalId?: string;
  name: string;
  /**
   * A API pública do NauticFlow ainda não expõe slug, estado, selo de
   * verificado, logo nem descrição por operador — só nome e cidade (que
   * também pode vir `null`). Todos opcionais aqui de propósito: nunca
   * inventar esses dados quando a API não manda.
   */
  slug?: string;
  city?: string;
  state?: string;
  /** Ano de início de operação, quando informado pelo operador. */
  operatingSince?: number;
  verified?: boolean;
  logoUrl?: string;
  description?: string;
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  state: string;
  /** Chamada curta usada em cards. */
  tagline: string;
  description: string;
  image: string;
  highlights: string[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
}

export interface BoardingPoint {
  name: string;
  address: string;
  district: string;
  city: string;
  state: string;
  /** CEP no formato 00000-000. Opcional: nem todo operador cadastra. */
  zipCode?: string;
  reference?: string;
  instructions?: string;
  /** Preenchidos pelo NauticFlow. Ausentes: o mapa cai para busca por endereço. */
  latitude?: number;
  longitude?: number;
  /** Antecedência recomendada, em minutos. */
  checkInMinutesBefore?: number;
}

export interface TourRating {
  average: number;
  count: number;
}

export interface ItineraryStop {
  time?: string;
  title: string;
  description?: string;
}

export interface TourImage {
  url: string;
  alt: string;
}

/**
 * Uma saída real do passeio (data + horário + preço + disponibilidade).
 * Vem sempre do NauticFlow — nunca calculada ou inventada pelo ToursFlow.
 * `departsAt` é o instante UTC como a API devolve; a conversão para
 * horário de Brasília acontece só na formatação (`lib/format.ts`), nunca
 * com offset fixo manual.
 */
export interface Departure {
  id: string;
  tourId: string;
  departsAt: string;
  price: number;
  priceType: PriceType;
  soldOut: boolean;
}

export interface Tour {
  id: string;
  slug: string;
  name: string;
  status: TourStatus;
  summary: string;
  description: string;
  destinationSlug: string;
  categorySlugs: string[];
  operatorId: string;
  images: TourImage[];
  /** Duração em minutos. A formatação é responsabilidade da UI. */
  durationMinutes: number;
  priceFrom: number;
  priceType: PriceType;
  maxPeople?: number;
  /** Ausente quando o passeio ainda não recebeu avaliações. Nunca inventar. */
  rating?: TourRating;
  boardingPoint: BoardingPoint;
  itinerary: ItineraryStop[];
  included: string[];
  notIncluded: string[];
  importantInfo: string[];
  cancellationPolicy: string;
}

/** Tour com entidades resolvidas: formato consumido pelas páginas. */
export interface TourWithRelations extends Tour {
  operator: Operator;
  destination: Destination;
  categories: Category[];
}

export interface TourFilters {
  destination?: string;
  category?: string;
  date?: string;
  people?: number;
  search?: string;
  page?: number;
  limit?: number;
}

/** Resultado paginado de `listTours` — a API real pagina no banco, nunca no cliente. */
export interface TourListResult {
  tours: TourWithRelations[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
