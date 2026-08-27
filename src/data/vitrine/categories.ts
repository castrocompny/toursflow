/**
 * Metadados de vitrine das categorias — propriedade do ToursFlow, mesma
 * lógica de docs/PLANO-INTEGRACAO-NAUTICFLOW.md, seção 6, Opção C.
 *
 * A API pública do NauticFlow garante `value` (identificador estável,
 * escolhido pelo operador de uma lista fechada) e `label` (nome em
 * português já pronto para exibir). Ícone e descrição curta são só
 * decoração de card, então moram aqui, ligados por `value`.
 *
 * Categoria com `value` fora deste mapa (nova opção que o NauticFlow
 * passe a oferecer e o ToursFlow ainda não estilizou) cai no fallback
 * genérico — nunca inventa um ícone/descrição específicos.
 */
export interface CategoryVitrine {
  icon: string;
  description: string;
}

export const categoriesVitrine: Record<string, CategoryVitrine> = {
  passeio_privativo: {
    icon: '⭐',
    description: 'Embarcação só para o seu grupo, com roteiro flexível.',
  },
  por_do_sol: {
    icon: '🌅',
    description: 'Saídas de fim de tarde, entre uma e duas horas.',
  },
  praias: {
    icon: '🏝️',
    description: 'Roteiros que priorizam tempo de parada e banho de mar.',
  },
  ilhas: {
    icon: '🏞️',
    description: 'Passeios com paradas em ilhas ao longo do roteiro.',
  },
  passeio_compartilhado: {
    icon: '👥',
    description: 'Preço por pessoa, saídas com horário fixo.',
  },
  outro: {
    icon: '🚤',
    description: 'Outros tipos de passeio náutico.',
  },
};

/** Usado quando o NauticFlow devolve um `value` de categoria ainda sem vitrine escrita. */
export const genericCategoryVitrine: CategoryVitrine = {
  icon: '⚓',
  description: '',
};
