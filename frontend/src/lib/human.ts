/**
 * Shared Human.js singleton for the client. Loads the script and models once;
 * all games (mirroring, training, upload) reuse the same instance for a ~100x
 * speedup on repeat visits.
 */

const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models';

let instance: any = null;
let initPromise: Promise<any> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Human.js is client-only'));
  const w = window as any;
  if (w.Human?.Human) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Human.js'));
    document.head.appendChild(s);
  });
}

function createAndInit(): Promise<any> {
  const w = window as any;
  const HumanCtor = w.Human?.Human;
  if (!HumanCtor) return Promise.reject(new Error('Human not on window'));

  const human = new HumanCtor({
    backend: 'webgl',
    modelBasePath: MODEL_BASE,
    face: {
      enabled: true,
      detector: { enabled: true, maxFaces: 1 },
      mesh: { enabled: true },
      iris: { enabled: true },
      description: { enabled: true },
      emotion: { enabled: true }
    },
    body: false,
    hand: false,
    object: false,
    gesture: false
  });

  return human.load().then(() => human.warmup().then(() => human));
}

/**
 * Returns the shared Human instance. Loads script + models once, then returns
 * the cached instance on every subsequent call (instant).
 */
export function getHuman(): Promise<any> {
  if (instance) return Promise.resolve(instance);
  if (initPromise) return initPromise;

  initPromise = loadScript()
    .then(() => createAndInit())
    .then((h) => {
      instance = h;
      return h;
    });

  return initPromise;
}

/**
 * Start loading Human in the background (e.g. from layout or dashboard).
 * Does not block; call getHuman() when you need the instance.
 */
export function preloadHuman(): void {
  if (typeof window === 'undefined') return;
  if (instance || initPromise) return;
  getHuman().catch(() => {
    // Ignore; first real use will retry
  });
}
