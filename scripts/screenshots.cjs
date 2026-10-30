// Captures d'écran de l'interface (aperçu navigateur avec données de démo).
// Usage : node scripts/screenshots.cjs [nom...]   (serveur `vite preview` sur :4173)
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');
const BASE = 'http://localhost:4173/';
const only = process.argv.slice(2);

const shots = {
  async '01-accueil-prenom'(page) { await page.goto(BASE + '?fresh=1'); await page.waitForTimeout(1400); await page.fill('input', 'Stella'); await page.waitForTimeout(300); },
  async '02-bonjour'(page) { await page.goto(BASE + '?phase=greeting&hold=1'); await page.waitForTimeout(2600); },
  async '03-quetes-du-jour'(page) { await page.goto(BASE + '?phase=main'); await page.waitForTimeout(1800); },
  async '04-todo'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1600); },
  async '05-fiche-quete'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1200); await page.locator('.trow').nth(2).click(); await page.waitForTimeout(900); },
  async '06-logo-couleur'(page) { await page.goto(BASE + '?phase=main'); await page.waitForTimeout(1500); await page.locator('.qcard .icon-tile').first().click(); await page.waitForTimeout(800); },
  async '07-recherche'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1200); await page.click('.search-box input'); await page.keyboard.type('#ads'); await page.waitForTimeout(400); await page.click('.search-box input'); await page.waitForTimeout(600); },
  async '08-supprimer-confirmation'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1300); await page.locator('.trow .xbtn').nth(1).click(); await page.waitForTimeout(600); },
  async '09-chargement-jeu'(page) { await page.goto(BASE + '?phase=main&syncms=60000'); await page.waitForTimeout(1300); await page.click('text=Scanner'); await page.waitForTimeout(1200); await page.keyboard.press('Space'); for (let i = 0; i < 14; i++) { await page.waitForTimeout(260); if (i % 4 === 1) await page.keyboard.press('Space'); } },
  async '10-succes-vert'(page) { await page.goto(BASE + '?phase=main&slow=5'); await page.waitForTimeout(1500); await page.locator('.qcard .check').first().click(); await page.waitForTimeout(4200); },
  async '11-succes-fumee'(page) { await page.goto(BASE + '?phase=main&slow=5'); await page.waitForTimeout(1500); await page.locator('.qcard .check').first().click(); await page.waitForTimeout(9800); },
  async '12-terminees'(page) { await page.goto(BASE + '?phase=main&tab=done'); await page.waitForTimeout(1500); },
  async '13-reglages'(page) { await page.goto(BASE + '?phase=main&tab=settings'); await page.waitForTimeout(1500); },
  async '14-mise-a-jour'(page) { await page.goto(BASE + '?phase=main&update=1'); await page.waitForTimeout(3000); },
  async '15-texte-vers-quetes'(page) { await page.goto(BASE + '?phase=main&tab=todo'); await page.waitForTimeout(1200); await page.click('button[title^="Coller"]'); await page.waitForTimeout(400); await page.fill('.modal textarea', "Hello Stella ! Peux-tu ajouter des nouvelles ads sur Facebook, Instagram et TikTok avant vendredi ? Et n'oublie pas d'appeler Marc demain matin.\n\nMerci !\nJean Dupont\nHead of Growth\n06 12 34 56 78"); await page.click('text=Analyser'); await page.waitForTimeout(900); },
  async '16-agenda'(page) { await page.goto(BASE + '?phase=main&tab=agenda'); await page.waitForTimeout(1800); },
  async '17-agenda-evenement'(page) { await page.goto(BASE + '?phase=main&tab=agenda'); await page.waitForTimeout(1500); await page.click('text=Shooting produit'); await page.waitForTimeout(800); },
  async '18-guide-google'(page) { await page.goto(BASE + '?phase=main&tab=settings&fresh=1'); await page.waitForTimeout(1300); await page.click('text=Ouvrir le guide'); await page.waitForTimeout(900); },
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
