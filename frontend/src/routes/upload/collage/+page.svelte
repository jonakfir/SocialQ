<!-- src/routes/upload/collage/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Get user from page data
  let userFromData: { id?: number; email?: string } | null = null;
  $: {
    userFromData = ($page.data as any)?.user || null;
  }

  // ───────────────────────────────────────────────────────────
  // Model
  // ───────────────────────────────────────────────────────────
  const EMOTIONS = ['Angry','Disgust','Fear','Happy','Sad','Surprise'] as const;
  type Emotion = typeof EMOTIONS[number];
  type Tile = { emotion: Emotion; canvas: HTMLCanvasElement | null; frozenUrl?: string };

  let tiles: Tile[] = EMOTIONS.map((e)=>({ emotion: e, canvas: null }));
  let gridEl: HTMLDivElement;

  // Shared camera
  let videoEl: HTMLVideoElement;
  let stream: MediaStream | null = null;

  // Focused overlay
  let focusedIdx: number | null = null;
  let focusCanvas: HTMLCanvasElement;
  let focusRAF: number | null = null;

  // Human.js (browser)
  let human: any = null;
  let humanReady = false;

  // UI state
  let scoring = false;
  let errorMsg = '';
  let showPassFlash = false;
  let saving = false;
  let saveSuccess = false;
  let saveError = '';

  const PASS_THRESHOLD = 0.45;
  const APP_LINK = 'https://social-q-theta.vercel.app/';

  const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  const canonicalEmotion = (s: string) => {
    const n = (s || '').toLowerCase();
    const map: Record<string, string> = {
      angry:'angry', anger:'angry',
      disgust:'disgust', disgusted:'disgust',
      fear:'fear', fearful:'fear', afraid:'fear',
      happy:'happy', happiness:'happy',
      sad:'sad', sadness:'sad',
      surprise:'surprise', surprised:'surprise',
      neutral:'neutral'
    };
    return map[n] ?? n;
  };

  // ───────────────────────────────────────────────────────────
  // Camera
  // ───────────────────────────────────────────────────────────
  async function ensureCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      videoEl = document.createElement('video');
      videoEl.setAttribute('playsinline','');
      videoEl.setAttribute('autoplay','');
      videoEl.muted = true;
      videoEl.srcObject = stream;
      await new Promise<void>((resolve) => {
        const to = setTimeout(resolve, 2500);
        videoEl.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      });
      try { await videoEl.play(); } catch {}
    } catch (e) {
      console.warn('Camera error:', e);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Human.js
  // ───────────────────────────────────────────────────────────
  async function loadHuman() {
    if ((window as any).Human?.Human) return (window as any).Human.Human;
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.append(s);
    });
    return (window as any).Human.Human;
  }
  async function ensureHuman() {
    if (humanReady) return;
    const HumanCtor = await loadHuman();
    human = new HumanCtor({
      backend: 'webgl',
      modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
      face: { enabled: true, detector: { enabled: true, maxDetected: 1 }, mesh: { enabled: true }, emotion: { enabled: true } },
      body: false, hand: false, object: false, gesture: false
    });
    await human.load(); try { await human.warmup(); } catch {}
    humanReady = true;
  }

  // ───────────────────────────────────────────────────────────
  // Drawing
  // ───────────────────────────────────────────────────────────
  function drawToCanvas(target: HTMLCanvasElement) {
    if (!videoEl) return;
    const vw = videoEl.videoWidth || 0;
    const vh = videoEl.videoHeight || 0;
    if (!vw || !vh) return;

    const cw = target.width, ch = target.height;
    const arC = cw / ch, arV = vw / vh;

    let sw: number, sh: number;
    if (arV > arC) { sh = vh; sw = sh * arC; } else { sw = vw; sh = sw / arC; }
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;

    const c = target.getContext('2d')!;
    c.clearRect(0, 0, cw, ch);

    // mirror horizontally (selfie)
    c.save();
    c.translate(cw, 0);
    c.scale(-1, 1);
    c.drawImage(videoEl, sx, sy, sw, sh, 0, 0, cw, ch);
    c.restore();
  }

  function sizeAllTiles() {
    const cells = Array.from(gridEl.querySelectorAll<HTMLDivElement>('.cell'));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cells.forEach((cell, i) => {
      const canv = tiles[i].canvas!;
      const r = cell.getBoundingClientRect();
      canv.width  = Math.max(1, Math.floor(r.width * dpr));
      canv.height = Math.max(1, Math.floor((r.width * 0.66) * dpr)); // ~3:2
    });
  }

  function startGridLoop() {
    (function loop(){
      tiles.forEach(t => {
        if (!t.canvas) return;
        if (t.frozenUrl) {
          const ctx = t.canvas.getContext('2d')!;
          const img = new Image();
          img.src = t.frozenUrl;
          img.onload = () => {
            const cw = t.canvas!.width, ch = t.canvas!.height;
            const arC = cw / ch, arI = img.width / img.height;
            let sw:number, sh:number;
            if (arI > arC) { sh = img.height; sw = sh * arC; } else { sw = img.width; sh = sw / arC; }
            const sx = (img.width - sw)/2, sy = (img.height - sh)/2;
            ctx.clearRect(0,0,cw,ch);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
          };
        } else {
          drawToCanvas(t.canvas);
        }
      });
      requestAnimationFrame(loop);
    })();
  }

  function sizeFocusCanvas() {
    const box = document.querySelector('.cam-box') as HTMLDivElement;
    if (!box || !focusCanvas) return;
    const r = box.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    focusCanvas.width  = Math.max(1, Math.floor(r.width * dpr));
    focusCanvas.height = Math.max(1, Math.floor(r.height * dpr));
  }

  function startFocusLoop() {
    stopFocusLoop();
    const draw = () => { drawToCanvas(focusCanvas); focusRAF = requestAnimationFrame(draw); };
    focusRAF = requestAnimationFrame(draw);
  }
  function stopFocusLoop() {
    if (focusRAF != null) cancelAnimationFrame(focusRAF);
    focusRAF = null;
  }

  // ───────────────────────────────────────────────────────────
  // Overlay open/close
  // ───────────────────────────────────────────────────────────
  function openFocus(i: number) {
    focusedIdx = i;
    errorMsg = '';
    showPassFlash = false;
    setTimeout(() => { sizeFocusCanvas(); startFocusLoop(); }, 0);
  }
  function closeFocus() {
    stopFocusLoop();
    focusedIdx = null;
    errorMsg = '';
    showPassFlash = false;
  }
  function onOverlayClick(e: MouseEvent) {
    // Only close if you clicked the overlay itself (outside the cam-box)
    if (e.target === e.currentTarget) closeFocus();
  }

  // ───────────────────────────────────────────────────────────
  // Scoring / Approve
  // ───────────────────────────────────────────────────────────
  async function detectEmotionAvgOn(el: HTMLCanvasElement, frames=8, gapMs=50) {
    const keys = ['angry','disgust','fear','happy','sad','surprise'] as const;
    const sum: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };

    for (let i=0;i<frames;i++){
      drawToCanvas(el);
      const det = await human.detect(el);
      const face = det?.face?.[0];
      const arr: Array<{ emotion:string; score:number }> = face?.emotion || face?.emotions || [];
      if (arr?.length){
        const frameMax: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };
        for (const it of arr) {
          const k = canonicalEmotion(it.emotion);
          if (k && k in frameMax) frameMax[k] = Math.max(frameMax[k], Number(it.score ?? 0));
        }
        for (const k of keys) sum[k] += frameMax[k];
      }
      if (gapMs) await new Promise(r=>setTimeout(r,gapMs));
    }
    let total = 0; for (const k in sum) total += sum[k];
    if (!total){ for (const k in sum) sum[k]=1e-6; total=6e-6; }
    const probs: Record<string, number> = {}; for (const k of keys) probs[k]=sum[k]/total;
    const topKey = (keys as unknown as string[]).reduce((a,b)=> probs[b] > probs[a] ? b : a, keys[0] as unknown as string);
    return { probs, top: { emotion: topKey, score: probs[topKey] }};
  }

  async function recordForFocused() {
    if (focusedIdx == null || scoring) return;
    scoring = true; errorMsg = '';

    try {
      await ensureHuman();
      sizeFocusCanvas();

      const { probs, top } = await detectEmotionAvgOn(focusCanvas, 8, 50);
      const want = canonicalEmotion(tiles[focusedIdx].emotion);
      const wantProb = probs[want] ?? 0;
      const pass = top.emotion === want || wantProb >= PASS_THRESHOLD;

      if (!pass) throw new Error(`Didn’t look like “${titleCase(tiles[focusedIdx].emotion)}”. Try again.`);

      showPassFlash = true;
      const still = focusCanvas.toDataURL('image/jpeg', 0.95);
      setTimeout(() => { tiles[focusedIdx!].frozenUrl = still; closeFocus(); }, 550);
    } catch (e: any) {
      errorMsg = e?.message || 'Failed to record';
    } finally {
      scoring = false;
    }
  }

  // Manual approve for ALL emotions (small button, bottom-right)
  function approveAnyway() {
    if (focusedIdx == null) return;
    sizeFocusCanvas();
    drawToCanvas(focusCanvas);
    const still = focusCanvas.toDataURL('image/jpeg', 0.95);
    tiles[focusedIdx].frozenUrl = still;
    showPassFlash = true;
    setTimeout(() => { closeFocus(); }, 350);
  }

  function resetTile(i: number){ tiles[i].frozenUrl = undefined; }
  function goBack(){ goto('/upload'); }

  // ───────────────────────────────────────────────────────────
  // Share set (long message + image + link) — with robust fallbacks
  // ───────────────────────────────────────────────────────────
  $: allDone = tiles.every(t => !!t.frozenUrl);

  function isiOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent); }
  function smsJoiner(){ return isiOS() ? '&' : '?'; }
  function openSMS(body: string){ location.href = `sms:${smsJoiner()}body=${encodeURIComponent(body)}`; }

  async function buildCollageDataURL() {
    const cols = 3, rows = 2, gap = 16, pad = 18;
    const cellW = 520, cellH = 360;
    const W = pad*2 + cols*cellW + (cols-1)*gap;
    const H = pad*2 + rows*cellH + (rows-1)*gap;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;

    const g = ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'#fbcfe8'); g.addColorStop(.5,'#bae6fd'); g.addColorStop(1,'#bbf7d0');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    const images: HTMLImageElement[] = await Promise.all(
      tiles.map(t => new Promise<HTMLImageElement>((res) => {
        const im = new Image(); im.onload = () => res(im); im.src = t.frozenUrl!;
      }))
    );

    let k = 0;
    ctx.font = 'bold 16px system-ui, -apple-system, Segoe UI, Roboto';
    for (let r=0; r<rows; r++){
      for (let cc=0; cc<cols; cc++){
        const x = pad + cc*(cellW+gap);
        const y = pad + r*(cellH+gap);
        const img = images[k];

        // rounded draw + object-fit: cover
        const arC = cellW / cellH, arI = img.width / img.height;
        let sw:number, sh:number;
        if (arI > arC) { sh = img.height; sw = sh * arC; } else { sw = img.width; sh = sw / arC; }
        const sx = (img.width - sw)/2, sy = (img.height - sh)/2;

        ctx.save();
        const rr = 16;
        ctx.beginPath();
        ctx.moveTo(x+rr, y);
        ctx.arcTo(x+cellW, y, x+cellW, y+cellH, rr);
        ctx.arcTo(x+cellW, y+cellH, x, y+cellH, rr);
        ctx.arcTo(x, y+cellH, x, y, rr);
        ctx.arcTo(x, y, x+cellW, y, rr);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
        ctx.restore();

        // label chip
        const label = titleCase(tiles[k].emotion);
        const w = ctx.measureText(label).width + 16;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(x+10, y+10, w, 28);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x+18, y+30);

        k++;
      }
    }

    // Use PNG for best clipboard compatibility
    return c.toDataURL('image/png', 1);
  }

  // Convert dataURL -> File
  async function dataURLToFile(dataUrl: string, name='socialq-collage.png') {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], name, { type: blob.type || 'image/png' });
  }

  // Modern copy (ClipboardItem)
  async function copyImageToClipboardModern(file: File) {
    try {
      // @ts-ignore
      if (navigator.clipboard?.write && window.ClipboardItem) {
        const item = new ClipboardItem({ [file.type]: file } as Record<string, Blob>);
        // @ts-ignore
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch {}
    return false;
  }

  // Fallback: put an <img> in a contentEditable div and execCommand('copy')
  async function copyImageViaContentEditable(dataUrl: string) {
    try {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-99999px;top:0;';
      host.contentEditable = 'true';

      const img = document.createElement('img');
      img.src = dataUrl;
      host.appendChild(img);

      document.body.appendChild(host);

      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNode(host);
      sel?.removeAllRanges();
      sel?.addRange(range);

      const ok = document.execCommand('copy'); // deprecated, but still the best fallback
      sel?.removeAllRanges();
      document.body.removeChild(host);
      return ok;
    } catch {
      return false;
    }
  }

  // Copy text as backup (if SMS body fails to include it in some browsers)
  async function copyTextToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // Extract individual tile image from frozenUrl
  async function extractTileImage(tile: Tile): Promise<File | null> {
    if (!tile.frozenUrl) return null;
    
    // Create an image from the data URL
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = tile.frozenUrl!;
    });
    
    // Create a canvas with the image dimensions
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    
    // Convert canvas to blob, then to File
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        const file = new File([blob], `${tile.emotion.toLowerCase()}.png`, { type: 'image/png' });
        resolve(file);
      }, 'image/png');
    });
  }

  // Save collage to server - saves each tile individually by emotion
  async function saveCollage() {
    if (saving) return;
    
    saving = true;
    saveSuccess = false;
    saveError = '';

    try {
      // Get user info for auth (from page data or localStorage for mock auth)
      let user: { id?: number; email?: string } | null = userFromData || null;
      
      // Try multiple localStorage keys where user might be stored
      if (!user || !user.id || !user.email) {
        try {
          // Try mock_auth_user first (used by api.ts mock)
          const mockUserStr = localStorage.getItem('mock_auth_user');
          if (mockUserStr) {
            const parsed = JSON.parse(mockUserStr);
            if (parsed && (parsed.id || parsed.email)) {
              user = parsed;
            }
          }
          
          // Fallback to separate localStorage keys
          if (!user || !user.id || !user.email) {
            const userId = localStorage.getItem('userId');
            const email = localStorage.getItem('email') || localStorage.getItem('username');
            if (userId || email) {
              user = { 
                id: userId ? Number(userId) : (user?.id || 1), 
                email: email || user?.email 
              };
            }
          }
        } catch (e) {
          console.warn('Error reading user from localStorage:', e);
        }
      }

      console.log('[saveCollage] ========== SAVE ATTEMPT ==========');
      console.log('[saveCollage] User info:', user);
      console.log('[saveCollage] localStorage mock_auth_user:', localStorage.getItem('mock_auth_user'));
      console.log('[saveCollage] localStorage userId:', localStorage.getItem('userId'));
      console.log('[saveCollage] localStorage email:', localStorage.getItem('email'));

      // If still no user, show error and redirect to login
      if (!user || !user.id || !user.email) {
        console.error('[saveCollage] NO USER FOUND - cannot save');
        saveError = 'Please log in to save your collage. Go to Login page first.';
        saving = false;
        setTimeout(() => {
          goto('/login');
        }, 2000);
        return;
      }

      // Get tiles that have frozen images
      const tilesToSave = tiles.filter(t => t.frozenUrl);
      
      if (tilesToSave.length === 0) {
        saveError = 'No tiles to save. Please capture images for at least one emotion.';
        saving = false;
        return;
      }

      console.log('[saveCollage] Saving', tilesToSave.length, 'individual tiles');

      // Save each tile individually
      const headers: HeadersInit = {
        'X-User-Id': String(user.id),
        'X-User-Email': user.email
      };

      let successCount = 0;
      let errorCount = 0;

      for (const tile of tilesToSave) {
        try {
          const file = await extractTileImage(tile);
          if (!file) {
            console.warn(`[saveCollage] Could not extract image for ${tile.emotion}`);
            errorCount++;
            continue;
          }

          const formData = new FormData();
          formData.append('file', file);
          // Each tile has only one emotion
          formData.append('emotions', JSON.stringify([titleCase(tile.emotion)]));
          
          // CRITICAL: Append user info to FormData (MUST be in FormData for file uploads)
          formData.append('userId', String(user.id));
          formData.append('userEmail', user.email);

          console.log(`[saveCollage] Saving ${tile.emotion} tile`);

          const response = await fetch('/api/collages', {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers
          });

          const result = await response.json();

          if (result.ok) {
            successCount++;
            console.log(`[saveCollage] Successfully saved ${tile.emotion} tile`);
          } else {
            errorCount++;
            console.error(`[saveCollage] Failed to save ${tile.emotion} tile:`, result.error);
          }
        } catch (e: any) {
          errorCount++;
          console.error(`[saveCollage] Error saving ${tile.emotion} tile:`, e);
        }
      }

      if (successCount > 0) {
        saveSuccess = true;
        setTimeout(() => { saveSuccess = false; }, 3000);
        
        if (errorCount > 0) {
          saveError = `Saved ${successCount} tile(s), but ${errorCount} failed.`;
        }
      } else {
        saveError = 'Failed to save any tiles. Please try again.';
      }
    } catch (e: any) {
      console.error('Save failed:', e);
      saveError = e?.message || 'Failed to save collage';
    } finally {
      saving = false;
    }
  }

  async function shareSet() {
    try {
      const dataUrl = await buildCollageDataURL();
      const file = await dataURLToFile(dataUrl, 'socialq-collage.png');

      // Automatically save to server when sharing (if user is logged in)
      try {
        await saveCollage();
      } catch (e) {
        // Don't block sharing if save fails
        console.warn('Auto-save failed:', e);
      }

      const longMessage =
`I just nailed all SIX SocialQ emotions — Angry, Disgust, Fear, Happy, Sad, and Surprise! 😄

Check out my collage 👇 Then try it yourself and see if you can beat me:
${APP_LINK}

(If the image doesn't show automatically, just paste — I put it on your clipboard.)`;

      // Best path: native share with image file + text
      // @ts-ignore
      if (navigator.canShare?.({ files: [file], text: longMessage })) {
        await navigator.share({ text: longMessage, files: [file], title: 'My SocialQ 6-face Collage' });
        return;
      }

      // Otherwise, try to copy the image to the clipboard…
      let copiedImage = await copyImageToClipboardModern(file);
      if (!copiedImage) copiedImage = await copyImageViaContentEditable(dataUrl);

      // …and copy the long text as a backup too.
      await copyTextToClipboard(longMessage);

      // Open Messages/SMS with the long message included
      openSMS(longMessage);

      if (copiedImage) {
        alert('Messages opened. I put the collage on your clipboard — press ⌘V (or long-press → Paste) to insert it, then send.');
      } else {
        alert('Messages opened with your note. If the collage did not copy, attach it manually.');
      }
    } catch (e) {
      console.warn('Share failed:', e);
      alert('Could not share. Please try a different browser, or take a screenshot.');
    }
  }

  // ───────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────
  onMount(async () => {
    await ensureCamera();
    await ensureHuman();
    setTimeout(sizeAllTiles, 0);
    window.addEventListener('resize', sizeAllTiles);
    startGridLoop();
  });
  onDestroy(() => {
    window.removeEventListener('resize', sizeAllTiles);
    stopFocusLoop();
    try { stream?.getTracks()?.forEach(t=>t.stop()); } catch {}
  });
