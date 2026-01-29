<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  onMount(() => { document.title = 'Upload'; });
  const nav = (p: string) => goto(p);
</script>

<style>
  /* The shared blob background lives in /static/style.css.
     We just place the blob divs and keep our content above them. */
  .page {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
  }

  /* ensure blobs are behind card */
  .blobs {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .wrap-inner {
    position: relative;
    z-index: 1;                 /* content above blobs */
    min-height: calc(100vh - 40px);
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .card {
    width: min(820px, 94vw);
    padding: 26px;
    border-radius: 28px;
    background: var(--bg-card, rgba(255,255,255,.55));
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid var(--border-color, rgba(17,17,17,.18));
    box-shadow: 0 18px 50px var(--shadow, rgba(0,0,0,.22));
    text-align: center;
    color: var(--text-primary, #000);
    transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
  }

  h1 {
    margin: 6px 0 18px;
    font-family: 'Georgia', serif;
    font-size: clamp(2rem, 6vw, 2.6rem);
    color: var(--text-primary, #000);
    -webkit-text-stroke: 1px var(--border-color, rgba(0,0,0,.3));
    text-shadow: 0 4px 12px var(--shadow, rgba(0,0,0,.2));
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(260px, 1fr));
    gap: 18px;
    margin-top: 14px;
  }

  .option {
    position: relative;
    display: grid;
    place-items: center;
    gap: 8px;
    padding: 22px 18px;
    min-height: 260px;
    border-radius: 22px;
    border: 2px solid var(--border-color, rgba(17,17,17,.85));
    background: var(--bg-card-hover, rgba(255,255,255,.75));
    font-weight: 800;
    font-size: 18px;
    color: var(--text-primary, #000);
    cursor: pointer;
    overflow: hidden;
    box-shadow: 0 8px 24px var(--shadow, rgba(0,0,0,.1));
    transition: filter .15s, box-shadow .18s, border-color .18s, transform .12s, background .2s, color .2s;
    transform: translateZ(0);
  }
  .option:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 34px rgba(79,70,229,.22);
    border-color: #4f46e5;
    filter: brightness(1.02);
    background: var(--bg-card, rgba(255,255,255,.55));
    color: var(--text-primary, #000);
  }
  .option:focus { outline: none; }
  .option:focus-visible { outline: 2px solid #4f46e5; outline-offset: 3px; }

  .emoji { font-size: 36px; }
  .title { font-size: 1.05rem; color: inherit; }
  .sub { font-size: .86rem; font-weight: 600; opacity: .85; text-align: center; color: var(--text-secondary, #374151); }

  .back {
    display: inline-block;
    margin-top: 20px;
    padding: 10px 16px;
    border-radius: 9999px;
    border: 2px solid var(--border-color, #111);
    background: var(--bg-card-hover, #fff);
    color: var(--text-primary, #000);
    font-weight: 800;
    cursor: pointer;
    transition: background .2s, color .2s, border-color .2s;
  }
  .back:hover {
    background: #4f46e5;
    color: #fff;
    border-color: #4f46e5;
  }

  /* Dark mode: ensure text and borders stay visible */
  :global(html.dark) .sub {
    opacity: .9;
  }
</style>

<div class="page">
  <!-- the standard blob background (same 12 blobs used elsewhere) -->
  <div class="blobs">
    <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
    <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
    <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
  </div>

  <div class="wrap-inner">
    <div class="card">
      <h1>Upload</h1>

      <div class="grid">
        <button class="option" type="button" on:click={() => nav('/upload/one-emotion')}>
          <div class="emoji">🎯</div>
          <div class="title">One Emotion</div>
          <div class="sub">Pick a single emotion to focus on</div>
        </button>

        <button class="option" type="button" on:click={() => nav('/upload/collage')}>
          <div class="emoji">🎥</div>
          <div class="title">Collage</div>
          <div class="sub">Open camera and record with tags</div>
        </button>
      </div>

      <button class="back" type="button" on:click={() => nav('/dashboard')}>← Back to Dashboard</button>
    </div>
  </div>
</div>
