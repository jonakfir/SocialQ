<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getUserKey } from '$lib/userKey';

  type Row = { img: string; options: string[]; correct: string };

  // Force exactly N questions
  const QUESTION_COUNT = 8;

  // Difficulty from route param
  let difficulty = '1';
  $: difficulty = (($page.params?.difficulty ?? '1') as string).toString();

  // State
  let quizData: Row[] = [];
  let currentIndex = 0;
  let userAnswers: (string | null)[] = [];
  let loading = true;
  let loadError = '';

  // Instructions modal gate
  let instructionsOpen = true;

  // Helper to store safe image URLs
  const normalizeImg = (u: unknown) =>
    typeof u === 'string' && !u.startsWith('blob:') ? u : undefined;

  // 5-second per-question timer (Level 5 only)
  const TIME_LIMIT_MS = 5000;
  let timeLeft = TIME_LIMIT_MS;
  let tickHandle: number | null = null;

  // ring geometry (for the level-5 timer)
  const R = 28;
  const C = 2 * Math.PI * R;

  // progress (0..1) based on time left
  $: pct = difficulty === '5'
    ? Math.max(0, Math.min(1, timeLeft / TIME_LIMIT_MS))
    : 0;

  function stopTimer() {
    if (tickHandle) cancelAnimationFrame(tickHandle);
    tickHandle = null;
  }

  function startTimer() {
    stopTimer();
    if (difficulty !== '5') {
      timeLeft = TIME_LIMIT_MS;
      return;
    }
    timeLeft = TIME_LIMIT_MS;
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      timeLeft = Math.max(0, TIME_LIMIT_MS - elapsed);
      if (timeLeft <= 0) {
        stopTimer();
        if (!userAnswers[currentIndex]) userAnswers[currentIndex] = '__timeout__';
        if (currentIndex < quizData.length - 1) {
          currentIndex++;
          startTimer();
        } else {
          finish();
        }
        return;
      }
      tickHandle = requestAnimationFrame(tick);
    };
    tickHandle = requestAnimationFrame(tick);
  }

  onDestroy(stopTimer);

  // Overall quiz timer (from instructions dismissed to finish)
  let quizStartedAt: number | null = null;

  // Mount: fetch questions & prepare storage for Stats
  onMount(async () => {
    document.title = 'Facial Recognition Quiz';
    try {
      const serverDiff = difficulty === '5' ? 'all' : difficulty;

      const res = await fetch(
        `/ekman?difficulty=${encodeURIComponent(serverDiff)}&count=${QUESTION_COUNT}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const rows: Row[] = await res.json();

      quizData = (Array.isArray(rows) ? rows.slice(0, QUESTION_COUNT) : []);
      if (!quizData.length) throw new Error('No images found for this difficulty.');

      userAnswers = Array(quizData.length).fill(null);
      loadError = '';

      // Persist minimal question info for the Stats page
      const minimal = quizData.map(q => ({
        img: normalizeImg(q.img),
        correct: q.correct
      }));
      localStorage.setItem('fr_questions', JSON.stringify(minimal));
      localStorage.removeItem('fr_picks'); // clear old picks

      // If instructions already closed, start timers
      if (!instructionsOpen) {
        if (quizStartedAt == null) quizStartedAt = performance.now();
        startTimer();
      }
    } catch (err: any) {
      loadError = err?.message ?? 'Failed to load quiz.';
    } finally {
      loading = false;
    }
  });

  function closeInstructions() {
    instructionsOpen = false;
    // start overall timer when user starts playing
    if (quizData.length && quizStartedAt == null) {
      quizStartedAt = performance.now();
    }
    // start per-question timer for level 5
    if (difficulty === '5' && quizData.length) startTimer();
  }

  // Interactions
  function selectOption(option: string) {
    if (instructionsOpen) return;
    userAnswers[currentIndex] = option;

    // keep a live copy of picks so refreshes don't lose state
    const picksLive = userAnswers.map(v => (v == null ? null : v));
    localStorage.setItem('fr_picks', JSON.stringify(picksLive));
  }

  function nextQuestion() {
    if (instructionsOpen) return;
    if (!userAnswers[currentIndex]) {
      alert('Please select an option before continuing!');
      return;
    }
    if (currentIndex < quizData.length - 1) {
      currentIndex++;
      startTimer();
    } else {
      finish();
    }
  }

  function backQuestion() {
    if (instructionsOpen) return;
    if (currentIndex > 0) {
      currentIndex--;
      startTimer();
    }
  }

  function finish() {
    stopTimer();

    // Determine results + score
    let score = 0;
    const results: boolean[] = [];
    quizData.forEach((q, i) => {
      const ok = userAnswers[i] === q.correct;
      if (ok) score++;
      results.push(ok);
    });

    // summary for Results page
    localStorage.setItem('quiz_results', JSON.stringify(results));
    localStorage.setItem('quiz_score', String(score));
    localStorage.setItem('quiz_total', String(quizData.length));

    // picks & questions for Stats page
    const picks = userAnswers.map(v => (v == null ? '__timeout__' : v));
    localStorage.setItem('fr_picks', JSON.stringify(picks));
    localStorage.setItem(
      'fr_questions',
      JSON.stringify(quizData.map(q => ({ img: normalizeImg(q.img), correct: q.correct })))
    );

    // prebuild rich details so Stats is instant
    const details = quizData.map((q, i) => {
      const picked = picks[i];
      return {
        index: i,
        img: normalizeImg(q.img),
        correct: q.correct,
        picked,
        isCorrect: picked === q.correct
      };
    });
    localStorage.setItem('quiz_details', JSON.stringify(details));

    // lightweight per-user history with elapsed time
    const userKey = getUserKey();
    const historyKey = `fr_history_${userKey}`;

    const endedAt = performance.now();
    const elapsedMs = quizStartedAt != null ? Math.max(0, endedAt - quizStartedAt) : 0;

    const attempt = {
      timeMs: elapsedMs,                        // new field used by Settings
      // date: new Date().toISOString().slice(0, 10), // keep if you still want the date
      score,
      total: quizData.length,
      difficulty
    };
    const existing = JSON.parse(localStorage.getItem(historyKey) || '[]');
    existing.unshift(attempt);
    localStorage.setItem(historyKey, JSON.stringify(existing.slice(0, 50)));

    goto('/facial-recognition/results');
  }
</script>

<style>
  @import '/static/style.css';

  :root{
    --brand: #4f46e5;
    --brand-strong: #7c3aed;
    --brand2: #22d3ee;
  }

  .quiz-box,
  .quiz-box * { font-family: 'Arial', sans-serif; }

  .settings-title {
    font-family: 'Georgia', serif;
    font-weight: 700;
  }

  .quiz-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 90%;
    max-width: 750px;
    padding: 30px;
    background:
      linear-gradient(180deg, rgba(255,255,255,.60), rgba(255,255,255,.52)),
      radial-gradient(1200px 800px at 12% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 88% 20%, rgba(34,211,238,.10), transparent 60%);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    border: 1px solid rgba(255,255,255,.75);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    margin: 28px auto;
  }

  .quiz-box img {
    width: min(370px, 70%);
    height: auto;
    border-radius: 12px;
    margin-bottom: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,.15);
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    width: 100%;
  }
  .dot {
    width: 40px; height: 8px;
    background: #d3d3d3;
    border-radius: 4px;
    transition: background .25s ease, width .25s ease;
  }
  .dot.active { background: var(--brand); width: 60px; }

  .option-btn {
    display: inline-block;
    min-width: 160px;
    margin: 10px 8px;
    padding: 14px 18px;
    font-size: 18px;
    font-weight: 700;
    color: var(--brand);
    background: #fff;
    border: 2px solid var(--brand);
    border-radius: 9999px;
    cursor: pointer;
    transition: transform .05s ease,
                background .2s, color .2s,
                border-color .2s, box-shadow .2s;
  }
  .option-btn:not(.selected):hover {
    background: var(--brand);
    color: #fff;
    box-shadow: 0 6px 18px rgba(79,70,229,.25);
  }
  .option-btn.selected {
    background: var(--brand-strong);
    border-color: var(--brand-strong);
    color: #fff;
    box-shadow: 0 6px 18px rgba(124,58,237,.28);
  }
  .option-btn[disabled]{
    opacity:.7; cursor:not-allowed; filter: grayscale(.1);
  }

  .next-btn,
  .back-question-btn {
    display: inline-block;
    width: 160px;
    margin: 10px 8px;
    padding: 14px 20px;
    font-size: 18px;
    font-weight: 700;
    border-radius: 9999px;
    cursor: pointer;
    transition: filter .2s ease, background .2s, color .2s, border-color .2s;
    border: 2px solid transparent;
  }
  .next-btn {
    background: var(--brand);
    color: #fff;
    border-color: var(--brand);
  }
  .next-btn:hover { filter: brightness(1.05); }
  .next-btn[disabled]{ opacity:.7; cursor:not-allowed; }

  .back-question-btn {
    background: #e5e7eb;
    color: #111827;
    border-color: #111827;
  }
  .back-question-btn:hover { background: #fff; }
  .back-question-btn[disabled]{ opacity:.7; cursor:not-allowed; }

  .nav-row {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 6px;
  }

  .back-btn {
    position: absolute;
    width: 50px; height: 50px;
    top: 12px; left: 12px;
    font-size: 20px; font-weight: bold;
    background: none; border: none; color: black;
    cursor: pointer; z-index: 3;
  }

  .media-row{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:18px;
    margin-bottom:16px;
  }

  .ring-wrap{
    position:relative;
    width:64px; height:64px;
    flex:0 0 auto;
    margin-bottom:-27px;
  }

  .ring{
    width:100%; height:100%;
    transform:rotate(-90deg);
  }

  .ring .bg{
    fill:none;
    stroke:rgba(0,0,0,.12);
    stroke-width:6;
  }

  .ring .fg{
    fill:none;
    stroke:var(--brand);
    stroke-width:6;
    stroke-linecap:round;
    transition:stroke-dashoffset .08s linear;
  }

  .ring-label{
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    font-weight:700;
    font-size:0.95rem;
    color:var(--brand);
  }

  :global(body){
    background:
      radial-gradient(1200px 800px at 20% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 80% 30%, rgba(34,211,238,.12), transparent 60%),
      #f7f7fb;
  }

  /* modal */
  .modal-backdrop{
    position: fixed; inset: 0;
    background:
      radial-gradient(60% 40% at 20% 10%, rgba(79,70,229,.28), transparent 60%),
      radial-gradient(50% 40% at 80% 30%, rgba(34,211,238,.24), transparent 60%),
      rgba(0,0,0,.45);
    display: grid; place-items: center;
    z-index: 50;
    animation: fadeIn .18s ease;
  }
  .modal{
    width: min(640px, 94vw);
    background:
      linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(79,70,229,.28);
    border-radius: 16px;
    box-shadow: 0 24px 68px rgba(0,0,0,.35);
    padding: 18px 18px 14px;
    text-align: left;
    color: #0f172a;
    animation: pop .18s ease;
  }
  .modal-header{
    display:flex; align-items:center; gap:10px; margin-bottom: 6px;
  }
  .badge{
    width: 34px; height: 34px; border-radius: 9999px;
    display:grid; place-items:center;
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    box-shadow: 0 6px 18px rgba(79,70,229,.35);
    color: #fff; font-size: 18px;
  }
  .modal h3{ margin: 0; font-size: 1.25rem; }
  .modal-body{
    color:#111; line-height:1.55; padding: 6px 2px 0;
  }
  .modal-body ul{ margin: 0; padding-left: 18px; }
  .modal-body li{ margin: 6px 0; }
  .modal-actions{
    display:flex; justify-content:flex-end; gap:8px; margin-top: 12px;
  }
  .action{
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    color:#fff; border: none; border-radius: 10px;
    padding: 10px 16px; cursor: pointer;
    box-shadow: 0 10px 26px rgba(79,70,229,.28);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .action:hover{ filter: brightness(1.02); box-shadow: 0 14px 32px rgba(79,70,229,.36); }
  .action:active{ transform: translateY(1px); }

  @keyframes pop{ from{ transform: scale(.96); opacity: 0; } to{ transform: scale(1); opacity: 1; } }
  @keyframes fadeIn{ from{ opacity: 0; } to{ opacity: 1; } }
</style>

{#if loading}
  <div class="dashboard-box quiz-box">Loading…</div>
{:else if loadError}
  <div class="dashboard-box quiz-box">Error: {loadError}</div>
{:else}
  <!-- blobs -->
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

  <div class="media-row">
    {#if difficulty === '5'}
      <div class="ring-wrap" title="Time left">
        <svg viewBox="0 0 64 64" class="ring" aria-hidden="true">
          <circle cx="32" cy="32" r={R} class="bg" />
          <circle
            cx="32" cy="32" r={R}
            class="fg"
            style="stroke-dasharray:{C}; stroke-dashoffset:{C * (1 - pct)}" />
        </svg>
        <div class="ring-label">{Math.ceil(timeLeft / 1000)}</div>
      </div>
    {/if}
  </div>

  <div class="dashboard-box quiz-box" aria-disabled={instructionsOpen}>
    <div class="progress-bar">
      {#each quizData as _, i}
        <div class="dot {i <= currentIndex ? 'active' : ''}"></div>
      {/each}
    </div>

    <h1 class="settings-title">Facial Recognition</h1>

    <img id="emotion-img" src={quizData[currentIndex].img} alt="Emotion Face" />

    <p style="font-size:18px; margin-bottom:15px;">What emotion do you see?</p>

    <div id="options">
      {#each quizData[currentIndex].options as option}
        <button
          class="option-btn {userAnswers[currentIndex] === option ? 'selected' : ''}"
          on:click={() => selectOption(option)}
          disabled={instructionsOpen}
        >{option}</button>
      {/each}
    </div>

    <div class="nav-row">
      <button class="back-question-btn" on:click={backQuestion} disabled={instructionsOpen || currentIndex === 0}>Back</button>
      <button class="next-btn" on:click={nextQuestion} disabled={instructionsOpen}>Next</button>
    </div>
  </div>

  <!-- colorful instructions modal -->
  {#if instructionsOpen}
    <div class="modal-backdrop" on:click={closeInstructions}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="How to play" on:click|stopPropagation>
        <div class="modal-header">
          <div class="badge">🧠</div>
          <h3>How to play</h3>
        </div>
        <div class="modal-body">
          <ul>
            <li>Select the correct answer choice of emotion for the face that is shown.</li>
            <li>Increase the difficulty for a harder quiz and decrease it for an easier quiz.</li>
            <li>On the hardest level you have five seconds per question.</li>
          </ul>
        </div>
        <div class="modal-actions">
          <button class="action" type="button" on:click={closeInstructions}>Got it</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
