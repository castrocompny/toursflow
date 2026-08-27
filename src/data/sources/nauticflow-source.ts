/**
 * Fonte de dados real: consome a API pública do NauticFlow
 * (`/api/public/*`, sem autenticação, ver docs/PLANO-INTEGRACAO-NAUTICFLOW.md).
 *
 * Regras que este arquivo segue à risca:
 * - nunca inventa campo que a API não manda (usa fallback vazio/undefined,
 *   nunca um valor de exemplo);
 * - nunca busca tudo e filtra em JS — todo filtro vai como query param;
 * - nunca trata falha de rede/timeout/JSON inválido como "não encontrado"
 *   (isso é `DataSourceError`, distinto de `null`/lista vazia legítima);
 * - conteúdo usa cache moderado (ISR); disponibilidade (saídas) nunca
 *   cacheia, porque preço e vaga têm que estar sempre corretos.
 *
 * Partes do contrato que não puderam ser validadas contra uma resposta
 * real (porque não havia passeio publicado no momento da integração):
 * o shape exato de `boarding`, `itinerary` e `company` no endpoint de
 * detalhe. O mapeamento abaixo segue o padrão camelCase confirmado no
 * resto do contrato e é defensivo (nunca quebra se um campo vier
 * ausente/diferente) — mas precisa ser reconfirmado contra um passeio
 * publicado real antes de confiar cegamente em produção.
 */
import type {
  BoardingPoint,
  Category,
  Departure,
  Destination,
  ItineraryStop,
  Operator,
  PriceType,
  TourFilters,
  TourImage,
  TourListResult,
  TourWithRelations,
} from '@/types';
import { DataSourceError, type ToursDataSource } from '@/data/source';
import { centsToReais } from '@/lib/format';
import { categoriesVitrine, genericCategoryVitrine } from '@/data/vitrine/categories';
import { destinationsVitrine, genericDestinationVitrine } from '@/data/vitrine/destinations';

/** Conteúdo (passeios, destinos, categorias) — muda pouco, cache moderado. */
const CONTENT_REVALIDATE_SECONDS = 300;

class NotFoundError extends Error {}

// ---------------------------------------------------------------------------
// Cliente HTTP
// ---------------------------------------------------------------------------

