<script>
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';

  const SEGMENTS = 8;

  let heroEl;
  let raf = 0;

  // --- tilt parallax ---------------------------------------------------------
  function onPointerMove(e) {
    if (!heroEl) return;
    const r = heroEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    const rx = (0.5 - y) * 8;
    const ry = (x - 0.5) * 10;
    const mx = Math.round(x * 100);
    const my = Math.round(y * 100);

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      heroEl.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      heroEl.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      heroEl.style.setProperty('--mx', mx + '%');
      heroEl.style.setProperty('--my', my + '%');
      heroEl.style.transform =
        `perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)) translateZ(0)`;
    });
  }
  function onPointerLeave() {
    if (!heroEl) return;
    heroEl.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
  }

  onMount(() => {
    heroEl?.addEventListener('pointermove', onPointerMove, { passive: true });
    heroEl?.addEventListener('pointerleave', onPointerLeave, { passive: true });
  });
  onDestroy(() => {
    heroEl?.removeEventListener('pointermove', onPointerMove);
    heroEl?.removeEventListener('pointerleave', onPointerLeave);
    cancelAnimationFrame(raf);
  });

  // --- click ripple ----------------------------------------------------------
  function ripple(e) {
    const btn = e.currentTarget;
    const span = document.createElement('span');
    span.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    span.style.width = span.style.height = d + 'px';
    span.style.left = (e.clientX - rect.left - d / 2) + 'px';
    span.style.top  = (e.clientY - rect.top  - d / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }

  // --- page wipe transition --------------------------------------------------
  let wiping = false;
  let wipeStyle = '';

  function startWithTransition(e) {
    // Respect reduced-motion users
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      goto('/login');
      return;
    }

    ripple(e);

    // compute where to center the wipe (button center)
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = ((rect.left + rect.width / 2) / window.innerWidth)  * 100;
    const cy = ((rect.top  + rect.height / 2) / window.innerHeight) * 100;

    wipeStyle = `--cx:${cx}%; --cy:${cy}%;`;
    wiping = true; // triggers CSS animations

    // navigate after the wipe covers screen
    setTimeout(() => goto('/login'), 620);
  }
</script>

<svelte:head>
  <title>SocialQ</title>
</svelte:head>

<style>
  @import '/static/style.css';

  :global(html, body){ margin:0; height:100%; }

  .stage{
    position:relative;
    min-height:100vh;
    display:grid;
    place-items:center;
    overflow:hidden;
  }

  .hero{
    --rx: 0deg; --ry: 0deg; --mx: 50%; --my: 50%;
    width:min(960px,92vw);
    padding:clamp(28px,6vw,60px);
    border-radius:28px;
    background:rgba(255,255,255,.55);
    backdrop-filter:blur(16px);
    box-shadow:0 20px 60px rgba(0,0,0,.18);
    text-align:center;
    transform:perspective(900px) rotateX(var(--rx)) rotateY(var(--ry));
    transition:transform .3s ease, opacity .3s ease;
    position:relative;
    will-change:transform, opacity;
  }
  .hero::after{
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background: radial-gradient(220px 160px at var(--mx) var(--my),
                rgba(255,255,255,.18), transparent 60%);
    transition:opacity .2s ease;
  }
  .hero.leaving{
    animation: hero-out .45s ease forwards;
  }
  @keyframes hero-out { to { opacity:0; transform: translateY(6px) scale(.96); } }

  .title{
    font-size: clamp(42px, 7vw, 92px);
    margin-bottom: 22px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  /* even breathing bars */
  .dash{
    display:flex; justify-content:center; align-items:center;
    gap: clamp(10px, 2.2vw, 18px);
    height: 14px;
    margin: 0 auto 18px;
    opacity:0; transform: translateY(-8px) scale(.98);
    animation: dash-in .45s ease-out .15s forwards;
  }
  @keyframes dash-in { to { opacity:1; transform: translateY(0) scale(1);} }

  .seg{
    width: clamp(42px, 7vw, 64px);
    height: 10px;
    border-radius: 9999px;
    background:#10b981;
    filter: drop-shadow(0 2px 0 rgba(0,0,0,.06));
    animation: seg-wave 1.2s ease-in-out calc(var(--i) * .08s) infinite;
  }
  @keyframes seg-wave{
    0%,100% { transform: translateY(0) scaleX(1); opacity:.85; }
    50%     { transform: translateY(-1px) scaleX(1.02); opacity:1; }
  }

  .subtitle{
    font-size:clamp(16px,2.2vw,22px);
    color:#374151;
    margin:0 0 28px;
    opacity:0; transform:translateY(18px);
    animation: popin .55s ease-out .32s forwards;
  }

  .cta{
    position:relative;
    display:inline-block;
    padding:14px 22px;
    border-radius:9999px;
    font-weight:900;
    font-size:clamp(14px,1.8vw,18px);
    background:#4f46e5; color:#fff; border:2px solid #4f46e5;
    cursor:pointer; box-shadow:0 10px 28px rgba(79,70,229,.35);
    transition:transform .06s ease, filter .2s ease, box-shadow .2s ease;
    opacity:0; transform:translateY(16px);
    animation: popin .5s ease-out .42s forwards, pulse 3.2s ease 1.2s infinite;
    overflow:hidden;
  }
  .cta:hover{ filter:brightness(1.05); box-shadow:0 12px 32px rgba(79,70,229,.45); }
  .cta:active{ transform:translateY(1px) scale(.995); }
  @keyframes popin{ to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes pulse{ 0%,100%{ transform: translateY(0) scale(1);} 50%{ transform: translateY(-1px) scale(1.02);} }

  .ripple{
    position:absolute; border-radius:50%; background:rgba(255,255,255,.6);
    transform:scale(0); animation:rip 600ms ease-out; pointer-events:none; mix-blend-mode: screen;
  }
  @keyframes rip{ to { transform:scale(2.6); opacity:0; } }

  /* Fullscreen wipe overlay */
  .wipe{
    position: fixed; inset: 0; z-index: 50; pointer-events:none;
    /* Use CSS vars set from click point */
    --cx: 50%; --cy: 50%;
    background:
      radial-gradient(120px 120px at var(--cx) var(--cy),
        #4f46e5 0 40%,
        #6d28d9 60%);
    clip-path: circle(0% at var(--cx) var(--cy));
    opacity: 1;
  }
  .wipe.show{
    animation: wipe-expand 2340ms cubic-bezier(.22,.61,.36,1) forwards;
  }
  @keyframes wipe-expand{
    to{ clip-path: circle(160% at var(--cx) var(--cy)); }
  }

  @media (prefers-reduced-motion: reduce){
    .hero{ transform:none !important; }
    .hero::after{ display:none; }
    .dash, .seg, .subtitle, .cta{ animation:none !important; opacity:1; transform:none; }
    .wipe{ display:none; }
  }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
  <!-- expanding overlay for the page transition -->
  <div class="wipe {wiping ? 'show' : ''}" style={wipeStyle} aria-hidden="true"></div>

  <div class="hero {wiping ? 'leaving' : ''}" bind:this={heroEl}>
    <h1 class="title">Welcome to SocialQ</h1>

    <div class="dash" aria-hidden="true">
      {#each Array(SEGMENTS) as _, i}
        <span class="seg" style="--i:{i}"></span>
      {/each}
    </div>

    <p class="subtitle">Learn, practice, and level up your social–emotional skills.</p>
    <button
      class="cta"
      on:click|preventDefault={startWithTransition}
      aria-label="Get started"
    >
      Get Started
    </button>
  </div>
</div>
