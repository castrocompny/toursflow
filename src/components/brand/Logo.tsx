/**
 * Marca ToursFlow.
 *
 * Ligadura T + F: uma haste vertical única. A barra superior cruza dos dois
 * lados e forma o T; as duas barras que saem apenas à direita formam o F.
 * As pontas cortadas na diagonal e o comprimento decrescente das barras
 * produzem a leitura de esteira, o "flow" do nome.
 *
 * Geometria em grade de 104. Não alterar proporções sem refazer o favicon.
 */

type MarkVariant = 'default' | 'onDark' | 'mono';

interface LogoMarkProps {
  size?: number;
  variant?: MarkVariant;
  className?: string;
}

const surface: Record<MarkVariant, string> = {
  default: '#072A38',
  onDark: 'rgba(255,255,255,0.12)',
  mono: 'currentColor',
};

export function LogoMark({ size = 36, variant = 'default', className }: LogoMarkProps) {
  const glyph = variant === 'mono' ? '#FFFFFF' : '#FFFFFF';
  const accent = variant === 'mono' ? '#FFFFFF' : '#FF6A2B';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role="img"
      aria-label="ToursFlow"
      className={className}
    >
      <rect width="104" height="104" rx="24" fill={surface[variant]} />
      <polygon points="14,20 90,20 82,34 14,34" fill={glyph} />
      <rect x="34" y="20" width="14" height="68" fill={glyph} />
      <polygon points="34,44 78,44 70,58 34,58" fill={glyph} />
      <polygon points="34,68 68,68 60,82 34,82" fill={accent} />
    </svg>
  );
}

interface LogoLockupProps {
  size?: number;
  /** Em fundo escuro o nome fica branco e a caixa da marca fica translúcida. */
  onDark?: boolean;
}

export function LogoLockup({ size = 36, onDark = false }: LogoLockupProps) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} variant={onDark ? 'onDark' : 'default'} />
      <span
        className={`font-display text-xl font-extrabold tracking-tight ${
          onDark ? 'text-white' : 'text-ink'
        }`}
      >
        Tours<span className={onDark ? 'text-sea-light' : 'text-sea'}>Flow</span>
      </span>
    </span>
  );
}
