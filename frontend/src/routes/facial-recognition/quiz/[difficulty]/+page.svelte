<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as $pageStore } from '$app/stores';
  import { getUserKey } from '$lib/userKey';

  type Row = { img: string; options: string[]; correct: string };

  // ---- difficulty from route param ----
  let difficulty = '1';
  $: {
    const p = $pageStore && (/** @ts-ignore */ $pageStore as any);
    // Svelte store auto-subscription:
    // @ts-ignore
    difficulty = (p?.url?.pathname?.split('/').pop() ?? '1').toString();
  }

  // ---- state ----
  let quizData: Row[] = [];
  let currentIndex = 0;
  let userAnswers: (string | null)[] = [];
  let loading = true;
  let loadError = '';

  // ---- helpers ----
  const normalizeImg = (u: unknown) =>
    typeof u === 'string' && !u.startsWith('blob:') ? u : undefined;

  // ---- 5-second per-question timer (Level 5 only) ----
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

  // ---- mount: fetch questions & prepare storage for Stats ----
  onMount(async () => {
    document.title = 'Facial Recognition Quiz';
    try {
      const serverDiff = difficulty === '5' ? 'all' : difficulty;
      const res = await fetch(`/ekman?difficulty=${encodeURIComponent(serverDiff)}&count=12`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const rows: Row[] = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('No images found for this difficulty.');
      }

      quizData = rows;
      userAnswers = Array(quizData.length).fill(null);
      loadError = '';

      // ✅ Persist minimal question info for the Stats page
      const minimal = quizData.map(q => ({
        img: normalizeImg(q.img),
        correct: q.correct
      }));
      localStorage.setItem('fr_questions', JSON.stringify(minimal));

      // Clear old picks; we’ll rewrite as the user answers
      localStorage.removeItem('fr_picks');

      startTimer();
    } catch (err: any) {
      loadError = err?.message ?? 'Failed to load quiz.';
    } finally {
      loading = false;
    }
  });

  // ---- interactions ----
  function selectOption(option: string) {
    userAnswers[currentIndex] = option;

    // keep a live copy of picks so refreshes don't lose state
    const picksLive = userAnswers.map(v => (v == null ? null : v));
    localStorage.setItem('fr_picks', JSON.stringify(picksLive));
  }

  function nextQuestion() {
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

    // ✅ summary that Results page uses
    localStorage.setItem('quiz_results', JSON.stringify(results));
    localStorage.setItem('quiz_score', String(score));
    localStorage.setItem('quiz_total', String(quizData.length));

    // ✅ picks & questions for Stats page
    const picks = userAnswers.map(v => (v == null ? '__timeout__' : v));
    localStorage.setItem('fr_picks', JSON.stringify(picks));
    localStorage.setItem(
      'fr_questions',
      JSON.stringify(quizData.map(q => ({ img: normalizeImg(q.img), correct: q.correct })))
    );

    // ✅ prebuild rich details so Stats is instant
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

    // ✅ lightweight per-user history
    const userKey = getUserKey();
    const historyKey = `fr_history_${userKey}`;
    const attempt = {
      date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
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
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 90px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
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

  .back-question-btn {
    background: #e5e7eb;
    color: #111827;
    border-color: #111827;
  }
  .back-question-btn:hover { background: #fff; }

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
    margin-bottom:100px;
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

  <div class="dashboard-box quiz-box">
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
          on:click={() => selectOption(option)}>{option}</button>
      {/each}
    </div>

    <div class="nav-row">
      <button class="back-question-btn" on:click={backQuestion} disabled={currentIndex === 0}>Back</button>
      <button class="next-btn" on:click={nextQuestion}>Next</button>
    </div>
  </div>
{/if}
