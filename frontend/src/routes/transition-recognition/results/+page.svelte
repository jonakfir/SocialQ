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
      // fall back: nonempty string is true
      return !!s;
    }
    return !!v;
  }

  function toPair(item) {
    // already pair-like
    if (Array.isArray(item) && item.length === 2) {
      return [toBool(item[0]), toBool(item[1])];
    }
    // legacy single value (boolean / number / string)
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
    try {
      parsed = JSON.parse(localStorage.getItem('quiz_results') || '[]');
    } catch {
      parsed = [];
    }

    results = Array.isArray(parsed) ? parsed.map(toPair) : [];
    // persist normalized pairs for future loads
    localStorage.setItem('quiz_results', JSON.stringify(results));
  });

  function clearAndRestart() {
    localStorage.removeItem('quiz_results');
    localStorage.removeItem('quiz_score');
    localStorage.removeItem('quiz_total');
    goto('/transition-recognition/settings'); // adjust route if different
  }
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
    /* background color set inline with !important to override globals */
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
    transition: background 0.3s ease;
  }
  .btn:hover { background: #4f46e5; color: white; }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="result-box">


  <h2 style="font-family: Georgia; font-size: 2.5rem;">Great Job!</h2>

  <div class="progress-bar">
    {#each results as pair}
      {#key pair} <!-- ensure style updates if array mutated -->
        <div
          class="progress-dot"
          style={`background-color:${colorFor(pair)} !important; background-image:none !important;`}
          title={(pair[0] && pair[1]) ? 'Both correct' : (pair[0] || pair[1]) ? 'One correct' : 'Both wrong'}
          aria-label={(pair[0] && pair[1]) ? 'Both correct' : (pair[0] || pair[1]) ? 'One correct' : 'Both wrong'}
        ></div>
      {/key}
    {/each}
  </div>

  <div class="score-circle">{score}/{total}</div>

  <button class="btn" on:click={clearAndRestart}>Play Again</button>
	<button class="btn" on:click={() => goto('/transition-recognition/results/stats')}>
			See Stats
			</button>
  <button class="btn" on:click={() => goto('/dashboard')}>Exit</button>
</div>
