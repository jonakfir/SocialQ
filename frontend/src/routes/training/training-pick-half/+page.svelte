<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  let emotion = '';

  onMount(() => {
    // restore emotion from previous page
    emotion = localStorage.getItem('train_emotion') || '';
  });

  function pickHalf(half: 'top' | 'bottom', e?: MouseEvent) {
    if (!emotion) {
      goto('/training-pick-emotion');
      return;
    }
    if (e) ripple(e);
    localStorage.setItem('train_half', half);
    // Navigate to the specific training page directory you already created:
    // e.g. /training/Angry-top
    goto(`/training/${emotion}-${half}`);
  }

  function ripple(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el) return;
    el.style.position ||= 'relative';
    el.style.overflow = 'hidden';
    el.querySelector('.ripple')?.remove();
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = `${d}px`;
    s.style.left = `${(e.clientX ?? 0) - r.left - d/2}px`;
    s.style.top  = `${(e.clientY ?? 0) - r.top  - d/2}px`;
    el.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once:true });
  }
</script>

<svelte:head>
  <title>Choose Half • Training</title>
</svelte:head>

<style>
  @import '/static/style.css';

  .page { min-height:100vh; display:grid; place-items:center; position:relative; }
  .box{
    width:min(720px,92vw);
    background:rgba(255,255,255,.58);
    backdrop-filter:blur(18px);
    border-radius:24px;
    box-shadow:0 18px 48px rgba(0,0,0,.22);
    padding:clamp(22px,5vw,40px);
    text-align:center;
  }

  h1{
    font-family:'Georgia', serif;
    font-size:clamp(2rem, 5vw, 3rem);
    margin:0 0 8px;
    color:#fff;
    -webkit-text-stroke:2px rgba(0,0,0,.45);
    text-shadow:0 3px 8px rgba(0,0,0,.35);
  }
  .sub{ color:#374151; margin-bottom:18px; }

  .row{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:14px;
    margin-top:10px;
  }

  .btn{
    display:block;
    width:100%;
    padding:16px;
    border-radius:9999px;
    font-weight:900;
    font-size:18px;
    background:#fff;
    color:#111;
    border:2px solid #111;
    cursor:pointer;
    transition: transform .10s ease, box-shadow .2s ease, background .2s ease, color .2s ease;
    opacity:0; transform: translateY(10px) scale(.96);
    animation: pop .38s ease forwards;
  }
  .btn:hover{
    background:#4f46e5; color:#fff;
    box-shadow:0 12px 26px rgba(79,70,229,.28);
    transform: translateY(-2px) scale(1.02);
  }
  .btn:active{ transform: translateY(0) scale(1.00); }
  .btn.bottom{ animation-delay: 80ms; }

  @keyframes pop{
    0%{ opacity:0; transform: translateY(10px) scale(.96); }
    100%{ opacity:1; transform: translateY(0) scale(1); }
  }

  .back{
    margin-top:16px;
    background:transparent;
    border:none;
    color:#4f46e5;
    font-weight:800;
    cursor:pointer;
    text-decoration:underline;
  }

  .ripple{
    position:absolute;
    border-radius:50%;
    background: currentColor;
    opacity:.35;
    transform:scale(0);
    animation:rip .48s ease-out forwards;
    pointer-events:none;
    mix-blend-mode:multiply;
  }
  @keyframes rip{ to{ transform:scale(2.6); opacity:0; } }
</style>

<!-- Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="page">
  <div class="box" in:fade={{ duration: 220 }}>
    <h1>{emotion ? `Practice: ${emotion}` : 'Choose Half'}</h1>
    <p class="sub">Pick the face half you want to train.</p>

    <div class="row">
      <button class="btn" on:click={(e) => pickHalf('top', e)}>Top Half</button>
      <button class="btn bottom" on:click={(e) => pickHalf('bottom', e)}>Bottom Half</button>
    </div>

    <button class="back" on:click={() => goto('/training-pick-emotion')}>Change Emotion</button>
  </div>
</div>
