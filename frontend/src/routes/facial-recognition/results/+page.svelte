<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let score = 0;
  let total = 0;
  let results = [];

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
    catch { return fallback; }
  }

  function normalizeImg(u) {
    return (typeof u === 'string' && !u.startsWith('blob:')) ? u : undefined;
  }

  function synthesizeDetails() {
    const qs = readJSON('fr_questions', []);
    const picks = readJSON('fr_picks', []);
    if (!Array.isArray(qs) || !qs.length) return null;

    return qs.map((q, i) => {
      const correct =
        q?.correct ?? q?.answer ?? q?.label ?? q?.name ?? q?.emotion ?? '(unknown)';
      const img = normalizeImg(q?.img ?? q?.src ?? q?.url);
      const picked = (picks[i] ?? '__timeout__');
      return { index: i, img, correct, picked, isCorrect: picked === correct };
    });
  }

  onMount(() => {
    document.title = 'Quiz Result';

    // Prefer a rich details array if it exists and is sane
    let details = readJSON('quiz_details', null);
    if (!Array.isArray(details) || !details.length || details.some(d => !('picked' in d) || !('correct' in d))) {
      const synth = synthesizeDetails();
      if (synth) {
        details = synth;
        localStorage.setItem('quiz_details', JSON.stringify(details));
      }
    }

    if (Array.isArray(details) && details.length) {
      score = details.filter(d => d.isCorrect).length;
      total = details.length;
      results = details.map(d => !!d.isCorrect);
    } else {
      // ultra-fallback to booleans if needed
      score   = Number(localStorage.getItem('quiz_score')  || 0);
      total   = Number(localStorage.getItem('quiz_total')  || 0);
      results = readJSON('quiz_results', []);
    }
  });

  function clearAndRestart() {
    localStorage.removeItem('quiz_results');
    localStorage.removeItem('quiz_score');
    localStorage.removeItem('quiz_total');
    // keep quiz_details so Stats can still render after replay if desired
    goto('/facial-recognition/settings');
  }
</script>

<style>
  @import '/static/style.css';
  .page-container { display:flex; justify-content:center; align-items:center; min-height:100vh; position:relative; }
  .result-box {
    width:95%; max-width:600px; background:rgba(255,255,255,0.8); backdrop-filter:blur(20px);
    padding:40px; border-radius:20px; text-align:center; margin:auto; box-shadow:0 4px 30px rgba(0,0,0,.2); position:relative;
  }
  .progress-bar { display:flex; justify-content:center; gap:8px; margin-bottom:25px; }
  .progress-dot { width:45px; height:10px; border-radius:5px; }
  .correct { background:#4CAF50; } .wrong { background:#FF3B30; }
  .score-circle { width:200px; height:200px; border-radius:50%; background:#4f46e5; color:#fff; font-size:40px; font-weight:bold; display:flex; justify-content:center; align-items:center; margin:30px auto; }
  .btn { display:block; width:80%; max-width:300px; padding:15px; margin:15px auto; font-size:20px; font-weight:bold; color:#000; background:#fff; border:2px solid #000; border-radius:40px; cursor:pointer; text-align:center; transition:background .3s; }
  .btn:hover { background:#4f46e5; color:#fff; }
</style>

<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page-container">
  <div class="result-box">
    <h2 style="font-family: Georgia; font-size: 2.5rem;">Great Job!</h2>

    <div class="progress-bar">
      {#each results as res}<div class="progress-dot {res ? 'correct' : 'wrong'}"></div>{/each}
    </div>

    <div class="score-circle">{score}/{total}</div>

    <button class="btn" on:click={clearAndRestart}>Play Again</button>
    <button class="btn" on:click={() => goto('/facial-recognition/results/stats')}>See Stats</button>
    <button class="btn" on:click={() => goto('/dashboard')}>Exit</button>
  </div>
</div>
