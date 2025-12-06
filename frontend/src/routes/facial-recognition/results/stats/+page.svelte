<script lang="ts">
  // We read localStorage → disable SSR
  export const ssr = false;

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getUserKey } from '$lib/userKey';

  let details = [];
  let score = 0;

  const readJSON = (k, f) => {
    try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? f; }
    catch { return f; }
  };

  const normalizeImg = (u) =>
    (typeof u === 'string' && !u.startsWith('blob:')) ? u : undefined;

  function synthesizeFromFR(userKey: string) {
    const qs    = readJSON(`fr_questions_${userKey}`, []);
    const picks = readJSON(`fr_picks_${userKey}`, []);
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
    document.title = 'Quiz Stats';
    
    const userKey = getUserKey();

    // Prefer rich details from user-specific keys
    let d = readJSON(`fr_quiz_details_${userKey}`, null);
    const broken = !(Array.isArray(d) && d.length) ||
                   d.some(x => !('picked' in x) || !('correct' in x));

    // Repair from FR storage if needed
    if (broken) {
      const repaired = synthesizeFromFR(userKey);
      if (repaired) {
        d = repaired;
        localStorage.setItem(`fr_quiz_details_${userKey}`, JSON.stringify(d));
      }
    }

    // Final fallback from booleans
    if (!(Array.isArray(d) && d.length)) {
      const bools = readJSON(`fr_quiz_results_${userKey}`, []);
      d = bools.map((ok, i) => ({
        index: i,
        img: undefined,
        correct: '(unknown)',
        picked: '(unknown)',
        isCorrect: !!ok
      }));
    }

    details = d;
    score = details.filter(x => x.isCorrect).length;
  });

  function playAgain() {
    const userKey = getUserKey();
    
    // Remove only this user's data
    localStorage.removeItem(`fr_quiz_results_${userKey}`);
    localStorage.removeItem(`fr_quiz_score_${userKey}`);
    localStorage.removeItem(`fr_quiz_total_${userKey}`);
    localStorage.removeItem(`fr_picks_${userKey}`);
    localStorage.removeItem(`fr_questions_${userKey}`);
    localStorage.removeItem(`fr_quiz_details_${userKey}`);
    goto('/facial-recognition/settings');
  }
</script>

<svelte:head>
  <title>Quiz Stats • SocialQ</title>
</svelte:head>

<style>
  @import '/static/style.css';
  :global(html, body) { height: 100%; }

  .page {
    min-height:100vh;
    position:relative;
    display:grid;
    place-items:center;
  }

  .glass {
    width:min(980px,94vw);
    background:rgba(255,255,255,.85);
    backdrop-filter:blur(18px);
    border-radius:20px;
    box-shadow:0 14px 48px rgba(0,0,0,.18);
    display:grid;
    grid-template-rows:auto auto 1fr auto; /* header, dots, list, footer */
    max-height:84vh;
    overflow:hidden;
  }

  .head { padding:20px 24px 6px; text-align:center; }
  .title {
    font-family:'Georgia', serif;
    font-size:3rem;
    color:#fff;
    -webkit-text-stroke:2px rgba(0,0,0,.5);
    text-shadow:0 3px 3px rgba(0,0,0,.4);
    margin:6px 0 10px;
  }
  .summary { font-weight:800; color:#111; }

  .dots { display:flex; justify-content:center; gap:8px; padding:0 24px 12px; }
  .dot { width:36px; height:8px; border-radius:4px; background:#ddd; }
  .ok { background:#22c55e; } .no { background:#ef4444; }

  .list { overflow:auto; padding:12px 16px 16px; }
  .row {
    display:grid;
    grid-template-columns:72px 1fr auto;
    gap:14px;
    align-items:center;
    padding:12px;
    margin:10px 8px;
    border:1.5px solid rgba(17,17,17,.15);
    border-radius:12px;
    background:rgba(255,255,255,.95);
  }

  .thumb {
    width:72px; height:72px;
    border-radius:10px;
    object-fit:cover;
    background:#f5f5f5;
    border:1px solid rgba(17,17,17,.08);
  }

  .labels { line-height:1.35; }
  .q { font-weight:800; color:#111; margin-bottom:2px; }
  .correct { color:#111; }
  .picked { color:#374151; }
  .picked.bad { color:#b91c1c; }

  .badge {
    font-weight:800;
    padding:8px 12px;
    border-radius:9999px;
    border:2px solid #111;
    background:#fff;
    white-space:nowrap;
  }
  .badge.ok { background:#22c55e; color:#fff; border-color:#22c55e; }
  .badge.no { background:#ef4444; color:#fff; border-color:#ef4444; }

  /* Footer like Transition Recognition: sticky row with side-by-side buttons */
  .footer {
    position: sticky;
    bottom: 0;
    background: linear-gradient(180deg, rgba(255,255,255,.75), rgba(255,255,255,.92));
    border-top: 1px solid rgba(0,0,0,.08);
    padding: 14px 16px;
  }
  .footer-row {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;          /* wrap on tiny screens */
  }

  .btn {
    display:block;
    padding:14px 18px;
    border-radius:9999px;
    font-weight:800;
    font-size:16px;
    cursor:pointer;
    border:2px solid #111;
    background:#fff;
    color:#111;
    transition:transform .05s, filter .2s;
    min-width: 220px;
    flex: 1 1 260px;          /* grow evenly, min ~260 */
    max-width: 360px;
    text-align:center;
  }
  .btn:hover { filter:brightness(1.03); }
  .btn:active { transform: translateY(1px); }
  .btn.primary { background:#4f46e5; border-color:#4f46e5; color:#fff; }
</style>

<!-- background blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page">
  <div class="glass">
    <div class="head">
      <div class="title">Your Answers</div>
      <div class="summary">{score}/{details.length} correct</div>
    </div>

    <div class="dots">
      {#each details as d}
        <div class="dot {d.isCorrect ? 'ok' : 'no'}"></div>
      {/each}
    </div>

    <div class="list">
      {#each details as d, i}
        <div class="row">
          {#if d.img}
            <img class="thumb" src={d.img} alt={`Q${i + 1}`} />
          {:else}
            <div class="thumb" aria-label="no image"></div>
          {/if}

          <div class="labels">
            <div class="q">Q{i + 1}</div>
            <div class="correct"><strong>Correct:</strong> {d.correct}</div>
            <div class="picked {d.isCorrect ? '' : 'bad'}">
              <strong>Your pick:</strong> {d.picked === '__timeout__' ? '— (timeout)' : d.picked}
            </div>
          </div>

          <div class="badge {d.isCorrect ? 'ok' : 'no'}">
            {d.isCorrect ? 'Correct' : 'Incorrect'}
          </div>
        </div>
      {/each}
    </div>

    <!-- Sticky, side-by-side footer buttons -->
    <div class="footer">
      <div class="footer-row">
        <button class="btn primary" on:click={playAgain}>Play Again</button>
        <button class="btn" on:click={() => goto('/facial-recognition/results')}>Back to Results</button>
        <button class="btn" on:click={() => goto('/dashboard')}>Dashboard</button>
      </div>
    </div>
  </div>
</div>
