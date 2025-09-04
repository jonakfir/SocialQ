<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  const ART_PATH = '/Art.png';
  $: EMOTION = decodeURIComponent($page.params.emotion ?? 'Emotion');

  const FACTS: Record<string, string[]> = {
    Anger: [
      'Often surges quickly and resolves comparatively fast.',
      'Brows pull down and in; lips may press together.',
      'Voice volume and speech rate can increase.',
      'Can be masked by sarcasm or tight smiles.'
    ],
    Disgust: [
      'Disgust is characterized by subjective feelings of revulsion and a powerful need to withdraw. Disgust is triggered by a physical stimulus, such as the sight or smell of rotting food or blood, or by a morally repugnant act.',
      'Physiologically, disgust is associated with a distinctive decrease in heart rate and blood pressure, nausea, vomiting, gagging, changes to saliva, involuntary recoiling, dropping repulsive object, etc.',
      'From an evolutionary perspective, disgust is a key part of the &quot;behavioral immune system,&quot; which serves to protect the body against illness, disease, and contamination, thereby supporting the survival of the organism. Wonder why the Old Testament makes such a big deal of delicious shellfish?',
      'Contrast to Fear: you see a harmless caged prisoner guilty of heinous act, you are disgusted, not scared',
      'Five Senses: \nSight – sight of maggots in rotting meat \nSound- nails on chalkboard, sound of another vomiting \nFeel - an unexpected texture in your mouth \nSmell – hot garbage \nTaste – spoiled milk'
    ],
    Fear: [
      'People fear current harm (“I’m bleeding!”) and the anticipation/ threat of actual harm (i.e. tiger!) or of a perceived threat (monster under the bed).',
      'People fear physical harm (such as life-threatening harm and flu-shots) and psychological/ emotional (such as loss of love, friends, possessions, reputation, quality of life).',
      'The experience of fear is an evolutionarily-conserved mechanism designed to trigger a rapid and potent response to immediate physical threats: the well-known &quot;fight-or-flight&quot; response, in which the body releases stress hormones such as adrenaline to prepare the body for action.',
      'This results in an increase in heart rate and blood pressure, more rapid breathing, a redirection of blood flow away from the extremities and to the muscles, and an overall tensing of the body. During a fearful state, the cerebral cortex, which is responsible for reasoning and judgment, becomes impaired, making it difficult to think clearly.',
      'Fear and our Senses: \nSight – tiger! Sound – engine backfires sounding like gunshot \nFeel – elevator drops suddenly \nSmell – unexpected smoke smell \nVisceral – stranger gives you the ‘creeps’, hair-stands on back of neck',
      'Blends and Varieties of Fear: \n- Fear/ Sadness \n- Dread, “we’re going to hit it!” \n- Anxiety, “escalating loss of control, worst-case-scenario thinking and imagery, and total uncertainty” – Berne Brown -Vulnerability'
    ],
    Happiness: [
      'Most frequently reported pleasant emotion.',
      'Cheeks lift; eye corners may show crow’s feet.',
      'Genuine smiles (Duchenne) engage the eyes and mouth.',
      'Prosody often becomes brighter and more melodic.'
    ],
    Sadness: [
      'Many experience sadness as quiet suffering.  While surprise and fear are typically short emotions, sadness lingers.',  
      'The experience of sadness can have different subtypes, such as sadness triggered by the loss of a loved one versus sadness induced by the failure to achieve a goal. Sadness from a death is often extreme, includes  is called mourning. Sadness related to failure or inequity may correlate more with feelings of powerlessness.',
      'Physiologically, sadness can be associated with a slowing of heart rate, trembling, and the act of crying, particularly in loss-related conditions.',
      'Behaviorally, individuals experiencing sadness may become quiet or lethargic, withdraw from others, and exhibit a slumped posture.  Vocal cues of sadness include slow, low-pitched speech with lower vocal intensity.',

      'Surprise & Sadness, or Anguish involves an almost unbearable, shocking loss and complete powerlessness',
      'Fear & Sadness – aka Dread – fear of future event (e.g. major surgery) with a sense of hopelessness (e.g. long, painful recovery)',
      'Happiness and Sadness – aka ‘Bittersweet” – appreciating life’s most precious gifts with an almost unbearable awareness of their impermanence',
      'Hopelessness – you’ve lost agency and any path towards your goals (e.g. wrongly imprisoned)',
      'Melancholy, Malaise, Depression, the ‘Blues’ – lingering, sometimes milder prolonged sadness',

      'Sadness and empathy – “In our saddest moments, we want to be held by or feel connected to someone who has known that same ache, even if what caused it is completely different.  We don’t want our sadness overlooked or diminished by someone who can’t tolerate what we’re feeling because they’re unwilling or unable to won their own sadness.”\n~Brene Brown, Atlas of the Heart: Mapping Meaningful Connection and the Language of Human Experience.'
    ],
    Surprise: [
        'Surprise is considered the briefest of the universal emotions, lasting only a few seconds at most before it gives way to another emotion, such as joy, fear, or confusion.',
        'Surprise can occur in the face of the unexpected, and the mis-expected (e.g. whodunnit plot twist).',
        'The experience of surprise initiates a swift and profound physiological response known as the "freeze/find/shift" reaction. This reflex involves a momentary pause or &quot;freeze,&quot; an assessment of the situation (&quot;find&quot;), and a cognitive recalibration (&quot;shift&quot;).',
        'Physiologically, surprise can also trigger an adrenaline burst, increased heart rate, and more rapid breathing. Some find certain surprise enjoyable, like jump-scares or low-stakes gambling.',
        'Surprise &amp; the Five Senses:',
        'Sight -walking into an unexpected scene',
        'Sound-an alarming sound',
        'Feel-an unexpected texture',
        'Smell -the smell of toasty hair when using a curling iron',
        'Taste -when the extra spicy sauce hits',
        'Cerebral Surprise: Joke with a dark, unexpected punchline/ a book’s major Plot Twist',

        'Blends and Varieties of Surprise: \n-startle, jump-scare \n-surprise to fear, “we’re going to hit it!” \n-surprise to happy/ astonished -Really!!?!!/ Cap?!? \n-Amazed – “Whhhaaahhhh??”'
    ]
  };
  const FALLBACK = [
    'Placeholder fact one.',
    'Placeholder fact two.',
    'Placeholder fact three.',
    'Placeholder fact four.'
  ];
  $: items = FACTS[EMOTION] ?? FALLBACK;

  function goBack()        { goto('/training/training-pick-emotion'); }
  function startTraining() { goto(`/training/${encodeURIComponent(EMOTION)}?coach=true`); }