interface FetchOptions {
  /** `false` = nunca cacheia (disponibilidade). Número = ISR nesse intervalo. */
  revalidate: number | false;
  timeoutMs?: number;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined> | undefined,
  options: FetchOptions,
): Promise<T> {
  const baseUrl = process.env.NAUTICFLOW_API_URL;
  if (!baseUrl) {
    throw new DataSourceError('NAUTICFLOW_API_URL não configurada — não é possível consultar o NauticFlow.');
  }

  const url = new URL(path, baseUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      ...(options.revalidate === false
        ? { cache: 'no-store' as const }
        : { next: { revalidate: options.revalidate } }),
    });
  } catch (error) {
    throw new DataSourceError(`Falha de rede ao chamar a API do NauticFlow (${path})`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new NotFoundError(path);
  }
  if (!response.ok) {
    throw new DataSourceError(`API do NauticFlow respondeu ${response.status} em ${path}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new DataSourceError(`Resposta inesperada (não-JSON, content-type "${contentType}") em ${path}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new DataSourceError(`JSON inválido na resposta de ${path}`, { cause: error });
  }
}

// ---------------------------------------------------------------------------
// DTOs — só o que o contrato confirma. Nada além disso é assumido.
// ---------------------------------------------------------------------------

type SlugRef = string | { slug?: string; value?: string; name?: string; label?: string } | null | undefined;

interface NauticFlowCompanyDTO {
  name: string;
  city: string | null;
}

interface NauticFlowTourListItemDTO {
  slug: string;
  name: string;
  shortDescription: string;
  destination: SlugRef;
  category: SlugRef;
  durationMinutes: number;
  priceType: string;
  basePriceCents: number;
  coverPhotoUrl: string | null;
  company: NauticFlowCompanyDTO;
}

interface NauticFlowBoardingDTO {
  name?: string;
  address?: string;
  /** A API chama de `neighborhood`, não `district` — confirmado contra payload real. */
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  reference?: string;
  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface NauticFlowTourDetailDTO extends NauticFlowTourListItemDTO {
  description: string;
  /**
   * Confirmado contra payload real: `itinerary`, `included`, `notIncluded`
   * e `importantInformation` são texto livre (uma string), não listas
   * estruturadas — diferente do que o contrato documentado sugeria.
   */
  itinerary: string | null;
  cancellationPolicy: string | null;
  importantInformation: string | null;
  included: string | null;
  notIncluded: string | null;
  photos: string[] | null;
  boarding: NauticFlowBoardingDTO | null;
}

interface NauticFlowDepartureDTO {
  id: string;
  departsAt: string;
  priceCents: number;
  priceType: string;
  soldOut: boolean;
}

interface NauticFlowDestinationDTO {
  slug: string;
  name: string;
}

interface NauticFlowCategoryDTO {
  value: string;
  label: string;
}

interface ListEnvelope<T> {
  data: T[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

// ---------------------------------------------------------------------------
// Mapeamento DTO -> tipos internos do ToursFlow
// ---------------------------------------------------------------------------

function mapPriceType(raw: string): PriceType {
  switch (raw) {
    case 'por_pessoa':
    case 'per_person':
      return 'per_person';
    case 'por_grupo':
    case 'per_group':
      return 'per_group';
    case 'por_embarcacao':
    case 'per_boat':
      return 'per_boat';
    default:
      // Só o valor "por_pessoa" foi confirmado em produção até agora.
      // Um valor novo/desconhecido não pode quebrar a página — cai para
      // o tipo mais comum e fica registrado no log do servidor.
      console.warn(`[nauticflow-source] priceType desconhecido: "${raw}" — usando "per_person".`);
      return 'per_person';
  }
}

/** "Búzios" -> "buzios". Normalização mecânica, nunca inventa dado — só formata. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Confirmado contra payload real: em `tour.destination` a API manda o
 * **nome de exibição** ("Búzios"), não um slug — precisa ser normalizado
 * para casar com `destinationsIndex` e com a URL `/passeios/[destino]/...`.
 */
function extractDestinationRef(ref: SlugRef): { slug: string; name: string } {
  if (typeof ref === 'string') return { slug: slugify(ref), name: ref };
  if (ref && typeof ref === 'object') {
    const name = ref.name ?? ref.label ?? ref.value ?? ref.slug ?? '';
    const slug = ref.slug ?? (name ? slugify(name) : '');
    return { slug, name };
  }
  return { slug: '', name: '' };
}

/** Em `tour.category` a API já manda o `value` (slug), igual ao endpoint /categories. */
function extractCategoryRef(ref: SlugRef): { slug: string; name: string } {
  if (typeof ref === 'string') return { slug: ref, name: ref };
  if (ref && typeof ref === 'object') {
    const slug = ref.slug ?? ref.value ?? '';
    const name = ref.name ?? ref.label ?? slug;
    return { slug, name };
  }
  return { slug: '', name: '' };
}

function mapDestinationDTO(dto: NauticFlowDestinationDTO): Destination {
  const vitrine = destinationsVitrine[dto.slug] ?? genericDestinationVitrine(dto.name);
  return { id: dto.slug, slug: dto.slug, name: dto.name, ...vitrine };
}

function mapCategoryDTO(dto: NauticFlowCategoryDTO): Category {
  const vitrine = categoriesVitrine[dto.value] ?? genericCategoryVitrine;
  return { id: dto.value, slug: dto.value, name: dto.label, ...vitrine };
}

function mapOperator(company: NauticFlowCompanyDTO | null | undefined): Operator {
  // A API pública ainda não expõe id/slug/estado/selo/logo/descrição por
  // operador — só nome e cidade. Ver seção "Alterações necessárias no
  // NauticFlow" no relatório desta integração.
  const name = company?.name?.trim() || 'Operador';
  return {
    id: name,
    name,
    city: company?.city ?? undefined,
  };
}

function mapBoardingPoint(dto: NauticFlowBoardingDTO | null | undefined): BoardingPoint {
  return {
    name: dto?.name ?? '',
    address: dto?.address ?? '',
    district: dto?.neighborhood ?? '',
    city: dto?.city ?? '',
    state: dto?.state ?? '',
    zipCode: dto?.zipCode || undefined,
    reference: dto?.reference || undefined,
    instructions: dto?.instructions || undefined,
    latitude: typeof dto?.latitude === 'number' ? dto.latitude : undefined,
    longitude: typeof dto?.longitude === 'number' ? dto.longitude : undefined,
  };
}

/** `itinerary` é texto livre na API — vira um único bloco, sem inventar paradas separadas. */
function mapItinerary(text: string | null | undefined): ItineraryStop[] {
  const trimmed = text?.trim();
  return trimmed ? [{ title: 'Roteiro', description: trimmed }] : [];
}

/** `included`/`notIncluded`/`importantInformation` também são texto livre, não listas. */
function mapTextBlock(text: string | null | undefined): string[] {
  const trimmed = text?.trim();
  return trimmed ? [trimmed] : [];
}

/** Garante que a capa apareça primeiro na galeria, sem duplicar a URL. */
function orderImages(photos: string[] | null | undefined, cover: string | null, alt: string): TourImage[] {
  const list = Array.isArray(photos) ? [...photos] : [];
  if (cover) {
    const withoutCover = list.filter((url) => url !== cover);
    return [cover, ...withoutCover].map((url) => ({ url, alt }));
  }
  return list.map((url) => ({ url, alt }));
}

function baseTourFields(
  dto: NauticFlowTourListItemDTO,
  destinationsIndex: Map<string, Destination>,
  categoriesIndex: Map<string, Category>,
) {
  const destRef = extractDestinationRef(dto.destination);
  const destination = destinationsIndex.get(destRef.slug) ?? mapDestinationDTO({ slug: destRef.slug, name: destRef.name });

  const catRef = extractCategoryRef(dto.category);
  const category = catRef.slug
    ? (categoriesIndex.get(catRef.slug) ?? mapCategoryDTO({ value: catRef.slug, label: catRef.name }))
    : null;

  const operator = mapOperator(dto.company);
  const priceType = mapPriceType(dto.priceType);

  return { destination, category, operator, priceType };
}

const EMPTY_BOARDING_POINT: BoardingPoint = { name: '', address: '', district: '', city: '', state: '' };

/** Item de listagem: a API não manda roteiro/embarque/políticas aqui — TourCard nunca lê esses campos. */
function mapTourListItem(
  dto: NauticFlowTourListItemDTO,
  destinationsIndex: Map<string, Destination>,
  categoriesIndex: Map<string, Category>,
): TourWithRelations {
  const { destination, category, operator, priceType } = baseTourFields(dto, destinationsIndex, categoriesIndex);

  return {
    id: dto.slug,
    slug: dto.slug,
    name: dto.name,
    status: 'published',
    summary: dto.shortDescription,
    description: dto.shortDescription,
    destinationSlug: destination.slug,
    categorySlugs: category ? [category.slug] : [],
    operatorId: operator.id,
    images: dto.coverPhotoUrl ? [{ url: dto.coverPhotoUrl, alt: dto.name }] : [],
    durationMinutes: dto.durationMinutes,
    priceFrom: centsToReais(dto.basePriceCents),
    priceType,
    boardingPoint: EMPTY_BOARDING_POINT,
    itinerary: [],
    included: [],
    notIncluded: [],
    importantInfo: [],
    cancellationPolicy: '',
    operator,
    destination,
    categories: category ? [category] : [],
  };
}

function mapTourDetail(
  dto: NauticFlowTourDetailDTO,
  destinationsIndex: Map<string, Destination>,
  categoriesIndex: Map<string, Category>,
): TourWithRelations {
  const { destination, category, operator, priceType } = baseTourFields(dto, destinationsIndex, categoriesIndex);

  return {
    id: dto.slug,
    slug: dto.slug,
    name: dto.name,
    status: 'published',
    summary: dto.shortDescription,
    description: dto.description || dto.shortDescription,
    destinationSlug: destination.slug,
    categorySlugs: category ? [category.slug] : [],
    operatorId: operator.id,
    images: orderImages(dto.photos, dto.coverPhotoUrl, dto.name),
    durationMinutes: dto.durationMinutes,
    priceFrom: centsToReais(dto.basePriceCents),
    priceType,
    boardingPoint: mapBoardingPoint(dto.boarding),
    itinerary: mapItinerary(dto.itinerary),
    included: mapTextBlock(dto.included),
    notIncluded: mapTextBlock(dto.notIncluded),
    importantInfo: mapTextBlock(dto.importantInformation),
    cancellationPolicy: dto.cancellationPolicy ?? '',
    operator,
    destination,
    categories: category ? [category] : [],
  };
}

function mapDeparture(dto: NauticFlowDepartureDTO, tourId: string): Departure {
  return {
    id: dto.id,
    tourId,
    departsAt: dto.departsAt,
    price: centsToReais(dto.priceCents),
    priceType: mapPriceType(dto.priceType),
    soldOut: Boolean(dto.soldOut),
  };
}

// ---------------------------------------------------------------------------
// Implementação do contrato
// ---------------------------------------------------------------------------

async function listDestinations(): Promise<Destination[]> {
  const response = await fetchJson<ListEnvelope<NauticFlowDestinationDTO>>(
    '/api/public/destinations',
    undefined,
    { revalidate: CONTENT_REVALIDATE_SECONDS },
  );
  return response.data.map(mapDestinationDTO);
}

async function getDestination(slug: string): Promise<Destination | null> {
  const destinations = await listDestinations();
  return destinations.find((destination) => destination.slug === slug) ?? null;
}

async function listCategories(): Promise<Category[]> {
  const response = await fetchJson<ListEnvelope<NauticFlowCategoryDTO>>(
    '/api/public/categories',
    undefined,
    { revalidate: CONTENT_REVALIDATE_SECONDS },
  );
  return response.data.map(mapCategoryDTO);
}

async function buildIndexes(): Promise<{
  destinationsIndex: Map<string, Destination>;
  categoriesIndex: Map<string, Category>;
}> {
  const [destinations, categories] = await Promise.all([listDestinations(), listCategories()]);
  return {
    destinationsIndex: new Map(destinations.map((destination) => [destination.slug, destination])),
    categoriesIndex: new Map(categories.map((category) => [category.slug, category])),
  };
}

async function listTours(filters: TourFilters = {}): Promise<TourListResult> {
  const { destinationsIndex, categoriesIndex } = await buildIndexes();

  // A API não suporta busca textual (`search`) nem filtro por `pessoas`
  // hoje — só destination/category/page/limit. Esses dois continuam
  // aceitos na URL (mesmo tratamento honesto já usado para `date`: não
  // filtram, mas também não escondem resultado nenhum), nunca buscamos
  // tudo para filtrar isso em JS.
  const response = await fetchJson<ListEnvelope<NauticFlowTourListItemDTO>>(
    '/api/public/tours',
    {
      destination: filters.destination,
      category: filters.category,
      page: filters.page,
      limit: filters.limit,
    },
    { revalidate: CONTENT_REVALIDATE_SECONDS },
  );

  return {
    tours: response.data.map((item) => mapTourListItem(item, destinationsIndex, categoriesIndex)),
    page: response.page ?? 1,
    limit: response.limit ?? response.data.length,
    total: response.total ?? response.data.length,
    totalPages: response.totalPages ?? 1,
  };
}

async function getTour(destinationSlug: string, tourSlug: string): Promise<TourWithRelations | null> {
  const { destinationsIndex, categoriesIndex } = await buildIndexes();

  let dto: NauticFlowTourDetailDTO;
  try {
    // Confirmado contra payload real: o detalhe também vem envelopado em
    // `{ data: {...} }`, igual às listagens — não é o objeto direto.
    const response = await fetchJson<{ data: NauticFlowTourDetailDTO }>(
      `/api/public/tours/${encodeURIComponent(tourSlug)}`,
      undefined,
      { revalidate: CONTENT_REVALIDATE_SECONDS },
    );
    dto = response.data;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }

  const tour = mapTourDetail(dto, destinationsIndex, categoriesIndex);
  // Reforça a URL canônica /passeios/[destino]/[slug]: um slug de destino
  // que não bate com o real também é "não encontrado", não um redirect silencioso.
  return tour.destinationSlug === destinationSlug ? tour : null;
}

async function listDepartures(tourSlug: string): Promise<Departure[]> {
  // Disponibilidade nunca cacheia (revalidate: false = no-store): preço e
  // vaga têm que refletir o estado real no momento em que a página carrega.
  const response = await fetchJson<ListEnvelope<NauticFlowDepartureDTO>>(
    `/api/public/tours/${encodeURIComponent(tourSlug)}/departures`,
    undefined,
    { revalidate: false },
  );
  return response.data.map((item) => mapDeparture(item, tourSlug));
}

async function listFeaturedTours(limit = 6): Promise<TourWithRelations[]> {
  // A API não tem conceito de "destaque" — a home usa os primeiros N
  // devolvidos pela API, na ordem dela. Curadoria editorial (ou critério
  // comercial) é trabalho de uma fase futura, fora do escopo desta etapa.
  const result = await listTours({ limit });
  return result.tours;
}

async function listTourPaths(): Promise<Array<{ destino: string; slug: string }>> {
  // Usado por sitemap/generateStaticParams: precisa do catálogo inteiro,
  // não de uma página. Drena a paginação real da API (nunca busca "tudo"
  // de uma vez só) com um teto de segurança contra loop indefinido.
  const paths: Array<{ destino: string; slug: string }> = [];
  const limit = 100;
  const MAX_PAGES = 20;
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await listTours({ page, limit });
    result.tours.forEach((tour) => paths.push({ destino: tour.destinationSlug, slug: tour.slug }));
    if (page >= result.totalPages || page >= MAX_PAGES) break;
    page += 1;
  }

  return paths;
}

export const nauticflowSource: ToursDataSource = {
  name: 'nauticflow',
  listTours,
  getTour,
  listDepartures,
  listFeaturedTours,
  listDestinations,
  getDestination,
  listCategories,
  listTourPaths,
};
