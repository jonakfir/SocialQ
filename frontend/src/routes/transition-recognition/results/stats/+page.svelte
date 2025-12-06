<script>
  export const ssr = false;

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getUserKey } from '$lib/userKey';

  let rows = [];
  let score = 0;
  let total = 0;
  let working = false;

  onMount(async () => {
    document.title = 'Transition Recognition — Stats';
    const userKey = getUserKey();
    const detailsKey   = `tr_details_${userKey}`;
    const lastRunKey   = `tr_last_run_${userKey}`;

    rows = safeParse(localStorage.getItem(detailsKey)) ?? [];

    if (!rows.length) {
      const last = safeParse(localStorage.getItem(lastRunKey));
      const bools = safeParse(localStorage.getItem(`tr_quiz_results_${userKey}`)) ?? [];
      if (last && Array.isArray(last.clips) && last.clips.length) {
        rows = last.clips.map((c, i) => {
          const pickedFrom = last.guessFrom?.[i] ?? null;
          const pickedTo   = last.guessTo?.[i]   ?? null;
          const okFrom = !!(pickedFrom && c?.from && pickedFrom === c.from);
          const okTo   = !!(pickedTo   && c?.to   && pickedTo   === c.to);
          return {
            media: c?.href || c?.media || null,
            from:  c?.from ?? null,
            to:    c?.to   ?? null,
            pickedFrom,
            pickedTo,
            okFrom,
            okTo,
            startImg: null,
            endImg: null
          };
        });
      } else if (Array.isArray(bools) && bools.length) {
        rows = bools.map((b) => {
          const okFrom = !!(Array.isArray(b) ? b[0] : b);
          const okTo   = !!(Array.isArray(b) ? b[1] : b);
          return { media:null, from:null, to:null, pickedFrom:null, pickedTo:null, okFrom, okTo, startImg:null, endImg:null };
        });
      }
    }

    total = rows.length;
    score = rows.reduce((acc, r) => acc + ((r.okFrom && r.okTo) ? 1 : 0), 0);

    if (rows.some(r => r.media && (!r.startImg || !r.endImg))) {
      working = true;
      await captureAllThumbnailsSequential(rows);
      working = false;
      localStorage.setItem(`tr_details_${userKey}`, JSON.stringify(rows));
    }
  });

  function safeParse(s) {
    try { return JSON.parse(s || 'null'); } catch { return null; }
  }

  async function captureAllThumbnailsSequential(list) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r?.media) continue;
      if (r.startImg && r.endImg) continue;
      try {
        const { start, end } = await captureStartEnd(r.media);
        r.startImg = r.startImg || start;
        r.endImg   = r.endImg   || end;
      } catch { /* ignore */ }
    }
  }

  function captureStartEnd(src) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.preload = 'auto';
      v.src = src;
      v.muted = true;
      v.playsInline = true;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      function snap() {
        const w = v.videoWidth  || 320;
        const h = v.videoHeight || 180;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.7);
      }

      v.onerror = () => reject(new Error('video error'));
      v.onloadedmetadata = async () => {
        try {
          v.currentTime = 0;
          await once(v, 'seeked');
          const start = snap();

          v.currentTime = Math.max(0, (v.duration || 0) - 0.05);
          await once(v, 'seeked');
          const end = snap();

          resolve({ start, end });
        } catch (e) { reject(e); }
        finally { v.src = ''; }
      };

      v.load();
    });
  }

  function once(target, ev) {
    return new Promise(res => {
      const fn = () => { target.removeEventListener(ev, fn); res(); };
      target.addEventListener(ev, fn);
    });
  }

    function clsPass(r) { 
    if (r.okFrom && r.okTo) return 'ok';
    if (r.okFrom || r.okTo) return 'partial';
    return 'no';
    }
  function fmtPick(v) { return v === '__timeout__' ? '(timeout)' : (v ?? '(unknown)'); }

  function playAgain() { goto('/transition-recognition/settings'); }
</script>

