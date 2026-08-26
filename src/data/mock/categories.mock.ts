/**
 * MOCK TEMPORÁRIO — não é dado de produção.
 * As categorias devem virar tabela de referência compartilhada com o NauticFlow,
 * para que o operador escolha de uma lista fechada ao publicar o passeio.
 */
import type { Category } from '@/types';

export const mockCategories: Category[] = [
  {
    id: 'cat-lancha',
    slug: 'lancha',
    name: 'Lancha',
    icon: '🚤',
    description: 'Grupos menores e roteiro mais rápido entre as praias.',
  },
  {
    id: 'cat-escuna',
    slug: 'escuna',
    name: 'Escuna',
    icon: '⛵',
    description: 'O clássico compartilhado, com música e parada para banho.',
  },
  {
    id: 'cat-catamara',
    slug: 'catamara',
    name: 'Catamarã',
    icon: '🛥️',
    description: 'Estabilidade e espaço para quem viaja em família.',
  },
  {
    id: 'cat-jet-ski',
    slug: 'jet-ski',
    name: 'Jet Ski',
    icon: '🌊',
    description: 'Saídas guiadas, com instrução antes de embarcar.',
  },
  {
    id: 'cat-praias',
    slug: 'praias',
    name: 'Praias',
    icon: '🏝️',
    description: 'Roteiros que priorizam tempo de parada e banho de mar.',
  },
  {
    id: 'cat-por-do-sol',
    slug: 'por-do-sol',
    name: 'Pôr do sol',
    icon: '🌅',
    description: 'Saídas de fim de tarde, entre uma e duas horas.',
  },
  {
    id: 'cat-privativo',
    slug: 'privativo',
    name: 'Passeio privativo',
    icon: '⭐',
    description: 'Embarcação só para o seu grupo, com roteiro flexível.',
  },
  {
    id: 'cat-compartilhado',
    slug: 'compartilhado',
    name: 'Passeio compartilhado',
    icon: '👥',
    description: 'Preço por pessoa, saídas com horário fixo.',
  },
];
