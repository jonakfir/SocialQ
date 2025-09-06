<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getUserKey } from '$lib/userKey';

  type Row = { img: string; options: string[]; correct: string };

  const QUESTION_COUNT = 8;

  let difficulty = '1';
  $: difficulty = (($page.params?.difficulty ?? '1') as string).toString();

  let quizData: Row[] = [];
  let currentIndex = 0;
  let userAnswers: (string | null)[] = [];
  let loading = true;
  let loadError = '';

  let instructionsOpen = true;

  const normalizeImg = (u: unknown) =>
    typeof u === 'string' && !u.startsWith('blob:') ? u : undefined;

  const TIME_LIMIT_MS = 5000;
  let timeLeft = TIME_LIMIT_MS;
  let tickHandle: number | null = null;

  const R = 28;
  const C = 2 * Math.PI * R;

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

  let quizStartedAt: number | null = null;

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

      const minimal = quizData.map(q => ({
        img: normalizeImg(q.img),
        correct: q.correct
      }));
      localStorage.setItem('fr_questions', JSON.stringify(minimal));
      localStorage.removeItem('fr_picks');

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
    if (quizData.length && quizStartedAt == null) {
      quizStartedAt = performance.now();
    }
    if (difficulty === '5' && quizData.length) startTimer();
  }

  function selectOption(option: string) {
    if (instructionsOpen) return;
    userAnswers[currentIndex] = option;
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

    let score = 0;
    const results: boolean[] = [];
    quizData.forEach((q, i) => {
      const ok = userAnswers[i] === q.correct;
      if (ok) score++;
      results.push(ok);
    });

    localStorage.setItem('quiz_results', JSON.stringify(results));
    localStorage.setItem('quiz_score', String(score));
    localStorage.setItem('quiz_total', String(quizData.length));

    const picks = userAnswers.map(v => (v == null ? '__timeout__' : v));
    localStorage.setItem('fr_picks', JSON.stringify(picks));
    localStorage.setItem(
      'fr_questions',
      JSON.stringify(quizData.map(q => ({ img: normalizeImg(q.img), correct: q.correct })))
    );

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

    const userKey = getUserKey();
    const historyKey = `fr_history_${userKey}`;

    const endedAt = performance.now();
    const elapsedMs = quizStartedAt != null ? Math.max(0, endedAt - quizStartedAt) : 0;

    const attempt = {
      timeMs: elapsedMs,
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

    /* scale helpers tied to viewport */
    --pad: min(4vmin, 6vw);
    --gap: min(2vmin, 3vw);
    --radius: 3vmin;
    --font-base: clamp(1.6vmin, 2.2vmin, 3vmin);
    --font-lg: clamp(2.2vmin, 3vmin, 4vmin);
    --font-xl: clamp(3vmin, 3.8vmin, 5vmin);
  }

  .quiz-box,
  .quiz-box * { font-family: 'Arial', sans-serif; }

  .settings-title {
    font-family: 'Georgia', serif;
    font-weight: 700;
    font-size: var(--font-xl);
    margin: 0 0 calc(var(--gap) * 0.6);
  }

  .quiz-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    /* container sizing by viewport percent */
    width: 92vw;
    max-width: 92vw;
    padding: var(--pad);
    background:
      linear-gradient(180deg, rgba(255,255,255,.60), rgba(255,255,255,.52)),
      radial-gradient(1200px 800px at 12% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 88% 20%, rgba(34,211,238,.10), transparent 60%);
    backdrop-filter: blur(1.4vmin);
    border-radius: var(--radius);
    border: 0.2vmin solid rgba(255,255,255,.75);
    box-shadow: 0 2vmin 6vmin rgba(0, 0, 0, 0.2);
    margin: 3vmin auto;
    box-sizing: border-box;
  }

  .quiz-box img {
    width: 70%;
    max-width: 90vw;
    height: auto;
    border-radius: calc(var(--radius) * 0.6);
    margin-bottom: var(--gap);
    box-shadow: 0 1.6vmin 5vmin rgba(0,0,0,.15);
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: calc(var(--gap) * 0.6);
    margin-bottom: var(--gap);
    width: 100%;
  }
  .dot {
    width: 6%;
    height: 0.9vmin;
    background: #d3d3d3;
    border-radius: 0.9vmin;
    transition: background .25s ease, width .25s ease;
  }
  .dot.active { background: var(--brand); width: 8%; }

  #options{
    display:flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: calc(var(--gap) * 0.7);
    width: 100%;
    margin-bottom: var(--gap);
  }

  .option-btn {
    display: inline-block;
    flex: 1 1 42%;
    max-width: 48%;
    min-width: 36%;
    padding: 2vmin 2.4vmin;
    font-size: var(--font-lg);
    font-weight: 700;
    color: var(--brand);
    background: #fff;
    border: 0.4vmin solid var(--brand);
    border-radius: 9999px;
    cursor: pointer;
    transition: transform .05s ease,
                background .2s, color .2s,
                border-color .2s, box-shadow .2s;
  }
  .option-btn:not(.selected):hover {
    background: var(--brand);
    color: #fff;
    box-shadow: 0 1.2vmin 3vmin rgba(79,70,229,.25);
  }
  .option-btn.selected {
    background: var(--brand-strong);
    border-color: var(--brand-strong);
    color: #fff;
    box-shadow: 0 1.2vmin 3vmin rgba(124,58,237,.28);
  }
  .option-btn[disabled]{ opacity:.7; cursor:not-allowed; filter: grayscale(.1); }

  .next-btn,
  .back-question-btn {
    display: inline-block;
    width: 36%;
    min-width: 28%;
    max-width: 40%;
    padding: 2vmin 2.6vmin;
    font-size: var(--font-lg);
    font-weight: 700;
    border-radius: 9999px;
    cursor: pointer;
    transition: filter .2s ease, background .2s, color .2s, border-color .2s;
    border: 0.4vmin solid transparent;
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
    gap: var(--gap);
    margin-top: calc(var(--gap) * 0.5);
    width: 100%;
  }

  .back-btn {
    position: absolute;
    width: 8vmin; height: 8vmin;
    top: 2.4vmin; left: 2.4vmin;
    font-size: var(--font-lg); font-weight: bold;
    background: none; border: none; color: black;
    cursor: pointer; z-index: 3;
  }

  .media-row{
    display:flex;
    align-items:center;
    justify-content:center;
    gap: var(--gap);
    margin-bottom: var(--gap);
    width: 100%;
  }

  .ring-wrap{
    position:relative;
    width: min(14vmin, 22vw);
    height: min(14vmin, 22vw);
    flex:0 0 auto;
    margin-bottom: calc(var(--gap) * -0.9);
  }

  .ring{
    width:100%; height:100%;
    transform:rotate(-90deg);
  }

  .ring .bg{
    fill:none;
    stroke:rgba(0,0,0,.12);
    stroke-width: 0.9vmin;
  }

  .ring .fg{
    fill:none;
    stroke:var(--brand);
    stroke-width: 0.9vmin;
    stroke-linecap:round;
    transition:stroke-dashoffset .08s linear;
  }

  .ring-label{
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    font-weight:700;
    font-size: var(--font-base);
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
    width: 94vw;
    max-width: 94vw;
    background:
      linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 0.3vmin solid rgba(79,70,229,.28);
    border-radius: calc(var(--radius) * 0.7);
    box-shadow: 0 3vmin 9vmin rgba(0,0,0,.35);
    padding: calc(var(--pad) * 0.8);
    text-align: left;
    color: #0f172a;
    animation: pop .18s ease;
    box-sizing: border-box;
  }
  .modal-header{
    display:flex; align-items:center; gap: calc(var(--gap) * 0.6); margin-bottom: 1vmin;
  }
  .badge{
    width: 6vmin; height: 6vmin; border-radius: 9999px;
    display:grid; place-items:center;
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    box-shadow: 0 1.2vmin 3vmin rgba(79,70,229,.35);
    color: #fff; font-size: var(--font-lg);
  }
  .modal h3{ margin: 0; font-size: var(--font-lg); }
  .modal-body{
    color:#111; line-height:1.55; padding: 1vmin 0.4vmin 0;
    font-size: var(--font-base);
  }
  .modal-body ul{ margin: 0; padding-left: 4vmin; }
  .modal-body li{ margin: 1vmin 0; }
  .modal-actions{
    display:flex; justify-content:flex-end; gap: calc(var(--gap) * 0.6); margin-top: 1.2vmin;
  }
  .action{
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    color:#fff; border: none; border-radius: 2vmin;
    padding: 1.6vmin 2.4vmin; cursor: pointer;
    box-shadow: 0 2vmin 5vmin rgba(79,70,229,.28);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
    font-size: var(--font-base);
  }
  .action:hover{ filter: brightness(1.02); box-shadow: 0 2.4vmin 6vmin rgba(79,70,229,.36); }
  .action:active{ transform: translateY(0.2vmin); }

  @keyframes pop{ from{ transform: scale(.96); opacity: 0; } to{ transform: scale(1); opacity: 1; } }
  @keyframes fadeIn{ from{ opacity: 0; } to{ opacity: 1; } }
</style>

{#if loading}
  <div class="dashboard-box quiz-box">Loading…</div>
{:else if loadError}
  <div class="dashboard-box quiz-box">Error: {loadError}</div>
{:else}
  <!-- blobs (kept as is) -->
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

    <p style="font-size: var(--font-lg); margin-bottom: calc(var(--gap) * 0.8);">What emotion do you see?</p>

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
