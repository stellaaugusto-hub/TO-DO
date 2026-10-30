export const COLORS = {
  violet: '#8b5cf6', indigo: '#6366f1', blue: '#3b82f6', sky: '#0ea5e9', cyan: '#06b6d4', teal: '#14b8a6',
  emerald: '#10b981', lime: '#84cc16', amber: '#f59e0b', orange: '#f97316', red: '#ef4444', rose: '#f43f5e',
  pink: '#ec4899', fuchsia: '#d946ef', slate: '#94a3b8', gold: '#eab308',
};
export const colorOf = (key) => COLORS[key] || (String(key || '').startsWith('#') ? key : COLORS.violet);
export const DIFF_COLORS = ['#34d399', '#a3e635', '#fbbf24', '#fb923c', '#e879f9'];
