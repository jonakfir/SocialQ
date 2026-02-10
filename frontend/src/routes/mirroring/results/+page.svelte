<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { getUserKey } from '$lib/userKey';

  let score = 0;
  let total = 0;
  let results = [];
  let titleIn = false;
  let showDots = false;
  let buttonsRise = false;
  let pulse = false;

  const animatedScore = tweened(0, { duration: 600, easing: cubicOut });

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
    catch { return fallback; }
  }

  onMount(() => {
    document.title = 'Mirroring Result';

    const userKey = getUserKey();

    score   = Number(localStorage.getItem(`mirroring_score_${userKey}`)  || 0);
    total   = Number(localStorage.getItem(`mirroring_total_${userKey}`)  || 0);
    results = readJSON(`mirroring_results_${userKey}`, []);

    animatedScore.set(score);

    requestAnimationFrame(() => {
      titleIn = true;
      setTimeout(() => { showDots = true; }, 50);
      setTimeout(() => { buttonsRise = true; }, 300);
      if (score > 0) setTimeout(() => { pulse = true; }, 700);
    });
  });

  function clearAndRestart() {
    const userKey = getUserKey();
    localStorage.removeItem(`mirroring_results_${userKey}`);
    localStorage.removeItem(`mirroring_score_${userKey}`);
    localStorage.removeItem(`mirroring_total_${userKey}`);
    goto('/mirroring/settings');
  }

  function buildSmsLink(text) {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encoded = encodeURIComponent(text);
    const base = isIOS ? 'sms:&body=' : 'sms:?body=';
    return `${base}${encoded}`;
  }

  async function shareResults() {
    const link = location.origin + '/mirroring/settings';
    const percent = total ? Math.round((score / total) * 100) : 0;
    const text =
`I just tried SocialQ's AboutFace – Mirroring Game and scored ${score}/${total} (${percent}%)!

It's a quick, camera-based practice that shows a facial expression and challenges you to mirror it as closely as possible. Great for building social-perception skills and body/face control in a fun, low-pressure way.

Give it a try and tell me how you do:
${link}

(Open the link, start a round, then text me your score so we can compare!)`;

    try {
      window.location.href = buildSmsLink(text);
      return;
    } catch {}
    try {
      if (navigator.share && (navigator.canShare?.({ text, url: link }) ?? true)) {
        await navigator.share({ title: 'AboutFace – Mirroring Game', text, url: link });
        return;
      }
    } catch {}
    const mailto = `mailto:?subject=${encodeURIComponent('My AboutFace – Mirroring score')}&body=${encodeURIComponent(text)}`;
    window.location.href = mailto;
  }
</script>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100%;
    padding: 24px;
    box-sizing: border-box;
  }

  .content {
    width: 100%;
    max-width: 620px;
    text-align: center;
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    min-height: 16px;
  }

  .progress-dot {
    flex: 1 1 auto;
    min-width: 12px;
    max-width: 42px;
    height: 8px;
    border-radius: 9999px;
    opacity: 0;
    transform: scale(0.82) translateY(4px);
  }
  .progress-bar.visible .progress-dot {
    animation: dashPop 0.4s ease-out forwards;
  }
  @keyframes dashPop {
    0% { opacity: 0; transform: scale(0.82) translateY(4px); }
    60% { opacity: 1; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }
  .correct { background: #22c55e; }
  .wrong   { background: #ef4444; }

  .score-wrap {
    padding-top: 16px;
  }

  .score-circle {
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.95);
    color: var(--af-dark-navy);
    font-size: 42px;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0 auto;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
    transition: transform 0.6s ease;
  }
  .score-circle.pulse {
    transform: scale(1.04);
  }

  .subtitle {
    font-size: 18px;
    font-weight: 500;
    color: #fff;
    margin-top: 12px;
    opacity: 0;
    animation: fadeIn 0.45s ease 0.1s forwards;
  }
  @keyframes fadeIn { to { opacity: 1; } }

  .buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    margin-top: 20px;
  }

  .btn-play {
    display: block;
    width: 100%;
    max-width: 300px;
    padding: 14px 24px;
    font-size: 18px;
    font-weight: 600;
    color: var(--af-dark-navy);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(15, 20, 46, 0.2);
    border-radius: 9999px;
    cursor: pointer;
    opacity: 0;
    transform: translateY(14px);
    transition: transform 0.08s ease, box-shadow 0.2s ease;
  }
  .btn-play.visible {
    opacity: 1;
    transform: translateY(0);
    animation: riseIn 0.5s ease 0.05s both;
  }
  .btn-play:hover { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
  .btn-play:active { transform: scale(0.985); }

  .btn-home {
    display: block;
    width: 100%;
    max-width: 300px;
    padding: 14px 24px;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    background: var(--af-glow-blue);
    border: 1px solid var(--af-glow-blue);
    border-radius: 9999px;
    cursor: pointer;
    opacity: 0;
    transform: translateY(18px);
    transition: transform 0.08s ease, filter 0.2s ease;
  }
  .btn-home.visible {
    opacity: 1;
    transform: translateY(0);
    animation: riseIn 0.5s ease 0.12s both;
  }
  .btn-home:hover { filter: brightness(1.05); }
  .btn-home:active { transform: scale(0.985); }

  @keyframes riseIn {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .btn-share {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 18px;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 9999px;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .btn-share:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.7);
  }
</style>

<div class="page-container">
  <div class="content">
    <div class="progress-bar" class:visible={showDots} aria-label="Round results">
      {#each results as res, i}
        <div
          class="progress-dot {res ? 'correct' : 'wrong'}"
          style="animation-delay: {i * 60}ms"
        ></div>
      {/each}
    </div>

    <div class="score-wrap">
      <div class="score-circle" class:pulse={pulse} aria-live="polite">
        {Math.round($animatedScore)}/{total}
      </div>
      <p class="subtitle" style="opacity: titleIn ? 1 : 0">Keep Practicing!</p>
    </div>

    <div class="buttons">
      <button class="btn-play" class:visible={buttonsRise} on:click={clearAndRestart}>
        Play Again
      </button>
      <button class="btn-home" class:visible={buttonsRise} on:click={() => goto('/dashboard')}>
        Home
      </button>
      <button class="btn-share" on:click={shareResults} aria-label="Share via Messages">
        <span>✉️</span>
        <span>Share</span>
      </button>
    </div>
  </div>
</div>
