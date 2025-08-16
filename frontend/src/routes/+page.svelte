<script>
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';

  const start = () => goto('/login');

  let heroEl;
  let raf = 0;

  function onPointerMove(e) {
    if (!heroEl) return;
    const r = heroEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0..1
    const y = (e.clientY - r.top)  / r.height;  // 0..1
    const rx = (0.5 - y) * 8;   // rotateX
    const ry = (x - 0.5) * 10;  // rotateY
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
    heroEl?.addEventListener?.('pointermove', onPointerMove, { passive: true });
    heroEl?.addEventListener?.('pointerleave', onPointerLeave, { passive: true });
  });
  onDestroy(() => {
    heroEl?.removeEventListener?.('pointermove', onPointerMove);
    heroEl?.removeEventListener?.('pointerleave', onPointerLeave);
    cancelAnimationFrame(raf);
  });

  // click ripple
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
    transition:transform .3s ease;
    position:relative;
    will-change:transform;
  }

  /* soft glare that follows the pointer */
  .hero::after{
    content:"";
    position:absolute; inset:0;
    border-radius:inherit;
    pointer-events:none;
    background:
      radial-gradient(220px 160px at var(--mx) var(--my),
        rgba(255,255,255,.18), transparent 60%);
    transition:opacity .2s ease;
  }

  .title{
    font-size: clamp(42px, 7vw, 92px);
    margin-bottom: 26px;
    font-family: 'Georgia', serif;
    color: transparent;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.35);
    background-image:
      linear-gradient(90deg,#fff 0%,#fff 40%,#dbeafe 50%,#fff 60%,#fff 100%);
    background-size: 220% 100%;
    -webkit-background-clip: text;
            background-clip: text;
    animation: sheen 2.2s ease-out .25s both;
  }
  @keyframes sheen{
    0%   { background-position: 120% 0; opacity:.0; transform: translateY(10px) scale(.985); }
    30%  { opacity:1; }
    100% { background-position: 0% 0; opacity:1; transform: translateY(0) scale(1); }
  }

  .dash{
    width:min(560px,70vw);
    height:10px;
    margin:0 auto 22px;
    border-radius:9999px;
    background:
      repeating-linear-gradient(90deg,#10b981 0 48px,transparent 48px 76px);
    mask:linear-gradient(90deg,transparent 0,#000 12%,#000 88%,transparent 100%);
    opacity:0;
    transform:translateY(-8px) scaleX(.9);
    animation: draw .9s ease-out .35s forwards, march 1.4s linear .8s infinite;
  }
  @keyframes draw{
    to { opacity:1; transform:translateY(0) scaleX(1); }
  }
  @keyframes march{
    to { background-position: 120px 0; }
  }

  .subtitle{
    font-size:clamp(16px,2.2vw,22px);
    color:#374151;
    margin:0 0 28px;
    opacity:0;
    transform:translateY(18px);
    animation: popin .55s ease-out .45s forwards;
  }

  .cta{
    position:relative;
    display:inline-block;
    padding:14px 22px;
    border-radius:9999px;
    font-weight:900;
    font-size:clamp(14px,1.8vw,18px);
    background:#4f46e5;
    color:#fff;
    border:2px solid #4f46e5;
    cursor:pointer;
    box-shadow:0 10px 28px rgba(79,70,229,.35);
    transition:transform .06s ease, filter .2s ease, box-shadow .2s ease;
    opacity:0;
    transform:translateY(16px);
    animation: popin .5s ease-out .55s forwards, pulse 3.2s ease 1.4s infinite;
    overflow:hidden; /* for ripple */
  }
  .cta:hover{ filter:brightness(1.05); box-shadow:0 12px 32px rgba(79,70,229,.45); }
  .cta:active{ transform:translateY(1px) scale(.995); }

  /* Ripple */
  .ripple{
    position:absolute;
    border-radius:50%;
    background:rgba(255,255,255,.6);
    transform:scale(0);
    animation:rip 600ms ease-out;
    pointer-events:none;
    mix-blend-mode: screen;
  }
  @keyframes rip{
    to { transform:scale(2.6); opacity:0; }
  }

  @keyframes popin{
    to { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes pulse{
    0%,100% { transform: translateY(0) scale(1); }
    50%     { transform: translateY(-1px) scale(1.02); }
  }

  @media (prefers-reduced-motion: reduce){
    .hero{ transform:none !important; }
    .hero::after{ display:none; }
    .title,.dash,.subtitle,.cta{ animation:none !important; opacity:1; transform:none; }
  }
</style>

<!-- Optional blob background -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
  <div class="hero" bind:this={heroEl}>
    <h1 class="title">Welcome to SocialQ</h1>
    <div class="dash"></div>
    <p class="subtitle">Learn, practice, and level up your social–emotional skills.</p>
    <button class="cta" on:click|preventDefault={(e) => { ripple(e); start(); }}>
      Get Started
    </button>
  </div>
</div>
