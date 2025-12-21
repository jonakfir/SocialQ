
<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { getUserKey } from '$lib/userKey';

  let score = 0;
  let total = 0;
  let results = [];

  const animatedScore = tweened(0, { duration: 600, easing: cubicOut });

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
    catch { return fallback; }
  }

  onMount(() => {
    document.title = 'Mirroring Result';
    
    const userKey = getUserKey();

    // Read ONLY the mirroring keys for this user
    score   = Number(localStorage.getItem(`mirroring_score_${userKey}`)  || 0);
    total   = Number(localStorage.getItem(`mirroring_total_${userKey}`)  || 0);
    results = readJSON(`mirroring_results_${userKey}`, []);

    animatedScore.set(score);
  });

  function clearAndRestart() {
    const userKey = getUserKey();
    
    // Remove only this user's data
    localStorage.removeItem(`mirroring_results_${userKey}`);
    localStorage.removeItem(`mirroring_score_${userKey}`);
    localStorage.removeItem(`mirroring_total_${userKey}`);
    goto('/mirroring/settings');
  }

  // ------- Share helpers (open Messages with prefilled body, no recipient) -------
  function buildSmsLink(text) {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encoded = encodeURIComponent(text);
    // iOS expects sms:&body= ; Android uses sms:?body=
    const base = isIOS ? 'sms:&body=' : 'sms:?body=';
    return `${base}${encoded}`;
  }

  async function shareResults() {
    const link = location.origin + '/mirroring/settings';
    const percent = total ? Math.round((score / total) * 100) : 0;

    const text =
`I just tried SocialQ’s AboutFace – Mirroring Game and scored ${score}/${total} (${percent}%)!

It’s a quick, camera-based practice that shows a facial expression and challenges you to mirror it as closely as possible. Great for building social-perception skills and body/face control in a fun, low-pressure way.

Give it a try and tell me how you do:
${link}

(Open the link, start a round, then text me your score so we can compare!)`;

    // 1) Prefer opening Messages/SMS with prefilled body (no recipient).
    try {
      window.location.href = buildSmsLink(text);
      return;
    } catch {}

    // 2) Fallback: native share sheet if available.
    try {
      if (navigator.share && (navigator.canShare?.({ text, url: link }) ?? true)) {
        await navigator.share({ title: 'AboutFace – Mirroring Game', text, url: link });
        return;
      }
    } catch {}

    // 3) Final fallback: email draft with body prefilled.
    const mailto = `mailto:?subject=${encodeURIComponent('My AboutFace – Mirroring score')}&body=${encodeURIComponent(text)}`;
    window.location.href = mailto;
  }
</script>

<style>
  @import '/static/style.css';

  .page-container {
    display:flex; justify-content:center; align-items:center;
    min-height:100vh; position:relative;
    padding:24px;
  }

  .result-box {
    width:min(640px,94vw);
    background:
      linear-gradient(180deg, rgba(255,255,255,.80), rgba(255,255,255,.72)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.10), transparent 60%);
    border:1px solid rgba(255,255,255,.6);
    border-radius:20px;
    text-align:center;
    box-shadow:0 18px 48px rgba(0,0,0,.25);
    padding:40px 28px 28px;
    position:relative;
  }

  .title {
    font-family: Georgia, serif; font-size: clamp(2rem, 4.5vw, 2.7rem); margin: 0 0 10px;
    color: white; -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 3px 8px rgba(0,0,0,0.35);
    animation: slideIn .45s ease both;
  }
  @keyframes slideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

  .progress-bar { display:flex; justify-content:center; gap:8px; margin-bottom:25px; flex-wrap:wrap; }
  .progress-dot {
    width:45px; height:10px; border-radius:5px;
    opacity:0; transform:scale(.8) translateY(4px);
    animation: pop .35s ease-out forwards;
  }
  @keyframes pop { 0%{opacity:0; transform:scale(.8) translateY(4px);} 60%{opacity:1; transform:scale(1.08)} 100%{opacity:1; transform:scale(1);} }
  .correct { background:#22c55e; }
  .wrong   { background:#ef4444; }

  .score-circle {
    width:210px; height:210px; border-radius:50%;
    background:#4f46e5; color:#fff; font-size:44px; font-weight:800;
    display:flex; justify-content:center; align-items:center; margin:26px auto 18px;
    box-shadow:0 16px 38px rgba(79,70,229,.35);
    animation: pulseOnce .7s ease .62s 1 both;
  }
  @keyframes pulseOnce { 0%{transform:scale(1)} 50%{transform:scale(1.04)} 100%{transform:scale(1)} }

  .btn {
    display:block; width:80%; max-width:300px; padding:15px; margin:12px auto 0;
    font-size:18px; font-weight:800; color:#000; background:#fff;
    border:2px solid #000; border-radius:40px; cursor:pointer; text-align:center;
    transition: transform .08s ease, background .3s ease, color .3s ease;
  }
  .btn:hover { background:#4f46e5; color:#fff; transform: translateY(-1px); }

  .fab-share{
    position:fixed; right:18px; bottom:18px; z-index:1000;
    display:inline-flex; align-items:center; gap:8px;
    padding:10px 14px; border-radius:9999px;
    background:linear-gradient(135deg, rgba(255,255,255,.96), #f5f3ff);
    border:1px solid rgba(79,70,229,.35);
    color:#111; font-weight:800; cursor:pointer;
    box-shadow:0 8px 22px rgba(79,70,229,.22);
    transition:transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .fab-share:hover{ filter:brightness(1.02); box-shadow:0 12px 28px rgba(79,70,229,.28); transform:translateY(-1px); }
  .fab-share:active{ transform:translateY(0); }
  .icon{ font-size:18px; line-height:1; }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page-container">
  <div class="result-box">
    <h2 class="title">Great Job!</h2>

    <div class="progress-bar" aria-label="Round results">
      {#each results as res, i}
        <div class="progress-dot {res ? 'correct' : 'wrong'}" style="animation-delay:{i * 60}ms"></div>
      {/each}
    </div>

    <div class="score-circle" aria-live="polite">
      {Math.round($animatedScore)}/{total}
    </div>

    <button class="btn" on:click={clearAndRestart}>Play Again</button>
    <button class="btn" on:click={() => goto('/dashboard')}>Exit</button>
  </div>
</div>

<button class="fab-share" on:click={shareResults} aria-label="Share via Messages">
  <span class="icon">✉️</span>
  <span>Share</span>
</button>
