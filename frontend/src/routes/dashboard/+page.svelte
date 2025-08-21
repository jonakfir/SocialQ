<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';

  let ready = false;               // brief skeleton shimmer
  let motionOK = true;             // motion-safety
  let finePointer = true;          // disable tilt on touch

  let usernameInitial = '';

  onMount(() => {
    motionOK   = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    finePointer = matchMedia('(pointer: fine)').matches;

    const storedUser = localStorage.getItem('username');
    if (storedUser) usernameInitial = storedUser[0]?.toUpperCase?.() || '';

    const t = setTimeout(() => (ready = true), 200);
    return () => clearTimeout(t);
  });

  const items = [
    { label: 'Mirroring Game', path: '/mirroring/settings' },
    { label: 'Recognition Quiz', path: '/facial-recognition/settings' },
    { label: 'Transition Recognition', path: '/transition-recognition/settings' },
    { label: 'Training', path: '/training/training-pick-emotion' }
  ];

  function tcfg(i: number) {
    return { y: 14, duration: motionOK ? 360 : 0, delay: motionOK ? i * 80 : 0 };
  }

  function gotoWithRipple(e: MouseEvent, path: string) {
    makeRipple(e);
    setTimeout(() => goto(path), motionOK ? 90 : 0);
  }

  // --- Ripple effect ---
  function makeRipple(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    if (!btn) return;
    btn.style.position ||= 'relative';
    btn.style.overflow = 'hidden';
    btn.querySelector('.ripple-circle')?.remove();

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple-circle';
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${(e.clientX ?? 0) - rect.left - size / 2}px`;
    span.style.top  = `${(e.clientY ?? 0) - rect.top  - size / 2}px`;
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }

  // --- Tilt on mouse over the card ---
  let cardEl: HTMLElement | null = null;
  let raf = 0;
  const target = { rx: 0, ry: 0 };
  const current = { rx: 0, ry: 0 };

  function onMouseMove(ev: MouseEvent) {
    if (!motionOK || !finePointer || !cardEl) return;
    const r = cardEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;   // 0..1
    const py = (ev.clientY - r.top)  / r.height;  // 0..1
    const MAX = 4;                                // max degrees

    // rotateY follows x, rotateX follows y (invert X so “top” leans back)
    target.ry = (px - 0.5) * 2 * MAX;
    target.rx = -(py - 0.5) * 2 * MAX;

    startTiltLoop();
  }
  function onMouseLeave() {
    target.rx = 0; target.ry = 0;
    startTiltLoop();
  }

  function startTiltLoop() {
    if (raf) return;
    const step = () => {
      const k = 0.12; // smoothing
      current.rx += (target.rx - current.rx) * k;
      current.ry += (target.ry - current.ry) * k;
      if (cardEl) {
        cardEl.style.transform =
          `perspective(900px) rotateX(${current.rx}deg) rotateY(${current.ry}deg) translateZ(0)`;
      }
      const done = Math.abs(current.rx - target.rx) < 0.05 && Math.abs(current.ry - target.ry) < 0.05;
      if (!done) raf = requestAnimationFrame(step);
      else { raf = 0; }
    };
    raf = requestAnimationFrame(step);
  }

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (cardEl) cardEl.style.transform = '';
  });
</script>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family: 'Arial', sans-serif;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    position: relative;
  }

  .container {
    display: grid;
    place-items: center;
    height: 100vh;
    width: 100vw;
    position: relative;
    z-index: 2;
    padding: 20px;
    perspective: 900px;             /* helps the 3D feel */
  }

  .dashboard-box {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(30px) saturate(150%);
    -webkit-backdrop-filter: blur(30px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
    padding: 24px;
    border-radius: 24px;
    width: min(92vw, 520px);
    text-align: center;
    z-index: 3;
    will-change: transform;          /* perf hint */
    transform-style: preserve-3d;
    transition: box-shadow 180ms ease;
  }
  /* subtle shadow deepen when tilting (uses hover as a proxy) */
  .dashboard-box:hover {
    box-shadow: 0 24px 60px rgba(0,0,0,.28);
  }

  h2 {
    font-size: clamp(2.4rem, 6vw, 3.6rem);
    margin: 8px 0 22px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.35);
  }

  .stack {
    display: grid;
    gap: 14px;
    padding: 6px 10px 4px;
  }

  /* Buttons */
  .btn {
    display: block;
    width: min(320px, 92%);
    margin: 0 auto;
    padding: 15px 18px;
    font-size: 18px;
    font-weight: 800;
    color: #111;
    background: #fff;
    border: 2px solid #111;
    border-radius: 40px;
    text-align: center;
    cursor: pointer;
    transition: transform .12s ease, box-shadow .18s ease, background .18s ease, color .18s ease;
    will-change: transform, box-shadow;
  }
  .btn:hover {
    background: #4f46e5;
    color: #fff;
    box-shadow: 0 12px 24px rgba(79,70,229,.28);
    transform: translateY(-2px) scale(1.02);
  }
  .btn:active { transform: translateY(0); }

  /* Ripple circle */
  .ripple-circle {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    transform: scale(0);
    opacity: 0.45;
    background: currentColor;
    mix-blend-mode: multiply;
    animation: ripple 480ms ease-out forwards;
  }
  @keyframes ripple {
    to { transform: scale(2.8); opacity: 0; }
  }

  /* Skeleton shimmer */
  .skeleton {
    display: block;
    width: min(320px, 92%);
    height: 50px;
    margin: 0 auto;
    border-radius: 40px;
    background: linear-gradient(90deg,
      rgba(255,255,255,0.25) 0%,
      rgba(255,255,255,0.55) 50%,
      rgba(255,255,255,0.25) 100%);
    background-size: 200% 100%;
    animation: shimmer 900ms linear infinite;
    border: 2px solid rgba(17,17,17,0.25);
  }
  .skeleton + .skeleton { margin-top: 14px; }
  @keyframes shimmer {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }
</style>

<!-- background blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="container">
  <div
    class="dashboard-box"
    bind:this={cardEl}
    on:mousemove={onMouseMove}
    on:mouseenter={onMouseMove}
    on:mouseleave={onMouseLeave}
  >
    <h2>SocialQ</h2>

    {#if !ready}
      <div class="stack">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
    {:else}
      <div class="stack">
        {#each items as it, i}
          <button
            class="btn"
            on:click={(e) => gotoWithRipple(e, it.path)}
            in:fade={{ duration: motionOK ? 220 : 0, delay: motionOK ? i * 70 : 0 }}
          >
            {it.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
