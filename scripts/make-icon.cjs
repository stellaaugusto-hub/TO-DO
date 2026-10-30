// Génère build/icon.png (1024×1024) — icône macOS de QuestFlow.
const { chromium } = require('playwright');
const path = require('path');
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:1024px;height:1024px;display:grid;place-items:center">
  <div style="position:relative;width:824px;height:824px;border-radius:186px;overflow:hidden;
    background:radial-gradient(circle at 25% 15%, #c084fc 0%, transparent 45%), radial-gradient(circle at 85% 90%, #22d3ee 0%, transparent 50%), linear-gradient(140deg,#7c3aed 0%,#4f46e5 45%,#0e7490 100%);
    box-shadow: inset 0 4px 0 rgba(255,255,255,.35), inset 0 -10px 40px rgba(0,0,0,.25), 0 30px 60px -20px rgba(0,0,0,.6)">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 46%, rgba(255,255,255,.28), transparent 52%)"></div>
    <svg viewBox="0 0 24 24" width="520" height="520" style="position:absolute;left:152px;top:150px;filter:drop-shadow(0 18px 30px rgba(20,0,60,.55)) drop-shadow(0 0 30px rgba(255,255,255,.35))"
      fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/>
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>
    </svg>
    <svg viewBox="0 0 24 24" width="120" height="120" style="position:absolute;right:120px;top:96px" fill="#fde68a"><path d="M12 0l2.6 8.6L23 12l-8.4 3.4L12 24l-2.6-8.6L1 12l8.4-3.4z"/></svg>
    <svg viewBox="0 0 24 24" width="60" height="60" style="position:absolute;left:120px;bottom:130px" fill="#a5f3fc"><path d="M12 0l2.6 8.6L23 12l-8.4 3.4L12 24l-2.6-8.6L1 12l8.4-3.4z"/></svg>
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
