<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isViewingAsPersonal, clearViewAs } from '$lib/viewAs';
  import { apiFetch } from '$lib/api';

  let userRole: string | null = null;
  $: viewAsPersonal = isViewingAsPersonal();

  // Check if user is admin
  async function checkUserRole() {
    try {
      // Try to get role from /auth/me first (backend PostgreSQL)
      const res = await apiFetch('/auth/me');
      const data = await res.json();
      if (data?.ok && data?.user) {
        const email = (data.user.email || data.user.username || '').toLowerCase();
        // Hardcode: jonakfir@gmail.com is always admin
        if (email === 'jonakfir@gmail.com') {
          userRole = 'admin';
          return;
        }
        userRole = data.user.role || 'personal';
      } else {
        // Fallback to /api/user/role
        const res2 = await apiFetch('/api/user/role');
        const data2 = await res2.json();
        if (data2?.ok && data2?.role) {
          userRole = data2.role;
        }
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  }

  $: isAdmin = userRole === 'admin';

  // Which side panel is open
  let panel: null | 'train' | 'test' = null;

  function openPanel(kind: 'train' | 'test') {
    panel = kind;
  }
  const closePanel = () => (panel = null);

  onMount(() => {
    const onEsc = (e: KeyboardEvent) => (e.key === 'Escape') && (panel = null);
    window.addEventListener('keydown', onEsc);
    checkUserRole();
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

  function exitPersonal() {
    clearViewAs();
    goto('/admin');
  }
</script>

<style>
  :root{
    --brand:#4f46e5;
    --brand2:#22d3ee;
    --ink:#0f172a;
  }

  .stage{ position:relative; display:grid; place-items:center; min-height:100vh; width:100%; overflow:hidden; }

  /* Larger card for glimmer effect */
  .shell{
    width:min(92vw, 720px);
    background:
      linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border:1px solid rgba(255,255,255,.55);
    border-radius:24px;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    padding:40px 32px 36px;
    text-align:center;
    backdrop-filter: blur(22px) saturate(140%);
    transition: box-shadow .22s ease, filter .22s ease;
  }

  .title{
    font-family: Georgia, serif;
    font-size:clamp(3.2rem, 7.5vw, 6.2rem);
    margin:0 0 24px;
    color:#fff; -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 10px 14px rgba(0,0,0,.35);
  }
  .stack{ display:grid; gap:18px; padding:8px 12px 6px; }

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
    display:block; width:min(680px, 90%); margin:0 auto;
    padding:24px 28px;
    border-radius:9999px; border:2px solid #111; background:#fff;
    cursor:pointer; transform: translateZ(0);
    transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .2s ease;
    font-size: 1.15em;
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

  /* Floating Action Buttons */
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

  /* Friends Plus Icon Button (top right) */
  .friends-btn{
    position: fixed;
    top: 22px;
    right: 22px;
    width: 50px;
    height: 50px;
    border-radius: 9999px;
    border: 0;
    color: #fff;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    box-shadow: 0 8px 20px rgba(79,70,229,.3);
    cursor: pointer;
    z-index: 1001; /* above header(1000), scrim(20) and rail(25) */
    display: grid;
    place-items: center;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
    transition: transform .12s ease, box-shadow .2s ease, filter .2s ease;
    overflow: hidden;
    pointer-events: auto;
  }
  .friends-btn:hover { transform: translateY(-2px) scale(1.05); filter: brightness(1.03); box-shadow: 0 12px 28px rgba(79,70,229,.4); }
  .friends-btn:active { transform: translateY(0) scale(1); }
  .friends-btn .label { position: absolute; left: -9999px; }

  .journey-btn{
    position: fixed;
    top: 80px;
    left: 22px;
    width: 50px;
    height: 50px;
    border-radius: 9999px;
    border: 0;
    color: #fff;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    box-shadow: 0 8px 20px rgba(79,70,229,.3);
    cursor: pointer;
    z-index: 1001;
    display: grid;
    place-items: center;
    font-size: 24px;
    font-weight: 900;
    line-height: 1;
    transition: transform .12s ease, box-shadow .2s ease, filter .2s ease;
    overflow: hidden;
    pointer-events: auto;
  }
  .journey-btn:hover { transform: translateY(-2px) scale(1.05); filter: brightness(1.03); box-shadow: 0 12px 28px rgba(79,70,229,.4); }
  .journey-btn:active { transform: translateY(0) scale(1); }
  .journey-btn .label { position: absolute; left: -9999px; }

  .pricing-btn{
    position: fixed;
    top: 22px;
    left: 50%;
    transform: translateX(-50%);
    width: 50px;
    height: 50px;
    border-radius: 9999px;
    border: 0;
    color: #fff;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    box-shadow: 0 8px 20px rgba(79,70,229,.3);
    cursor: pointer;
    z-index: 1001;
    display: grid;
    place-items: center;
    font-size: 24px;
    font-weight: 900;
    line-height: 1;
    transition: transform .12s ease, box-shadow .2s ease, filter .2s ease;
    overflow: hidden;
    pointer-events: auto;
  }
  .pricing-btn:hover { transform: translateX(-50%) translateY(-2px) scale(1.05); filter: brightness(1.03); box-shadow: 0 12px 28px rgba(79,70,229,.4); }
  .pricing-btn:active { transform: translateX(-50%) translateY(0) scale(1); }
  .pricing-btn .label { position: absolute; left: -9999px; }

  .exit-admin-btn{
    position: fixed;
    left: 22px;
    bottom: 22px;
    padding: 10px 14px;
    border-radius: 9999px;
    border: 0;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    font-weight: 800;
    box-shadow: 0 10px 24px rgba(0,0,0,.18);
    cursor: pointer;
    z-index: 31;
    pointer-events: auto;
  }
  .exit-admin-btn:hover{ filter: brightness(1.05); transform: translateY(-1px); }

  /* Dark mode: card, buttons and chips use theme so labels stay visible */
  :global(html.dark) .shell {
    background: var(--bg-card, rgba(30, 41, 59, 0.9));
    border-color: var(--border-color, rgba(255,255,255,.2));
    box-shadow: 0 24px 68px var(--shadow, rgba(0,0,0,.5));
  }
  :global(html.dark) .title {
    color: var(--text-primary, #f1f5f9);
    -webkit-text-stroke: 1px var(--border-color, rgba(255,255,255,.2));
    text-shadow: 0 4px 12px var(--shadow, rgba(0,0,0,.4));
  }
  :global(html.dark) .big {
    background: var(--bg-card-hover, rgba(30, 41, 59, 0.95));
    border-color: var(--border-color, rgba(255,255,255,.25));
  }
  :global(html.dark) .big .fxtext {
    background: linear-gradient(90deg, #a5b4fc, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  :global(html.dark) .chip {
    background: var(--bg-card-hover, rgba(30, 41, 59, 0.95));
    border-color: var(--border-color, rgba(255,255,255,.2));
    box-shadow: 0 8px 20px var(--shadow, rgba(0,0,0,.4));
  }
  :global(html.dark) .chip .fxtext {
    background: linear-gradient(90deg, #a5b4fc, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  :global(html.dark) .chip::after {
    color: var(--text-secondary, #94a3b8);
  }
  :global(html.dark) .fab,
  :global(html.dark) .friends-btn {
    color: #fff;
    pointer-events: auto;
  }
</style>

<!-- background blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
  <div class="shell">
    <h2 class="title">AboutFace</h2>
    <div class="stack">
      <button class="big" on:click={() => openPanel('train')}>
        <span class="fxtext">Train</span>
      </button>
      <button class="big" on:click={() => openPanel('test')}>
        <span class="fxtext">Test</span>
      </button>
    </div>
  </div>

  {#if panel}
    <div class="scrim" on:click={closePanel}></div>

    <div
      class="rail"
      style={`--rail-offset: ${panel === 'train' ? '-10vh' : '10vh'}`}
      aria-live="polite"
    >
      {#each (panel === 'train' ? trainItems : testItems) as it}
        <div
          class="chip"
          role="button"
          tabindex="0"
          on:click={() => it.action()}
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && it.action()}
        >
          <span class="fxtext">{it.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Friends Plus Icon (top right) -->
<button
  class="friends-btn"
  aria-label="Friends"
  title="Friends"
  on:click={() => goto('/friends')}
>
  +
  <span class="label">Friends</span>
</button>

<!-- Journey Button (top left, below profile) -->
<button
  class="journey-btn"
  aria-label="Journey"
  title="Your Journey"
  on:click={() => goto('/journey')}
>
  🧩
  <span class="label">Journey</span>
</button>

<!-- Pricing Button (top center) - not ready for main yet -->
<!--
<button
  class="pricing-btn"
  aria-label="Pricing"
  title="Membership"
  on:click={() => goto('/pricing')}
>
  💎
  <span class="label">Pricing</span>
</button>
-->

<!-- Floating Upload FAB (bottom right) -->
<button
  class="fab"
  aria-label="Upload"
  title="Upload"
  on:click={() => goto('/upload')}
>
  📤
  <span class="label">Upload</span>
</button>

{#if viewAsPersonal && isAdmin}
  <button class="exit-admin-btn" on:click={exitPersonal} title="Exit Personal Mode">
    ⇦ Back to Admin
  </button>
{/if}
