import type { Category } from '@/types';

/**
 * Categorias que a vitrine da HOME não destaca hoje — não representam a
 * oferta real dos operadores no momento. Cobre os dois formatos de slug
 * que já circulam no projeto (`por_do_sol` do contrato real do
 * NauticFlow, `por-do-sol` do mock local usado em dev). Filtra só a
 * APRESENTAÇÃO na home: nunca mexe em `categoriesVitrine` (mapa de
 * ícone/descrição por `value`, usado por `nauticflow-source.ts` pra
 * qualquer categoria real que o NauticFlow devolva) nem em
 * `listCategories()` — `/passeios` continua filtrando por todas as
 * categorias reais, inclusive estas duas, se algum passeio existir nelas.
 */
const HOME_HIDDEN_CATEGORY_SLUGS = new Set(['por_do_sol', 'por-do-sol', 'outro']);

export function filterHomeCategories(categories: Category[]): Category[] {
  return categories.filter((category) => !HOME_HIDDEN_CATEGORY_SLUGS.has(category.slug));
}