</script>

<svelte:head>
  <title>{EMOTION} • Facts</title>
</svelte:head>

<!-- ambient blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<!-- LEFT: full-viewport artwork -->
<div class="art-cover" aria-hidden="true">
  <img src={ART_PATH} alt="" />
</div>

<!-- Soft seam helper to guarantee no color “column” at the blend -->
<div class="seam-veil" aria-hidden="true"></div>

<!-- RIGHT: facts card -->
<div class="wrap full-viewport safe-area">
  <main class="facts-card">
    <header class="facts-head">
      <h1>{EMOTION} Facts</h1>
      <div class="cta-row">
        <button class="chip" on:click={goBack}>Back</button>
        <button class="chip primary" on:click={startTraining}>Start Training</button>
      </div>
    </header>

    <section class="facts-body">
      <ul class="facts-list">
        {#each items as line, i}
          <li style="--d:{i * 60}ms">{line}</li>
        {/each}
      </ul>

      <div class="note">
        <strong>Tip:</strong> Add examples, frequent confusions, or cultural notes here.
      </div>
    </section>
  </main>
</div>

<!-- gentle bottom color so the right panel isn't stark -->
<div class="bottom-haze" aria-hidden="true"></div>

<style>
  @import '/static/style.css';

  :global(body){ margin:0; overflow:hidden; background:#fdfcfc; }

  /* ---------- Right-side layout ---------- */
  .wrap{
    position: absolute;
    inset: clamp(70px, 7vh, 100px) clamp(26px, 4vw, 46px) clamp(28px, 6vh, 46px) clamp(28px, 4vw, 46px);
    display: grid;
    justify-items: end;
    z-index: 3; /* above image & seam veil */
  }
  .facts-card{
    width: min(980px, 66vw);
    border: 2px solid #111;
    border-radius: 16px;
    background: rgba(255,255,255,.28);
    backdrop-filter: blur(18px);
    box-shadow: 0 16px 48px rgba(0,0,0,.18);
    display: flex;
    flex-direction: column;
    min-height: 460px;
  }
  @media (max-width: 980px){ .facts-card{ width: 100%; } }

  .facts-head{
    display:flex; align-items:center; justify-content:space-between;
    gap:14px; padding:18px 18px 12px;
    border-bottom:1px solid rgba(0,0,0,.08);
  }
  .facts-head h1{
    margin:0; font-family: Georgia, serif; color:#fff;
    font-size: clamp(22px, 4vw, 36px);
    -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 3px 8px rgba(0,0,0,.35);
  }
  .cta-row{ display:flex; gap:10px; }

  .chip{
    background:#fff; border:2px solid #111; border-radius:9999px;
    padding:8px 14px; font-weight:900; cursor:pointer;
    box-shadow:0 10px 20px rgba(0,0,0,.12);
    transition: transform .12s ease, box-shadow .2s ease, background .2s ease, color .2s ease;
  }
  .chip:hover{ transform: translateY(-1px); box-shadow:0 16px 28px rgba(0,0,0,.18); }
  .chip.primary{ background:#4f46e5; color:#fff; }

  .facts-body{ padding:16px 18px 22px; overflow:auto; }
  .intro{ margin:0 0 10px; color:#0f172a; font-weight:600; }

  .facts-list{
    margin:10px 0 16px; padding-left:22px;
    display:grid; gap:10px;
  }
  .facts-list li{
    line-height:1.45;
    animation: fadeUp .32s ease both;
    animation-delay: var(--d, 0ms);
    white-space: pre-line;   /* \n becomes a <br> visually, but still one bullet */
  }
  .note{
    margin-top:8px; padding:10px 12px;
    border:2px dashed rgba(0,0,0,.25);
    border-radius:12px; background: rgba(255,255,255,.6);
  }

  /* ---------- Artwork & blending (no masks; super reliable) ---------- */

  /* The image sits under the right card and reaches far enough right
     that our overlay fade has room to work. Adjust 42% as you like. */
  .art-cover{
    position: fixed;
    left: 0; top: 0; bottom: 0; right: 42%;
    pointer-events: none;
    z-index: 1;
  }
  .art-cover img{
    width: 100%; height: 100%;
    object-fit: cover; object-position: center left;
    filter: saturate(1.02) brightness(.98);
  }
  /* Right-edge feather: a translucent white veil that gradually
     lightens the last part of the artwork so it merges into the blobs */
  .art-cover::after{
    content:'';
    position:absolute; top:0; bottom:0; right:0;
    width:min(26vw, 420px);
    background: linear-gradient(to right,
      rgba(253,252,252,0) 0%,
      rgba(253,252,252,.40) 55%,
      rgba(253,252,252,.65) 75%,
      rgba(253,252,252,.85) 92%,
      rgba(253,252,252,.95) 100%);
    pointer-events:none;
  }
  /* Subtle top softening so the image doesn’t hit the top edge hard */
  .art-cover::before{
    content:'';
    position:absolute; left:0; right:0; top:0; height:9vh;
    background: linear-gradient(to bottom, rgba(253,252,252,.20), transparent 70%);
    pointer-events:none;
  }

  /* A narrow, blurred “seam” band to guarantee no visible column
     regardless of background hues on the right. */
  .seam-veil{
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2; /* above art, below card */
    background:
      linear-gradient(90deg,
        transparent 46%,
        rgba(255,255,255,.10) 50%,
        rgba(255,255,255,.16) 54%,
        rgba(255,255,255,.18) 58%,
        rgba(255,255,255,.12) 62%,
        transparent 68%);
    backdrop-filter: blur(3px);
    mix-blend-mode: soft-light;
  }

  .bottom-haze{
    position: fixed;
    left: 0; right: 0; bottom: 0; height: 120px;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,.06));
    pointer-events:none;
    z-index: 3;
  }

  @keyframes fadeUp { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform:none } }
</style>
