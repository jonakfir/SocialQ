<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  let score = 0;
  let total = 0;
  let results = [];

  // animated score (counts up when page loads)
  const animatedScore = tweened(0, { duration: 600, easing: cubicOut });

  onMount(() => {
    document.title = 'Quiz Result';

    score   = Number(localStorage.getItem('quiz_score')  || 0);
    total   = Number(localStorage.getItem('quiz_total')  || 0);
    results = JSON.parse(localStorage.getItem('quiz_results') || '[]');

    // kick off the count-up
    animatedScore.set(score);
  });

  function clearAndRestart() {
    localStorage.removeItem('quiz_results');
    localStorage.removeItem('quiz_score');
    localStorage.removeItem('quiz_total');
    goto('/facial-recognition/settings');
  }
</script>

<style>
  @import '/static/style.css';

  .page-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    position: relative;
  }

  .result-box {
    width: 95%;
    max-width: 600px;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    margin: auto;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    position: relative;
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 25px;
    flex-wrap: wrap;
  }

  .progress-dot {
    width: 45px;
    height: 10px;
    border-radius: 5px;

    /* animation */
    opacity: 0;
    transform: scale(.8) translateY(4px);
    animation: pop .35s ease-out forwards;
  }

  @keyframes pop {
    0%   { opacity: 0; transform: scale(.8) translateY(4px); }
    60%  { opacity: 1; transform: scale(1.08) translateY(0); }
    100% { opacity: 1; transform: scale(1); }
  }

  .correct { background: #22c55e; }
  .wrong   { background: #ef4444; }

  .title {
    font-family: Georgia, serif;
    font-size: 2.5rem;
    margin: 0 0 8px;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 3px 8px rgba(0,0,0,0.35);
    animation: slideIn .45s ease both;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
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
    animation: pulseOnce .7s ease .62s 1 both;
  }

  @keyframes pulseOnce {
    0% { transform: scale(1); }
    50% { transform: scale(1.04); }
    100% { transform: scale(1); }
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
    transition: transform .08s ease, background .3s ease, color .3s ease;
  }

  .btn:hover {
    background: #4f46e5;
    color: white;
    transform: translateY(-1px);
  }
</style>

<!-- Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page-container">
  <div class="result-box">
    <h2 class="title">Great Job!</h2>

    <div class="progress-bar" aria-label="Question results">
      {#each results as res, i}
        <div
          class="progress-dot {res ? 'correct' : 'wrong'}"
          style="animation-delay: {i * 60}ms"
        ></div>
      {/each}
    </div>

    <div class="score-circle" aria-live="polite">
      {Math.round($animatedScore)}/{total}
    </div>

    <button class="btn" on:click={clearAndRestart}>Play Again</button>
    <button class="btn" on:click={() => goto('/facial-recognition/results/stats')}>See Stats</button>
    <button class="btn" on:click={() => goto('/dashboard')}>Dashboard</button>
  </div>
</div>
