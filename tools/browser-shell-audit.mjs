// CacheStorage, SRI et interception réseau réels dans un contexte Chrome isolé.
// Les suppressions ne concernent que ce profil QA, jamais le navigateur utilisateur.
export async function auditShellRepair(browser, verify, url, observePage) {
  const context = await browser.newContext({ viewport:{ width:1280, height:720 }, serviceWorkers:'allow' });
  const page = await context.newPage();
  observePage(page, 'shell-repair', ['status of 503', 'Failed to find a valid digest']);
  try {
    await page.goto(url, { waitUntil:'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload({ waitUntil:'networkidle' });
    await page.waitForFunction(() => window.nexusGame?.state === 'menu' && navigator.serviceWorker.controller);
    const before = await page.evaluate(async () => {
      const keys = (await caches.keys()).filter(key => key.startsWith('nexus-of-torment-'));
      const cache = await caches.open(keys[0]);
      const urls = (await cache.keys()).map(request => request.url);
      const style = await (await cache.match('./styles.css')).text();
      await cache.delete('./index.html');
      await cache.delete('./src/game/data.js');
      return { key:keys[0], count:urls.length, style };
    });
    const repaired = await page.evaluate(async () => {
      const response = await fetch('./index.html');
      const keys = await caches.keys();
      const cache = await caches.open(keys.find(key => key.startsWith('nexus-of-torment-')));
      return { status:response.status, count:(await cache.keys()).length, keys,
        module:Boolean(await cache.match('./src/game/data.js')), style:await (await cache.match('./styles.css')).text() };
    });
    verify('Cache incomplet réparé atomiquement en ligne dans Chrome', repaired.status === 200 && repaired.count === before.count && repaired.module && repaired.keys.includes(before.key) && repaired.style === before.style, { status:repaired.status, files:repaired.count, revision:before.key });

    let changedRequests = 0;
    const pattern = '**/src/game/data.js';
    await context.route(pattern, async route => {
      const response = await route.fetch();
      changedRequests++;
      await route.fulfill({ response, body:(await response.text()) + '\n// QA revision incompatible\n' });
    });
    await page.evaluate(async key => {
      const cache = await caches.open(key);
      await cache.delete('./index.html'); await cache.delete('./src/game/data.js');
    }, before.key);
    const rejected = await page.evaluate(async key => {
      const response = await fetch('./index.html');
      const cache = await caches.open(key);
      return { status:response.status, index:Boolean(await cache.match('./index.html')), module:Boolean(await cache.match('./src/game/data.js')), style:await (await cache.match('./styles.css')).text(), count:(await cache.keys()).length };
    }, before.key);
    verify('SRI réel refuse un module distant altéré sans cache partiel', changedRequests > 0 && rejected.status === 503 && !rejected.index && !rejected.module && rejected.style === before.style && rejected.count === before.count - 2, { alteredRequests:changedRequests, status:rejected.status, cachedFiles:rejected.count });
    await context.unroute(pattern);
    // Délai de protection contre une boucle de réparation réseau, pas de mutation du SW.
    await page.waitForTimeout(5100);
    const recovered = await page.evaluate(async key => {
      const response = await fetch('./index.html');
      const cache = await caches.open(key);
      return { status:response.status, count:(await cache.keys()).length };
    }, before.key);
    verify('Réparation récupérable après refus d’intégrité', recovered.status === 200 && recovered.count === before.count, recovered);
  } finally { await context.close(); }
}
