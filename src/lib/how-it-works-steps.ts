import { CircleCheck, Compass, MapPin, type LucideIcon } from 'lucide-react';

export interface HowItWorksStep {
  title: string;
  text: string;
  icon: LucideIcon;
}

/**
 * Os 3 passos de "Como funciona" na home. O ToursFlow é a interface
 * principal do turista — nenhum passo instrui a contatar o operador
 * diretamente (posicionamento do produto, não um detalhe de copy).
 */
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    title: 'Escolha a experiência',
    text: 'Filtre por destino, tipo de embarcação e número de pessoas. Compare preço e duração lado a lado.',
    icon: Compass,
  },
  {
    title: 'Confira o embarque',
    text: 'Todo anúncio mostra endereço, ponto de referência e antecedência recomendada antes de você decidir.',
    icon: MapPin,
  },
  {
    title: 'Tudo pelo ToursFlow',
    text: 'Consulte disponibilidade, detalhes do passeio e informações de embarque em um só lugar.',
    icon: CircleCheck,
  },
];
