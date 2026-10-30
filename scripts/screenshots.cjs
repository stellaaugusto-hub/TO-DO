// Captures d'écran de l'interface (aperçu navigateur avec données de démo).
// Usage : node scripts/screenshots.cjs [nom...]   (serveur `vite preview` sur :4173)
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');
const BASE = 'http://localhost:4173/';
const only = process.argv.slice(2);

const shots = {
  async '01-accueil'(page) { await page.goto(BASE + '?fresh=1'); await page.waitForTimeout(900); await page.fill('input', 'Stella'); await page.waitForTimeout(200); },
  async '02-bonjour'(page) { await page.goto(BASE + '?phase=greeting&hold=1'); await page.waitForTimeout(2200); },
  async '03-quetes-du-jour'(page) { await page.goto(BASE + '?phase=main'); await page.waitForTimeout(1300); },
  async '04-todo-liste'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1200); },
  async '05-todo-tableau'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(900); await page.click('.view-tab:has-text("Tableau")'); await page.waitForTimeout(700); },
  async '06-todo-kanban'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(900); await page.click('.view-tab:has-text("Kanban")'); await page.waitForTimeout(700); },
  async '07-fiche-tache'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1000); await page.locator('.list-row .title').nth(3).click(); await page.waitForTimeout(700); },
  async '08-icone-couleur'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1000); await page.locator('.list-row .title').nth(3).click(); await page.waitForTimeout(600); await page.click('.peek .page-icon'); await page.waitForTimeout(500); },
  async '09-recherche'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(900); await page.keyboard.press('Control+k'); await page.waitForTimeout(300); await page.keyboard.type('#ads'); await page.waitForTimeout(500); },
  async '10-couverture'(page) { await page.goto(BASE + '?phase=main'); await page.waitForTimeout(1000); await page.hover('.cover'); await page.click('text=Changer la couverture'); await page.waitForTimeout(500); },
  async '11-options-page'(page) { await page.goto(BASE + '?phase=main'); await page.waitForTimeout(1000); await page.click('button[title="Options de la page"]'); await page.waitForTimeout(500); },
  async '12-reglages-apparence'(page) { await page.goto(BASE + '?phase=main&tab=settings'); await page.waitForTimeout(800); await page.click('.settings-nav >> text=Apparence'); await page.waitForTimeout(500); },
  async '13-reglages-pages'(page) { await page.goto(BASE + '?phase=main&tab=settings'); await page.waitForTimeout(800); await page.click('.settings-nav >> text=Pages'); await page.waitForTimeout(500); },
  async '14-sombre'(page) { await page.goto(BASE + '?phase=main&theme=dark'); await page.waitForTimeout(1300); },
  async '15-serif-violet'(page) { await page.goto(BASE + '?phase=main&tab=todo&font=serif&accent=purple'); await page.waitForTimeout(1200); },
  async '16-agenda'(page) { await page.goto(BASE + '?phase=main&tab=agenda'); await page.waitForTimeout(1300); },
  async '17-terminees'(page) { await page.goto(BASE + '?phase=main&tab=done'); await page.waitForTimeout(1100); },
  async '18-succes-vert'(page) { await page.goto(BASE + '?phase=main&slow=5'); await page.waitForTimeout(1200); await page.locator('.complete-btn').first().click(); await page.waitForTimeout(4200); },
  async '19-succes-fumee'(page) { await page.goto(BASE + '?phase=main&slow=5'); await page.waitForTimeout(1200); await page.locator('.complete-btn').first().click(); await page.waitForTimeout(9800); },
  async '20-chargement-jeu'(page) { await page.goto(BASE + '?phase=main&syncms=60000'); await page.waitForTimeout(1000); await page.click('.topbar >> text=Scanner'); await page.waitForTimeout(1200); await page.keyboard.press('Space'); await page.waitForTimeout(1750); await page.keyboard.down('Space'); await page.waitForTimeout(260); },
  async '20b-jeu-sombre'(page) { await page.goto(BASE + '?phase=main&syncms=60000&theme=dark'); await page.waitForTimeout(1000); await page.click('.topbar >> text=Scanner'); await page.waitForTimeout(1500); },
  async '21-connexion-chrome'(page) { await page.goto(BASE + '?fresh=1&login=hold'); await page.waitForTimeout(900); await page.fill('input', 'Stella'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); await page.click('text=Continuer'); await page.waitForTimeout(500); await page.click('text=Se connecter avec Google Chrome'); await page.waitForTimeout(1600); },
  async '22-connexion-reussie'(page) { await page.goto(BASE + '?phase=main&fresh=1&tab=settings'); await page.waitForTimeout(800); await page.click('.settings-nav >> text=Google'); await page.waitForTimeout(300); await page.click('text=Se connecter avec Chrome'); await page.waitForTimeout(5600); },
  async '23-reglages-google'(page) { await page.goto(BASE + '?phase=main&tab=settings'); await page.waitForTimeout(800); await page.click('.settings-nav >> text=Google'); await page.waitForTimeout(300); await page.click('button:has-text("Tester")'); await page.waitForTimeout(1900); },
  async '24-chrome-absent'(page) { await page.goto(BASE + '?phase=main&fresh=1&nochrome=1'); await page.waitForTimeout(900); await page.click('text=Connecter Google'); await page.waitForTimeout(700); },
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  for (const [name, fn] of Object.entries(shots)) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(name, 'PAGE ERROR', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error(name, 'console', m.text()));
    await fn(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('ok', name);
    await page.close();
  }
  await browser.close();
})();
