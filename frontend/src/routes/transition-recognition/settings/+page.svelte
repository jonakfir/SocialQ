<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getUserKey } from '$lib/userKey';

  let selectedLevel = 'Normal';
  // each row: { timeMs?, date?, score, total, level }
  let history = [];

  function start() {
    goto(`/transition-recognition/quiz/${selectedLevel}`);
  }

  onMount(() => {
    document.title = 'Transition Recognition – Settings';
    const userKey = getUserKey();
    const historyKey = `tr_history_${userKey}`;

    try {
      // one-time migration from old global key
      const legacy = localStorage.getItem('tr_history');
      if (legacy && !localStorage.getItem(historyKey)) {
        localStorage.setItem(historyKey, legacy);
        localStorage.removeItem('tr_history');
      }
      const rows = JSON.parse(localStorage.getItem(historyKey) || '[]');
      if (Array.isArray(rows)) history = rows;
    } catch {
      history = [];
    }
  });

  const fmtScore = (r) => `${r.score}/${r.total}`;
  function fmtTime(r) {
    if (r?.timeMs && Number.isFinite(r.timeMs)) {
      const totalSec = Math.round(r.timeMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = String(totalSec % 60).padStart(2, '0');
      return `${m}:${s}`;
    }
    // fallback for old entries
    return r?.date || '—';
  }
</script>

<style>
  @import '/static/style.css';

  .title {
    font-family: 'Georgia', serif;
    font-size: 3rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
    margin-bottom: 18px;
  }

  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    position: relative;
    z-index: 1;
  }

  .card {
    width: 90%;
    max-width: 520px;
    padding: 20px 28px 26px;
    border-radius: 40px;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 30px rgba(0,0,0,0.2);
    text-align: center;
  }

  select {
    width: 90%;
    padding: 10px;
    margin-top: 10px;
    border-radius: 8px;
    border: 1.5px solid rgba(0,0,0,0.2);
    font-size: 16px;
    background: rgba(255,255,255,0.9);
  }

  .btn {
    display: block;
    width: 90%;
    max-width: 280px;
    padding: 15px;
    margin: 15px auto;
    font-size: 18px;
    font-weight: 700;
    color: #111;
    background: #fff;
    border: 2px solid #111;
    border-radius: 40px;
    cursor: pointer;
    transition: background .2s;
    text-decoration: none;
  }
  .btn:hover { background: #f1f1f1; }

  .primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .primary:hover { filter: brightness(1.05); }

  .score-card {
    margin-top: 16px;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 10px 26px rgba(0,0,0,.12) inset;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(0,0,0,0.08);
  }

  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { padding: 12px 14px; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.13); }
  th { background: rgba(255,255,255,0.75); font-weight: 800; }
  tr:last-child td { border-bottom: none; }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="wrap">
  <div class="card">
    <h2 class="title">Transition Recognition</h2>

    <div class="score-card" aria-label="Recent attempts">
      <table>
        <thead>
          <tr>
            <th style="width:40%;">Time</th>
            <th style="width:30%;">Score</th>
            <th style="width:30%;">Mode</th>
          </tr>
        </thead>
        <tbody>
          {#if history.length === 0}
            <tr><td colspan="3" style="padding:16px;">No attempts yet. Try a round!</td></tr>
          {:else}
            {#each history.slice(0, 8) as r}
              <tr>
                <td>{fmtTime(r)}</td>
                <td>{fmtScore(r)}</td>
                <td>{r.level}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <p style="font-size:16px; margin-bottom:10px;">Choose a mode:</p>
    <select bind:value={selectedLevel}>
      <option value="Normal">Normal</option>
      <option value="Challenge">Timed Challenge</option>
    </select>

    <button class="btn primary" on:click={start}>Let's Begin</button>
    <a class="btn" href="/dashboard">Back to Dashboard</a>
  </div>
</div>
