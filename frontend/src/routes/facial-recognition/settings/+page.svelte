<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getUserKey } from '$lib/userKey';

  let selectedDifficulty = '1';
  // Each row may be old shape ({date,...}) or new ({timeMs,...})
  let history = [];  // [{ timeMs?, date?, score, total, difficulty }]

  function startQuiz() {
    goto(`/facial-recognition/quiz/${selectedDifficulty}`);
  }

  onMount(() => {
    document.title = "Facial Recognition Settings - SocialQ";
    const userKey = getUserKey();
    const historyKey = `fr_history_${userKey}`;

    try {
      // one-time migration from legacy global key (if present)
      const legacy = localStorage.getItem('fr_history');
      if (legacy && !localStorage.getItem(historyKey)) {
        localStorage.setItem(historyKey, legacy);
        localStorage.removeItem('fr_history');
      }

      const rows = JSON.parse(localStorage.getItem(historyKey) || '[]');
      if (Array.isArray(rows)) history = rows;
    } catch {
      history = [];
    }
  });

  function fmtScore(row) {
    return `${row.score}/${row.total}`;
  }

  // Show total elapsed time as mm:ss (falls back to old date if needed)
  function fmtTime(row) {
    if (row?.timeMs && Number.isFinite(row.timeMs)) {
      const totalSec = Math.round(row.timeMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = String(totalSec % 60).padStart(2, '0');
      return `${m}:${s}`;
    }
    return row?.date || '—';
  }

  function goDashboard() {
    goto('/dashboard');
  }
</script>

<style>
  @import '/static/style.css';

  .settings-title {
    font-family: 'Georgia', serif;
    font-size: 3rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
    text-shadow: 0 10px 10px rgba(0, 0, 0, 0.4);
    margin-bottom: 20px;
  }

  .settings-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    position: relative;
    z-index: 1;
  }

  .dashboard-box {
    z-index: 1;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(20px);
    border-radius: 40px;
    padding: 18px 30px 26px;
    width: 90%;
    max-width: 520px;
    text-align: center;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    margin: auto;
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

  .settings-btn, .btn {
    display: block;
    width: 90%;
    max-width: 280px;
    padding: 15px;
    margin: 15px auto;
    font-size: 18px;
    font-weight: bold;
    color: black;
    background-color: white;
    border: 2px solid black;
    border-radius: 40px;
    text-decoration: none;
    text-align: center;
    transition: all 0.3s ease;
    cursor: pointer;
  }
  .settings-btn:hover, .btn:hover { background-color: #f1f1f1; }

  /* Scores table */
  .score-card {
    margin-top: 16px;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 10px 26px rgba(0,0,0,.12) inset;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(0,0,0,0.08);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
  }
  th, td {
    padding: 12px 14px;
    text-align: center;
    border-bottom: 1px solid rgba(0,0,0,0.13);
    backdrop-filter: blur(2px);
  }
  th {
    background: rgba(255,255,255,0.75);
    font-weight: 800;
  }
  tr:last-child td { border-bottom: none; }
  .muted {
    margin-top: 6px;
    font-size: 12px;
    color: #6b7280;
  }
</style>

<!-- Background Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="settings-screen">
  <div class="dashboard-box">
    <h2 class="settings-title">Facial Recognition</h2>

    <!-- Recent scores -->
    <div class="score-card" aria-label="Recent attempts">
      <table>
        <thead>
          <tr>
            <th style="width:40%;">Time</th>   <!-- changed -->
            <th style="width:30%;">Score</th>
            <th style="width:30%;">Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {#if history.length === 0}
            <tr><td colspan="3" style="padding:16px;">No attempts yet. Good luck!</td></tr>
          {:else}
            {#each history.slice(0, 8) as row}
              <tr>
                <td>{fmtTime(row)}</td>
                <td>{fmtScore(row)}</td>
                <td>{row.difficulty}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <p style="font-size:16px; margin-bottom:10px;">Select a difficulty to start:</p>
    <select bind:value={selectedDifficulty}>
      <option value="1">Easy</option>
      <option value="2">Medium</option>
      <option value="3">Hard</option>
      <option value="4">Expert</option>
      <option value="5">Timed Challenge</option>
    </select>

    <button class="settings-btn" on:click={startQuiz}>Let's Begin</button>

    <a class="btn" style="margin-top:12px;" on:click={goDashboard}>Back to Dashboard</a>
  </div>
</div>
