// Façade de la scène d’Aujourd’hui, partagée entre Electron et la PWA.
// Le moteur et les images ne sont demandés qu’à la première visite de l’accueil.
(() => {
  const B = window.B = window.B || {};
  const runtimeURL = new URL('../assets/camp/camp-standalone.js', document.currentScript.src);
  let pending;

  function loadEngine() {
    if (window.BivouacCamp) return Promise.resolve(window.BivouacCamp);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = runtimeURL.href;
      script.onload = () => {
        if (window.BivouacCamp?.mountCamp) resolve(window.BivouacCamp);
        else reject(new Error('Moteur du campement indisponible'));
      };
      script.onerror = () => reject(new Error('Chargement du campement interrompu'));
      document.head.append(script);
    }).catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  }

  B.Scene = (container, opts = {}) => {
    const root = document.createElement('div');
    root.className = 'scn';
    root.setAttribute('aria-hidden', 'true');
    const modeName = (value) => (value === 'nuit' || value === 'night' ? 'nuit' : 'jour');
    const state = { mode: modeName(opts.mode), animated: opts.animated !== false, debug: !!opts.debug };
    root.dataset.mode = state.mode;
    container.append(root);
    let engine;
    let disposed = false;
    const ready = loadEngine().then(async (module) => {
      if (disposed) return false;
      engine = module.mountCamp(root, state);
      await engine.ready;
      if (disposed) return false;
      root.dataset.scene = 'ready';
      return true;
    }).catch((error) => {
      if (!disposed) {
        engine?.destroy();
        engine = null;
        root.dataset.scene = 'poster';
        console.warn('Le campement affiche son illustration de secours.', error);
      }
      return false;
    });
    return {
      el: root,
      ready,
      get mode() { return state.mode; },
      setMode(mode) {
        state.mode = modeName(mode);
        root.dataset.mode = state.mode;
        engine?.setMode(state.mode);
      },
      setAnimated(on) {
        state.animated = !!on;
        engine?.setAnimated(state.animated);
      },
      setDebug(on) {
        state.debug = !!on;
        engine?.setDebug(state.debug);
      },
      destroy() {
        disposed = true;
        engine?.destroy();
        root.remove();
      }
    };
  };
})();
