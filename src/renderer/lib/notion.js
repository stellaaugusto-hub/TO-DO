// Palette et constantes « à la Notion ».

export const NOTION_COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const COLOR_LABEL = { default: 'Par défaut', gray: 'Gris', brown: 'Marron', orange: 'Orange', yellow: 'Jaune', green: 'Vert', blue: 'Bleu', purple: 'Violet', pink: 'Rose', red: 'Rouge' };

// anciennes couleurs (v1) -> palette Notion
const LEGACY = { violet: 'purple', indigo: 'blue', sky: 'blue', cyan: 'blue', teal: 'green', emerald: 'green', lime: 'green', amber: 'yellow', gold: 'yellow', rose: 'red', fuchsia: 'pink', slate: 'gray' };
export const nc = (c) => (NOTION_COLORS.includes(c) ? c : LEGACY[c] || 'default');
export const tagStyle = (c) => ({ background: `var(--c-${nc(c)}-bg)`, color: `var(--c-${nc(c)}-tx)` });
export const textColor = (c) => `var(--c-${nc(c)})`;

export const STAGES = [
  { key: 'todo', label: 'À faire', color: 'gray' },
  { key: 'doing', label: 'En cours', color: 'yellow' },
  { key: 'waiting', label: 'En attente', color: 'purple' },
  { key: 'done', label: 'Fait', color: 'green' },
];
export const stageOf = (t) => (t.status === 'done' ? 'done' : t.stage || 'todo');

export const PRIORITY_TAG = {
  1: { label: 'Urgente', color: 'red' },
  2: { label: 'Haute', color: 'orange' },
  3: { label: 'Moyenne', color: 'gray' },
  4: { label: 'Basse', color: 'default' },
};

export const SOURCE_TAG = {
  mail: { label: 'Mail', color: 'blue' },
  chat: { label: 'Chat', color: 'green' },
  manual: { label: 'Perso', color: 'yellow' },
  calendar: { label: 'Agenda', color: 'purple' },
};

export const DIFF_COLORS = ['green', 'green', 'yellow', 'orange', 'red'];

// icône automatique (v1) -> emoji
export const ICON_EMOJI = {
  megaphone: '📣', mail: '✉️', phone: '📞', receipt: '🧾', presentation: '📊', video: '🎬', palette: '🎨', chart: '📈',
  globe: '🌐', users: '👥', check: '✅', sword: '⚔️', truck: '🚚', pen: '✏️', sparkles: '✨', rocket: '🚀', target: '🎯',
};
export const taskEmoji = (t) => (t.emoji !== undefined && t.emoji !== null ? t.emoji : ICON_EMOJI[t.icon] || '⚔️');

export const EMOJIS = {
  'Travail': '🎯 ✅ 📌 📍 📝 ✏️ 🖊️ 📎 📋 📁 📂 🗂️ 📅 📆 🗓️ ⏰ ⏳ 📊 📈 📉 💼 🗃️ 🧾 💳 💶 💰 📦 🚚 🏷️ 🔖 📣 📢 💬 🗨️ ✉️ 📧 📨 📞 ☎️ 💻 🖥️ 📱 ⌨️ 🖨️ 🔗 🔍 🔑 🔒 🛠️ ⚙️ 🧩 🧠 💡 🔥 ⚡ ⭐ 🌟 ✨ 🏆 🥇 🎖️ 🚀 🎬 🎥 📸 📷 🎨 🖌️ 🖼️ 🎙️ 🎧 🎵 🌐 🛒 🛍️ 🏪 🏢 🏠 🧪 🔬 📚 📖 🎓',
  'Quêtes': '⚔️ 🗡️ 🛡️ 🏹 👑 💎 🔮 🧭 🗺️ 🏔️ ⛰️ 🐉 🦄 🧙 🪄 🎲 🎮 🕹️ 🧱 🪙 🏰 🗝️ 🎁 🎉 🎊 🥳 💪 🙌 👏 🤝 👀 🤔 😎 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍',
  'Nature': '🌸 🌺 🌷 🌹 🌻 🌼 🍀 🌿 🌱 🌵 🌴 🍁 🍂 🌙 ☀️ 🌤️ ⛅ 🌈 ❄️ 💧 🌊 🔥 🌍 🪐 ⭐ 🐝 🦋 🐱 🐶 🦊 🐼',
  'Bien-être': '💆 💅 🧖 🧴 🧼 🪞 💄 👄 💋 🫧 🌸 🕯️ 🛁 🧘 🏃 🚴 🏋️ 🥗 🥑 🍓 🍋 🍵 ☕ 🍰 🥂 🍾',
  'Symboles': '❗ ❓ ⚠️ 🚫 ✔️ ☑️ ✖️ ➕ ➖ 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🔺 🔻 ♻️ 💯 🆕 🆗 🔝 📶 ⏩ ⏪ 🔄 ⏸️',
};

