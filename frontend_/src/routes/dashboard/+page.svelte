<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut, cubicInOut } from 'svelte/easing';

  let motionOK = true;

  // Which side panel is open
  let panel: null | 'train' | 'test' = null;

  // animate origin (from clicked button center)
  let fromX = 0;
  let fromY = 0;

  // reduce how far to the right the options travel
  const H_SHIFT_FACTOR = 0.6;

  // ---- Card tilt (parallax) ----
  let cardEl: HTMLElement | null = null;
  let raf = 0;
  const target = { rx: 0, ry: 0 };
  const current = { rx: 0, ry: 0 };

  function onMouseMove(ev: MouseEvent) {
    if (!motionOK || !cardEl) return;
    const r = cardEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;   // 0..1
    const py = (ev.clientY - r.top)  / r.height;  // 0..1
    const MAX = 4;                                // max tilt degrees
    target.ry = (px - 0.5) * 2 * MAX;             // rotateY follows X
    target.rx = -(py - 0.5) * 2 * MAX;            // rotateX follows Y
    startTiltLoop();
  }
  function onMouseLeave() {
    target.rx = 0; target.ry = 0;
    startTiltLoop();
  }
  function startTiltLoop() {
    if (raf) return;
    const step = () => {
      const k = 0.12;
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

  // quick flash when you click a main button
  let flash = false;
  function flashCard() {
    flash = true;
    setTimeout(() => (flash = false), 260);
  }

  function centerOf(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

  function openPanel(kind: 'train' | 'test', ev: MouseEvent) {
    const btn = ev.currentTarget as HTMLElement;
    const c = centerOf(btn);

    // right rail center
    const rightPx = clamp(Math.round(window.innerWidth * 0.06), 22, 80);
    const chipMin = 360;
    const railCx  = window.innerWidth - rightPx - chipMin / 2;
    const railCy  = window.innerHeight / 2 + (kind === 'train' ? -window.innerHeight * 0.10 : window.innerHeight * 0.10);

    fromX = (c.x - railCx) * H_SHIFT_FACTOR;
    fromY = c.y - railCy;

    flashCard();
    panel = kind;
  }
  const closePanel = () => (panel = null);

  onMount(() => {
    motionOK = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    const onEsc = (e: KeyboardEvent) => (e.key === 'Escape') && (panel = null);
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  });

  const nav = (p: string) => goto(p);

  const trainItems = [
    { label: 'Facial Recognition',           action: () => nav('/facial-recognition/settings') },
    { label: 'Emotion Training',             action: () => nav('/training/training-pick-emotion') },
    { label: 'Transition Recognition',       action: () => nav('/transition-recognition/settings') }
  ];
  const testItems = [
    { label: 'Timed Facial Recognition',     action: () => nav('/facial-recognition/settings?level=5') },
    { label: 'Mirroring Game',               action: () => nav('/mirroring/settings') },
    { label: 'Timed Transition Recognition', action: () => nav('/transition-recognition/settings?level=challenge') }
  ];
</script>

<style>
  @import '/static/style.css';

  :root{
    --brand:#4f46e5;
    --brand2:#22d3ee;
    --ink:#0f172a;
  }

  .stage{ position:relative; display:grid; place-items:center; min-height:100vh; width:100%; overflow:hidden; }

  /* Smaller card like before */
  .shell{
    width:min(92vw, 560px);
    background:
      linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border:1px solid rgba(255,255,255,.55);
    border-radius:24px;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    padding:28px 24px 26px;
    text-align:center;
    backdrop-filter: blur(22px) saturate(140%);
    transition: box-shadow .22s ease, filter .22s ease;
  }
  .shell.flash{
    box-shadow: 0 28px 78px rgba(79,70,229,.35);
    filter: brightness(1.02);
  }

  .title{
    font-family: Georgia, serif;
    font-size:clamp(2.6rem, 6.2vw, 4.8rem);
    margin:0 0 16px;
    color:#fff; -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 10px 14px rgba(0,0,0,.35);
  }
  .stack{ display:grid; gap:14px; padding:6px 10px 4px; }

  /* Shared gradient text (Train/Test and option labels) */
  .fxtext{
    font-family: ui-sans-serif, system-ui, -apple-system, "Inter", "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif;
    font-weight: 900;
    letter-spacing: .25px;
    text-transform: none;
    background: linear-gradient(90deg, #1d4ed8, #22d3ee);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }

  .big{
    display:block; width:min(520px, 88%); margin:0 auto;
    padding:18px 22px;
    border-radius:9999px; border:2px solid #111; background:#fff;
    cursor:pointer; transform: translateZ(0);
    transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .2s ease;
  }
  .big:hover{ transform: translateY(-1px) scale(1.012); box-shadow: 0 14px 32px rgba(79,70,229,.28); border-color: var(--brand); }
  .big:active{ transform: translateY(0) scale(.992); }

  /* SCRIM (dimmed less) */
  .scrim{
    position:fixed; inset:0;
    background:
      radial-gradient(70% 50% at 20% 10%, rgba(79,70,229,.14), transparent 60%),
      radial-gradient(60% 50% at 80% 30%, rgba(34,211,238,.12), transparent 60%),
      rgba(0,0,0,.22);
    z-index:20;
  }

  /* RAIL & CHIPS */
  .rail{
    position:fixed;
    top: calc(50% + var(--rail-offset, 0));
    right: clamp(22px, 6vw, 80px);
    transform: translateY(-50%);
    display:flex; flex-direction:column; gap:10px;
    z-index:25; pointer-events:none;
  }
  .chip{
    pointer-events:auto;
    display:flex; align-items:center; justify-content:center;
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    border:1px solid rgba(79,70,229,.16);
    border-radius:9999px;
    padding:12px 18px;
    min-width: 360px; max-width: 520px;
    box-shadow: 0 8px 20px rgba(79,70,229,.16), 0 2px 0 rgba(255,255,255,.85) inset;
    transform-origin:right center;
    transition:transform .16s ease, box-shadow .22s ease, filter .2s ease;
    backdrop-filter: blur(6px);
  }
  .chip:hover{ transform:translateX(-2px) scale(1.012); box-shadow:0 16px 36px rgba(79,70,229,.24); filter:brightness(1.02); }
  .chip:active{ transform:translateX(-1px) scale(1.004); }
  .chip::after{
    content:'›';
    margin-left:10px;
    font-weight:900;
    color:#64748b; opacity:.65; transform:translateY(1px);
  }
  .chip:hover::after{ color:#334155; opacity:.9; }

  @media (max-width: 880px){
    .rail{ right: 50%; transform: translate(50%, -50%); align-items: center; }
    .chip{ min-width: min(86vw, 440px); }
  }

  /* Floating Upload Button (on top of scrim & rail) */
  .fab{
    position: fixed;
    right: 22px;
    bottom: 22px;
    width: 62px;
    height: 62px;
    border-radius: 9999px;
    border: 0;
    color: #fff;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    box-shadow: 0 14px 30px rgba(79,70,229,.35);
    cursor: pointer;
    z-index: 30; /* above scrim(20) and rail(25) */
    display: grid;
    place-items: center;
    font-size: 26px;
    transition: transform .12s ease, box-shadow .2s ease, filter .2s ease;
    overflow: hidden;
  }
  .fab:hover { transform: translateY(-2px); filter: brightness(1.03); box-shadow: 0 18px 40px rgba(79,70,229,.45); }
  .fab:active { transform: translateY(0); }
  .fab .label { position: absolute; left: -9999px; }
</style>

<!-- background blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
  <div
    class="shell {flash ? 'flash' : ''}"
    bind:this={cardEl}
    on:mousemove={onMouseMove}
    on:mouseenter={onMouseMove}
    on:mouseleave={onMouseLeave}
    in:fly={{ y: 10, duration: motionOK ? 300 : 0, easing: cubicOut }}
    out:fade={{ duration: motionOK ? 140 : 0 }}
  >
    <h2 class="title">AboutFace</h2>
    <div class="stack">
      <button class="big" on:click={(e) => openPanel('train', e)} in:fade={{ duration: motionOK ? 240 : 0 }}>
        <span class="fxtext">Train</span>
      </button>
      <button class="big" on:click={(e) => openPanel('test', e)} in:fade={{ duration: motionOK ? 260 : 0 }}>
        <span class="fxtext">Test</span>
      </button>
    </div>
  </div>

  {#if panel}
    <div
      class="scrim"
      on:click={closePanel}
      in:fade={{ duration: motionOK ? 240 : 0, easing: cubicInOut }}
      out:fade={{ duration: motionOK ? 160 : 0, easing: cubicInOut }}
    ></div>

    <div
      class="rail"
      style={`--rail-offset: ${panel === 'train' ? '-10vh' : '10vh'}`}
      in:fly={{ x: fromX, y: fromY, duration: motionOK ? 420 : 0, easing: cubicOut }}
      out:fade={{ duration: motionOK ? 160 : 0, easing: cubicInOut }}
      aria-live="polite"
    >
      {#each (panel === 'train' ? trainItems : testItems) as it, i}
        <div
          class="chip"
          role="button"
          tabindex="0"
          on:click={() => it.action()}
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && it.action()}
          in:fly={{ x: fromX, y: fromY, duration: motionOK ? 420 : 0, delay: motionOK ? i * 80 + 60 : 0, easing: cubicOut }}
          out:fade={{ duration: motionOK ? 150 : 0, easing: cubicInOut }}
        >
          <span class="fxtext">{it.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Floating Upload FAB -->
<button
  class="fab"
  aria-label="Upload"
  title="Upload"
  on:click={() => goto('/upload')}
>
  📤
  <span class="label">Upload</span>
</button>
