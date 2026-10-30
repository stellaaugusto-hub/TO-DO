// Génère build/icon.png (1024×1024) — icône macOS de QuestFlow.
// Un cercle ouvert traversé par une coche : un « Q » qui se coche. Noir sur blanc, façon Notion.
const { chromium } = require('playwright');
const path = require('path');

const ring = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)].map((v) => v.toFixed(2)).join(' ');
  return `M${p(a0)} A${r} ${r} 0 1 1 ${p(a1)}`;
};
// Même tracé que src/renderer/components/Logo.jsx
const MARK = `<path d="${ring(45, 52, 31, 8, 312)}"/><path d="M35 52 L49 66 L87 28"/>`;

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:1024px;height:1024px;display:grid;place-items:center">
  <div style="position:relative;width:824px;height:824px;border-radius:186px;overflow:hidden;
    background:linear-gradient(180deg,#FFFFFF 0%,#F7F6F3 62%,#EFEEEA 100%);
    box-shadow: inset 0 0 0 2px rgba(0,0,0,.06), inset 0 3px 0 rgba(255,255,255,.9), 0 24px 48px -18px rgba(0,0,0,.45)">
    <svg viewBox="0 0 100 100" width="560" height="560" style="position:absolute;left:132px;top:132px"
      fill="none" stroke="#191919" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${MARK}</svg>
  </div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(html);
  await p.screenshot({ path: path.join(__dirname, '..', 'build', 'icon.png'), omitBackground: true });
  await b.close();
  console.log('build/icon.png');
})();