</script>

<svelte:head><title>Collage – Six Emotions</title></svelte:head>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

{#if focusedIdx === null}
  <button class="back-btn" on:click={goBack}>← Back</button>
{/if}

<div class="stage">
  <div class="grid" bind:this={gridEl}>
    {#each tiles as t, i}
      <div class="cell" on:click={() => openFocus(i)}>
        <canvas bind:this={t.canvas}></canvas>
        <div class="label">{titleCase(t.emotion)}</div>

        {#if t.frozenUrl}
          <div class="badge">✔ Saved</div>
          <button class="reset" on:click|stopPropagation={() => resetTile(i)}>Reset</button>
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if allDone && focusedIdx === null}
  <div class="action-buttons">
    <button 
      class="save-btn" 
      on:click={saveCollage}
      disabled={saving}
      title="Save collage to your account"
    >
      {#if saving}
        Saving...
      {:else if saveSuccess}
        ✓ Saved!
      {:else}
        Save
      {/if}
    </button>
    <button class="share-fab" on:click={shareSet}>Share set</button>
  </div>
  
  {#if saveError}
    <div class="save-error">{saveError}</div>
  {/if}
{/if}

{#if focusedIdx !== null}
  <!-- Single overlay that also acts as scrim; click outside .cam-box closes -->
  <div class="cam-wrap" on:click={onOverlayClick}>
    <div class="cam-box" on:click|stopPropagation>
      <canvas bind:this={focusCanvas}></canvas>
      {#if showPassFlash}<div class="flash"></div>{/if}

      <div class="bottombar">
        {#if errorMsg}<div class="err">{errorMsg}</div>{/if}
        <button
          class="record-btn {scoring ? 'on' : ''}"
          aria-label="Record"
          disabled={scoring}
          on:click={recordForFocused}
          title="Record and auto-check"
        />
      </div>

      <!-- Subtle manual approve for ALL emotions -->
      <button class="approve-fab" on:click={approveAnyway} title="Use this frame anyway">Approve</button>
    </div>
  </div>
{/if}

<style>
  :root{ --brand:#6d5ef6; --ink:#0f172a; }

  .back-btn{
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 40;
    background: #fff;
    border: 1px solid rgba(79,70,229,.35);
    border-radius: 9999px;
    padding: 8px 14px;
    cursor: pointer;
    color: var(--ink);
    box-shadow: 0 6px 18px rgba(79,70,229,.15);
  }

  .stage{
    position: absolute; inset: 86px 20px 24px 20px;
    display: grid; place-items: center;
  }
  .grid{
    width: min(1200px, 100%);
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  }
  @media (max-width: 1000px){ .grid{ grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 660px){ .grid{ grid-template-columns: 1fr; } }

  .cell{
    position: relative; border-radius: 18px; overflow: hidden; cursor: pointer;
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.18));
    box-shadow: 0 16px 36px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.30);
  }
  .cell canvas{ width:100%; height:auto; display:block; aspect-ratio: 3/2; }
  .label{
    position:absolute; left:10px; top:8px; z-index:2;
    color:#fff; font-weight:900; text-shadow:0 2px 6px rgba(0,0,0,.7);
  }
  .badge{
    position:absolute; right:10px; top:8px; z-index:2;
    background:#16a34a; color:#fff; font-weight:800; padding:4px 8px; border-radius:9999px;
    box-shadow: 0 8px 18px rgba(22,163,74,.25);
  }
  .reset{
    position:absolute; right:10px; bottom:10px; z-index:2;
    background:#fff; border:2px solid #111; color:#111; font-weight:800; padding:6px 10px; border-radius:10px;
  }

  /* Action buttons */
  .action-buttons{
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: 18px; z-index: 40;
    display: flex; gap: 12px; align-items: center;
  }
  
  .save-btn{
    background: rgba(255,255,255,.95);
    color: #111; font-weight: 800;
    border: 2px solid rgba(79,70,229,.3);
    border-radius: 9999px; padding: 12px 18px; cursor: pointer;
    box-shadow: 0 6px 18px rgba(0,0,0,.12);
    transition: all .15s ease;
  }
  .save-btn:hover:not(:disabled){ 
    background: #fff;
    border-color: rgba(79,70,229,.5);
    transform: translateY(-1px);
  }
  .save-btn:disabled{
    opacity: .6;
    cursor: not-allowed;
  }
  
  /* Share FAB */
  .share-fab{
    background: linear-gradient(135deg, #6d5ef6, #22d3ee);
    color: #fff; font-weight: 900;
    border: none; border-radius: 9999px; padding: 12px 18px; cursor: pointer;
    box-shadow: 0 12px 28px rgba(79,70,229,.28);
  }
  .share-fab:hover{ filter: brightness(1.03); }
  
  .save-error{
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: 80px; z-index: 40;
    background: #b91c1c; color: #fff;
    padding: 8px 16px; border-radius: 9999px;
    font-weight: 700; font-size: 13px;
    box-shadow: 0 6px 18px rgba(185,28,28,.3);
  }

  /* Overlay (acts as scrim & click target) */
  .cam-wrap{
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 210;
    padding: 18px;
    background: rgba(0,0,0,.55);
  }
  .cam-box{
    position: relative;
    width: min(1000px, 96vw);
    height: min(72vh, 820px);
    border-radius: 18px; overflow: hidden;
    box-shadow: 0 28px 70px rgba(0,0,0,.36);
    background: #000;
  }
  .cam-box canvas{ width:100%; height:100%; display:block; object-fit: cover; }

  .flash{ position:absolute; inset:0; background:#fff; opacity:.65; animation: flash .28s ease-out forwards; pointer-events:none; }
  @keyframes flash{ to { opacity:0 } }

  .bottombar{
    position:absolute; left:0; right:0; bottom:0;
    display:grid; place-items:center; gap:10px; padding: 12px 12px 14px;
    background: rgba(255,255,255,.26);
    backdrop-filter: blur(14px) saturate(140%);
    border-top: 1px solid rgba(255,255,255,.35);
  }
  .err{ color:#b91c1c; font-weight:800; background: rgba(255,255,255,.85); padding:6px 10px; border-radius:10px; }

  .record-btn{
    width:68px; height:68px; border-radius:50%; border:none; cursor:pointer;
    background:#ef4444; box-shadow:0 12px 28px rgba(239,68,68,.28);
    transition: transform .08s ease, filter .2s ease, box-shadow .2s ease;
  }
  .record-btn:hover{ transform: translateY(-1px); }
  .record-btn.on{ filter:saturate(1.08) brightness(1.03); box-shadow:0 16px 36px rgba(239,68,68,.36); }

  /* Subtle approve button */
  .approve-fab{
    position: absolute;
    right: 14px;
    bottom: 14px;
    z-index: 220;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    color: #111;
    background: rgba(255,255,255,.92);
    border: 1.5px solid rgba(17,17,17,.85);
    border-radius: 10px;
    opacity: .82;
    backdrop-filter: blur(8px) saturate(120%);
    box-shadow: 0 6px 16px rgba(0,0,0,.18);
    cursor: pointer;
    transition: opacity .15s ease, transform .05s ease;
  }
  .approve-fab:hover{ opacity: 1; }
  .approve-fab:active{ transform: translateY(1px); }
</style>
