/**
 * Contratos de dados do ToursFlow.
 *
 * Estes tipos são a fronteira entre a camada de dados (hoje MOCK, amanhã
 * NauticFlow/Supabase) e a interface. Nenhum componente conhece a origem
 * dos dados: todos consomem apenas estes tipos.
 */

export type PriceType = 'per_person' | 'per_group' | 'per_boat';

export type TourStatus = 'published' | 'draft' | 'paused';

export interface Operator {
  id: string;
  /** company_id do NauticFlow quando a integração estiver ativa. */
  externalId?: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  /** Ano de início de operação, quando informado pelo operador. */
  operatingSince?: number;
  verified: boolean;
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
}
