(function () {
  'use strict';

  function showWebGLFallback(fallback, error) {
    console.error(error);
    if (!fallback) return;
    fallback.classList.remove('hidden');
    fallback.innerHTML = `<div><h1>WEBGL 2 REQUIS</h1><p>${String(error.message || error)}</p><p>Activez l’accélération matérielle et relancez le jeu dans Chrome, Edge ou Firefox.</p></div>`;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope:'./' }).catch((error) => console.warn('Service worker indisponible :', error));
    }, { once:true });
  }

  function boot() {
    const canvas = document.getElementById('game-canvas');
    const fallback = document.getElementById('webgl-fallback');
    if (!canvas) throw new Error('Canvas principal introuvable.');
    try {
      const probe = canvas.getContext('webgl2');
      if (!probe) throw new Error('WebGL 2 n’est pas disponible sur ce navigateur ou ce GPU.');
      const game = new window.NT.NexusGame(canvas);
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        showWebGLFallback(fallback, new Error('Le contexte graphique a été interrompu. Rechargez la page pour reprendre.'));
      });
      canvas.addEventListener('webglcontextrestored', () => {
        if (fallback) fallback.classList.add('hidden');
      });
      window.nexusGame = game;
      if (fallback) fallback.classList.add('hidden');
      game.start();
    } catch (error) {
      showWebGLFallback(fallback, error);
    }
  }

  registerServiceWorker();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
