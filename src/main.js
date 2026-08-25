(function () {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game-canvas');
    const fallback = document.getElementById('webgl-fallback');
    if (!canvas) throw new Error('Canvas principal introuvable.');
    try {
      const probe = canvas.getContext('webgl2');
      if (!probe) throw new Error('WebGL 2 n’est pas disponible sur ce navigateur ou ce GPU.');
      const game = new window.NT.NexusGame(canvas);
      window.nexusGame = game;
      if (fallback) fallback.classList.add('hidden');
      game.start();
    } catch (error) {
      console.error(error);
      if (fallback) {
        fallback.classList.remove('hidden');
        fallback.innerHTML = `<div><h1>WEBGL 2 REQUIS</h1><p>${String(error.message || error)}</p><p>Activez l’accélération matérielle et relancez le jeu dans Chrome, Edge ou Firefox.</p></div>`;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