// Couvertures
export const COVER_PRESETS = [
  { id: 'nude', label: 'Nude', css: 'linear-gradient(135deg, #f3ebe2 0%, #e2cdb9 55%, #cfae93 100%)' },
  { id: 'peach', label: 'Pêche', css: 'linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)' },
  { id: 'rose', label: 'Rose', css: 'linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)' },
  { id: 'lavender', label: 'Lavande', css: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' },
  { id: 'mint', label: 'Menthe', css: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)' },
  { id: 'ocean', label: 'Océan', css: 'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)' },
  { id: 'sunset', label: 'Couchant', css: 'linear-gradient(120deg, #f6d365 0%, #fda085 100%)' },
  { id: 'night', label: 'Nuit', css: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
  { id: 'mesh', label: 'Aurore', css: 'radial-gradient(at 20% 30%, #ffd1dc 0, transparent 50%), radial-gradient(at 80% 20%, #c7d2fe 0, transparent 50%), radial-gradient(at 60% 90%, #bbf7d0 0, transparent 55%), #fdf6ec' },
  { id: 'sand', label: 'Sable', css: 'linear-gradient(180deg, #f7f3ee 0%, #ece3d6 100%)' },
  { id: 'berry', label: 'Baies', css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'forest', label: 'Forêt', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
];
export const coverCss = (cover) => {
  if (!cover) return null;
  if (cover.startsWith('data:') || cover.startsWith('http')) return `url("${cover}")`;
  if (cover.startsWith('color:')) return `var(--c-${cover.slice(6)}-bg)`;
  return COVER_PRESETS.find((c) => c.id === cover)?.css || null;
};

export const ACCENTS = {
  blue: ['#2383e2', '#0077d4'], purple: ['#9065b0', '#7b52a0'], pink: ['#c14c8a', '#a83d77'], red: ['#d44c47', '#be3c37'],
  orange: ['#d9730d', '#c2650a'], green: ['#448361', '#3a7253'], brown: ['#9f6b53', '#8a5b45'], black: ['#37352f', '#1f1e1b'],
};

export const PAGES = [
  { id: 'quests', title: 'Quêtes du jour', emoji: '🎯', cover: 'nude' },
  { id: 'todo', title: 'To-do', emoji: '✅', cover: null },
  { id: 'agenda', title: 'Agenda', emoji: '📅', cover: null },
  { id: 'done', title: 'Terminées', emoji: '🏆', cover: null },
];

export const TODO_COLUMNS = [
  { key: 'stage', label: 'Statut' },
  { key: 'priority', label: 'Priorité' },
  { key: 'due', label: 'Échéance' },
  { key: 'source', label: 'Source' },
  { key: 'difficulty', label: 'Difficulté' },
  { key: 'tags', label: 'Tags' },
  { key: 'xp', label: 'XP' },
  { key: 'from', label: 'De' },
];
