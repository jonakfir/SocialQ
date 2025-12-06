<script lang="ts" context="module">
  export const ssr = false;
  export const csr = true;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { getUserKey } from '$lib/userKey';

  let score = 0;
  let total = 0;
  let bands: Array<'good' | 'bad'> = [];
  const animatedScore = tweened(0, { duration: 600, easing: cubicOut });

  onMount(() => {
    document.title = 'Recognition Results – AboutFace';
    
    const userKey = getUserKey();

    // Read from user-specific keys only
    score = Number(localStorage.getItem(`fr_quiz_score_${userKey}`) ?? 0);
    total = Number(localStorage.getItem(`fr_quiz_total_${userKey}`) ?? 0);

    let raw: any[] = [];
    try {
      raw = JSON.parse(localStorage.getItem(`fr_quiz_results_${userKey}`) ?? '[]');
      if (!Array.isArray(raw)) raw = [];
    } catch { raw = []; }

    bands = raw.map((v) =>
      Array.isArray(v) ? ((v[0] && v[1]) ? 'good' : 'bad') : (v ? 'good' : 'bad')
    );

    animatedScore.set(score);
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

  function buildSmsLink(text: string) {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
    const encoded = encodeURIComponent(text);
    const base = isIOS ? 'sms:&body=' : isAndroid ? 'sms:?body=' : 'sms:?body=';
    return `${base}${encoded}`;
  }

  async function shareResults() {
    const link = location.origin + '/facial-recognition/settings';
    const percent = total ? Math.round((score / total) * 100) : 0;

    const text =
`Look at my score on this quiz from SocialQ’s AboutFace — I got ${score}/${total} (${percent}%) on the Recognition Quiz!

AboutFace uses short webcam clips to practice reading facial expressions:
• Angry • Disgust • Fear • Happy • Sad • Surprise

It’s simple, quick, and a fun way to build social-perception skills. Try the same quiz and compare with me:
${link}

(Just open the link, start the quiz, and send me your score!)`;

    // 1) Prefer opening Messages with the body prefilled (no recipient)
    const smsUrl = buildSmsLink(text);
    try {
      window.location.href = smsUrl;
      return;
    } catch {}

    // 2) Fallback: native share sheet
    try {
      // @ts-ignore
      if (navigator.share && (navigator.canShare?.({ text, url: link }) ?? true)) {
        await navigator.share({ title: 'AboutFace – Recognition Quiz', text, url: link });
        return;
      }
    } catch {}

    // 3) Final fallback: email draft
    const mailto = `mailto:?subject=${encodeURIComponent('My AboutFace score')}&body=${encodeURIComponent(text)}`;
    window.location.href = mailto;
  }
</script>

<style>
  @import '/static/style.css';

  .page-container{
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    position:relative;
    padding:24px;
  }

  .result-box{
    width:min(640px,94vw);
    background:
      linear-gradient(180deg, rgba(255,255,255,.80), rgba(255,255,255,.72)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.10), transparent 60%);
    border:1px solid rgba(255,255,255,.6);
    border-radius:20px;
    box-shadow:0 18px 48px rgba(0,0,0,.25);
    padding:34px 28px 26px;
    text-align:center;
  }

  .title{
    font-family:Georgia, serif;
    font-size:clamp(2rem, 4.5vw, 2.7rem);
    margin:0 0 10px;
    color:#fff;
    -webkit-text-stroke:2px rgba(0,0,0,.5);
    text-shadow:0 3px 8px rgba(0,0,0,.35);
  }

  .progress-bar{
    display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:8px 0 22px;
  }
  .progress-dot{
    width:45px; height:10px; border-radius:5px;
    opacity:0; transform:scale(.8) translateY(4px);
    animation:pop .35s ease-out forwards;
  }
  @keyframes pop{
    0%{opacity:0; transform:scale(.8) translateY(4px);}
    60%{opacity:1; transform:scale(1.08) translateY(0);}
    100%{opacity:1; transform:scale(1);}
  }
  .good{ background:#22c55e; }
  .bad{ background:#ef4444; }

  .score-circle{
    width:210px; height:210px; border-radius:50%;
    margin:26px auto 18px;
    display:flex; align-items:center; justify-content:center;
    color:#fff; background:#4f46e5; font-size:44px; font-weight:800;
    box-shadow:0 16px 38px rgba(79,70,229,.35);
    animation:pulseOnce .7s ease .62s 1 both;
  }
  @keyframes pulseOnce{
    0%{transform:scale(1);} 50%{transform:scale(1.04);} 100%{transform:scale(1);}
  }

  .btn{
    display:block; width:80%; max-width:300px; margin:10px auto 0;
    padding:15px; border-radius:40px; border:2px solid #111;
    background:#fff; color:#111; font-weight:800; font-size:18px;
    cursor:pointer; text-align:center;
    transition:transform .08s ease, background .2s ease, color .2s ease;
  }
  .btn:hover{ background:#4f46e5; color:#fff; transform:translateY(-1px); }

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

<!-- Background blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page-container">
  <div class="result-box">
    <h2 class="title">Great Job!</h2>

    <div class="progress-bar" aria-label="Question results">
      {#each bands as band, i}
        <div class="progress-dot {band}" style="animation-delay:{i * 60}ms"></div>
      {/each}
    </div>

    <div class="score-circle" aria-live="polite">
      {Math.round($animatedScore)}/{total}
    </div>

    <button class="btn" on:click={playAgain}>Play Again</button>
    <button class="btn" on:click={() => goto('/facial-recognition/results/stats')}>See Stats</button>
    <button class="btn" on:click={() => goto('/dashboard')}>Back to Dashboard</button>
  </div>
</div>

<button class="fab-share" on:click={shareResults} aria-label="Share via Messages">
  <span class="icon">✉️</span>
  <span>Share</span>
</button>