<style>
  @import '/static/style.css';

  .wrap{
    min-height:100vh;
    display:grid; place-items:center;
    position:relative;
  }
  .panel{
    width:min(1020px,94vw);
    max-height:86vh;
    background:rgba(255,255,255,0.85);
    backdrop-filter:blur(18px);
    border-radius:20px;
    box-shadow:0 14px 48px rgba(0,0,0,.18);
    display:grid;
    grid-template-rows:auto auto 1fr auto;
    overflow:hidden;
  }
  .head{ padding:16px 22px 6px; text-align:center; }
  .title{
    font-family:'Georgia',serif; font-size:2.8rem; color:white;
    -webkit-text-stroke:2px rgba(0,0,0,0.5);
    text-shadow:0 6px 10px rgba(0,0,0,0.35);
    margin:6px 0 8px;
  }
  .summary{ font-weight:800; }

  .dots{ display:flex; justify-content:center; gap:8px; padding:0 24px 10px; }
  .dot{ width:44px; height:10px; border-radius:6px; background:#d6d6d6; }
  .dot.ok{ background:#22c55e; }
  .dot.no{ background:#ef4444; }

  .work{ text-align:center; font-size:12.5px; color:#6b7280; padding-bottom:6px; }

  .list{ overflow:auto; padding:10px 14px 14px; }

  .row{
    display:grid;
    grid-template-columns: 170px 1fr auto;
    gap:14px; align-items:center;
    padding:12px; margin:10px 6px;
    background:rgba(255,255,255,0.95);
    border:1.5px solid rgba(17,17,17,.12);
    border-radius:16px;
    box-shadow:0 3px 12px rgba(0,0,0,.08);
  }
    .dot.partial { background: #facc15; } /* yellow-400 */

    .badge.partial { 
    color: #92400e; 
    background: #fef3c7;  /* amber-100 */
    border-color: #92400e;
    }

  .thumbs{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
  .thumbBox{ display:grid; gap:4px; justify-items:center; }
  .thumb{
    width:78px; height:78px; border-radius:10px; object-fit:cover;
    background:#eee; border:1px solid rgba(17,17,17,.12);
  }
  .cap{ font-size:12px; color:#6b7280; }

  .lab{ font-size:14px; line-height:1.35; }
  .muted{ color:#6b7280; font-style:italic; }

  .badge{
    justify-self:end;
    padding:6px 12px; font-weight:800; border-radius:9999px; border:2px solid transparent;
  }
  .badge.ok{ color:#065f46; background:#a7f3d0; border-color:#065f46; }
  .badge.no{ color:#7f1d1d; background:#fecaca; border-color:#7f1d1d; }

  .footer{
    padding:14px 16px 16px; border-top:1px solid rgba(0,0,0,0.08);
    display:flex; justify-content:center; gap:12px;
  }
  .btn{ padding:12px 18px; border-radius:9999px; font-weight:800; border:2px solid #111; background:#fff; cursor:pointer; text-decoration:none; color:#111; text-align:center; }
  .btn.primary{ background:#4f46e5; border-color:#4f46e5; color:#fff; }
  .btn:hover{ filter:brightness(1.05); }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="wrap">
  <div class="panel">
    <div class="head">
      <div class="title">Your Answers</div>
      <div class="summary">{score}/{total} correct</div>
    </div>

    <div class="dots">
      {#each rows as r}<div class="dot {clsPass(r)}"></div>{/each}
    </div>

    {#if working}<div class="work">Generating thumbnails…</div>{/if}

    <div class="list">
      {#if !rows.length}
        <div style="text-align:center; padding:22px;">No data found.</div>
      {:else}
        {#each rows as r, i}
          <div class="row">
            <div class="thumbs">
              <div class="thumbBox">
                {#if r.startImg}<img class="thumb" src={r.startImg} alt="Start frame" />
                {:else}<div class="thumb" aria-hidden="true"></div>{/if}
                <div class="cap">Start</div>
              </div>
              <div class="thumbBox">
                {#if r.endImg}<img class="thumb" src={r.endImg} alt="End frame" />
                {:else}<div class="thumb" aria-hidden="true"></div>{/if}
                <div class="cap">End</div>
              </div>
            </div>

            <div>
              <div class="lab"><strong>Q{i+1}</strong></div>
              <div class="lab">
                Correct start: <strong>{r.from ?? '(unknown)'}</strong>
                <span class="muted"> — your pick: {fmtPick(r.pickedFrom)}</span>
              </div>
              <div class="lab">
                Correct end: <strong>{r.to ?? '(unknown)'}</strong>
                <span class="muted"> — your pick: {fmtPick(r.pickedTo)}</span>
              </div>
            </div>

            <div class="badge {clsPass(r)}">
            {clsPass(r) === 'ok' ? 'Correct' 
                : clsPass(r) === 'partial' ? 'Partially Correct' 
                : 'Incorrect'}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="footer">
      <button class="btn primary" on:click={playAgain}>Play Again</button>
      <a class="btn" href="/transition-recognition/results">Back to Results</a>
      <a class="btn" href="/dashboard">Dashboard</a>
    </div>
  </div>
</div>
