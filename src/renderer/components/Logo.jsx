// Logo QuestFlow : un cercle ouvert traversé par une coche (même tracé que build/icon.png).
export function Logo({ size = 28, color = 'currentColor', strokeWidth, className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" width={size} height={size} fill="none" stroke={color} strokeWidth={strokeWidth || (size < 30 ? 13 : 10)} strokeLinecap="round" strokeLinejoin="round" aria-label="QuestFlow">
      <path d="M75.70 56.31 A31 31 0 1 1 65.74 28.96" />
      <path d="M35 52 L49 66 L87 28" />
    </svg>
  );
}

/** Icône d'app (carré arrondi blanc, logo noir) pour l'accueil et les écrans plein écran. */
export function AppIcon({ size = 64 }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, borderRadius: size * 0.225 }}>
      <Logo size={size * 0.68} color="#191919" strokeWidth={10} />
    </span>
  );
}
