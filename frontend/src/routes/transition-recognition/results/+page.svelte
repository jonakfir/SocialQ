<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let score = 0;
  let total = 0;
  /** @type {Array<[boolean, boolean]>} */
  let results = [];

  // Robust truthiness coercion for many legacy shapes
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v == null) return false;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
      if (s === 'false' || s === '0' || s === 'no'  || s === 'n') return false;
      return !!s;
    }
    return !!v;
  }
  function toPair(item) {
    if (Array.isArray(item) && item.length === 2) {
      return [toBool(item[0]), toBool(item[1])];
    }
    return [toBool(item), toBool(item)];
  }
  function colorFor(pair) {
    const [a, b] = pair;
    if (a && b) return '#4CAF50';  // green
    if (a || b) return '#FFD700';  // yellow
    return '#FF3B30';              // red
  }

  onMount(() => {
    document.title = 'Quiz Result';
    score = Number(localStorage.getItem('quiz_score') || 0);
    total = Number(localStorage.getItem('quiz_total') || 0);

    let parsed = [];
    try { parsed = JSON.parse(localStorage.getItem('quiz_results') || '[]'); }
    catch { parsed = []; }

    results = Array.isArray(parsed) ? parsed.map(toPair) : [];
    localStorage.setItem('quiz_results', JSON.stringify(results));
  });

  function clearAndRestart() {
    localStorage.removeItem('quiz_results');
    localStorage.removeItem('quiz_score');
    localStorage.removeItem('quiz_total');
    goto('/transition-recognition/settings');
  }

  // ---- Animation helpers (match FR Results) ----
  const motionOK =
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur  = (n) => (motionOK ? n : 0);
  const stag = (i, step = 70) => (motionOK ? i * step : 0);
</script>

<style>
  @import '/static/style.css';

  .result-box {
    width: 95%;
    max-width: 500px;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    margin: auto;
    margin-top: 150px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    position: relative;
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 25px;
  }
  .progress-dot {
    width: 45px;
    height: 10px;
    border-radius: 5px;
    animation: dotIn .28s ease both;
    animation-delay: var(--d, 0ms);
  }

  .score-circle {
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: #4f46e5;
    color: white;
    font-size: 40px;
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 30px auto;
  }
  .pop { animation: pop .36s ease both; }

  .btn {
    display: block;
    width: 80%;
    max-width: 300px;
    padding: 15px;
    margin: 15px auto;
    font-size: 20px;
    font-weight: bold;
    color: black;
    background-color: white;
    border: 2px solid black;
    border-radius: 40px;
    cursor: pointer;
    text-align: center;
    transition: background .3s ease, filter .2s ease, transform .05s ease;
  }
  .btn:hover { background: #4f46e5; color: white; }
  .btn:active { transform: translateY(1px); }

  /* keyframes (shared look with FR page) */
  @keyframes pop {
    0%   { transform: scale(.82); opacity: 0 }
    60%  { transform: scale(1.04); opacity: 1 }
    100% { transform: scale(1) }
  }
  @keyframes dotIn {
    from { transform: translateY(6px); opacity: 0 }
    to   { transform: translateY(0);   opacity: 1 }
  }

  /* Respect prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    .pop, .progress-dot { animation: none !important; }
  }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="result-box"
     in:fly={{ y: 8, duration: dur(280) }}>
  <h2 style="font-family: Georgia; font-size: 2.5rem;"
      in:fly={{ y: -12, duration: dur(360) }}>
    Great Job!
  </h2>

  <div class="progress-bar"
       in:fly={{ y: 8, duration: dur(360), delay: 90 }}>
    {#each results as pair, i}
      {#key pair}
        <div
          class="progress-dot"
          style={`--d:${stag(i)}ms; background-color:${colorFor(pair)} !important; background-image:none !important;`}
          title={(pair[0] && pair[1]) ? 'Both correct' : (pair[0] || pair[1]) ? 'One correct' : 'Both wrong'}
          aria-label={(pair[0] && pair[1]) ? 'Both correct' : (pair[0] || pair[1]) ? 'One correct' : 'Both wrong'}
        ></div>
      {/key}
    {/each}
  </div>

  <div class="score-circle pop"
       in:fly={{ y: 8, duration: dur(360), delay: 160 }}>
    {score}/{total}
  </div>

  <button class="btn"
          in:fly={{ y: 12, duration: dur(300), delay: 120 }}
          on:click={clearAndRestart}>
    Play Again
  </button>

  <button class="btn"
          in:fly={{ y: 12, duration: dur(300), delay: 180 }}
          on:click={() => goto('/transition-recognition/results/stats')}>
    See Stats
  </button>

  <button class="btn"
          in:fly={{ y: 12, duration: dur(300), delay: 240 }}
          on:click={() => goto('/dashboard')}>
    Exit
  </button>
</div>
