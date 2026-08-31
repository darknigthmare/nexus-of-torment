(function () {
  'use strict';

  function showWebGLFallback(fallback, error, game = null) {
    console.error(error);
    if (!fallback) return;
    fallback.classList.remove('hidden');
    fallback.setAttribute('role', 'alertdialog');
    fallback.setAttribute('aria-modal', 'true');
    const panel = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = game ? 'SIGNAL GRAPHIQUE INTERROMPU' : 'WEBGL 2 REQUIS';
    const message = document.createElement('p');
    message.textContent = String(error.message || error);
    const help = document.createElement('p');
    help.textContent = game
      ? 'La simulation est suspendue. Rechargez pour reconstruire le rendu ; votre dernier checkpoint reste conservé.'
      : 'Activez l’accélération matérielle et relancez le jeu dans un navigateur compatible WebGL 2.';
    const reload = document.createElement('button');
    reload.id = 'graphics-reload';
    reload.className = 'primary-button';
    reload.textContent = 'RECHARGER LE JEU';
    reload.addEventListener('click', () => window.location.reload());
    panel.append(title, message, help, reload);
    fallback.replaceChildren(panel);
    reload.focus();
  }

  function clearInput(game) {
    for (const key of ['keys', 'pressed', 'released', 'mouseButtons', 'mousePressed', 'mouseReleased']) game.input[key]?.clear?.();
    game.input.clearVirtualInputs?.();
    game.input.mouseDX = game.input.mouseDY = game.input.wheel = 0;
  }

  function protectLifecycle(game, canvas, fallback) {
    // Une restauration WebGL invalide tous les buffers/programmes : pas de faux retour au jeu.
    // Les wrappers gèlent la simulation ET le rendu jusqu’au rechargement explicite.
    const update = game.update.bind(game), render = game.render.bind(game);
    game.update = dt => { if (!game.graphicsUnavailable && !game.persistenceBlocked) return update(dt); };
    game.render = () => { if (!game.graphicsUnavailable) return render(); };
    const suspendForFocusLoss = () => {
      if (game.state === 'playing') game.pause();
      clearInput(game);
      game.audio.suspend?.();
    };
    const protectPersistence = () => {
      const status = game.save.status;
      if (!status?.conflict && !status?.futureVersion) return;
      game.persistenceBlocked = true;
      suspendForFocusLoss();
      game.input.exitLock?.();
    };
    // Les boutons HTML d’export/rechargement restent accessibles, mais aucune
    // reprise ne peut masquer la pause pour afficher un faux combat immobile.
    for (const name of ['startRun', 'restartRun', 'resumeSavedRun', 'resume']) {
      if (typeof game[name] !== 'function') continue;
      const action = game[name].bind(game);
      game[name] = (...args) => game.persistenceBlocked ? false : action(...args);
    }
    document.addEventListener('nt-save-status', protectPersistence);
    window.addEventListener('storage', event => {
      if (event.key !== null && event.key !== game.save.key) return;
      if (game.save.checkExternalChanges?.()) {
        suspendForFocusLoss();
        protectPersistence();
      }
    });
    protectPersistence();
    window.addEventListener('blur', suspendForFocusLoss);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspendForFocusLoss(); });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      game.graphicsUnavailable = true;
      game.state = 'graphics-lost';
      game.input.enabled = false;
      clearInput(game);
      game.input.exitLock();
      game.audio.suspend?.();
      showWebGLFallback(fallback, new Error('Le contexte graphique a été perdu. Aucun ennemi ne peut agir pendant cette interruption.'), game);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // La restauration du contexte seul ne restaure pas les ressources du moteur.
      // Le bouton reste présent et activeRun n’a jamais été réécrit/supprimé.
      if (game.graphicsUnavailable) game.graphicsContextRestored = true;
    });
  }

  function registerServiceWorker() {
    let installPrompt = null;
    const status = {
      supported:'serviceWorker' in navigator && /^https?:$/.test(location.protocol),
      installed:Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
      installAvailable:false, offlineReady:false, updateAvailable:false, error:null
    };
    const notify = changes => {
      Object.assign(status, changes);
      if (typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('nt-pwa-status', { detail:{ ...status } }));
    };
    window.nexusPWA = {
      status,
      async install() {
        if (!installPrompt) return false;
        const prompt = installPrompt;
        installPrompt = null;
        notify({ installAvailable:false, error:null });
        try {
          await prompt.prompt();
          return (await prompt.userChoice)?.outcome === 'accepted';
        } catch (error) {
          notify({ error:String(error.message || error) });
          return false;
        }
      }
    };
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      notify({ installAvailable:true });
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      notify({ installed:true, installAvailable:false });
    });
    if (!status.supported || !/^https?:$/.test(location.protocol)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js', { scope:'./' });
        if (!registration) throw new Error('Enregistrement hors ligne non autorisé par le navigateur.');
        const observeInstalling = () => {
          const worker = registration.installing;
          if (!worker) return;
          const changed = () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) notify({ updateAvailable:true });
            if (worker.state === 'redundant') notify({ error:'Installation hors ligne incomplète. Réessayez en ligne.' });
          };
          worker.addEventListener('statechange', changed);
          changed();
        };
        if (registration.waiting) notify({ updateAvailable:true });
        registration.addEventListener('updatefound', observeInstalling);
        observeInstalling();
        await navigator.serviceWorker.ready;
        notify({ offlineReady:true });
      } catch (error) {
        notify({ error:String(error.message || error) });
        console.warn('Service worker indisponible :', error);
      }
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once:true });
  }

  function boot() {
    const canvas = document.getElementById('game-canvas');
    const fallback = document.getElementById('webgl-fallback');
    if (!canvas) throw new Error('Canvas principal introuvable.');
    try {
      const probe = canvas.getContext('webgl2');
      if (!probe) throw new Error('WebGL 2 n’est pas disponible sur ce navigateur ou ce GPU.');
      const game = new window.NT.NexusGame(canvas);
      protectLifecycle(game, canvas, fallback);
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
