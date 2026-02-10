<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    getTodayDate,
    getUserIdForDaily,
    hasPlayed,
    markPlayed,
    setPendingGame,
    type DailyGameId
  } from '$lib/dailyFreePlay';

  const EMOTIONS = ['Happiness', 'Sadness', 'Anger', 'Fear', 'Surprise', 'Disgust'] as const;
  const DIFF_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Expert', 5: 'Timed' };

  /** Date-seeded "random" for today's difficulty/emotion (matches iOS idea) */
  function seededFromDate(dateStr: string): { facialDifficulty: number; emotion: string } {
    let h = 0;
    for (let i = 0; i < dateStr.length; i++) h = (Math.imul(31, h) + dateStr.charCodeAt(i)) | 0;
    const seed = Math.abs(h);
    const facialDifficulty = (seed % 4) + 1; // 1–4
    const emotion = EMOTIONS[seed % EMOTIONS.length];
    return { facialDifficulty, emotion };
  }

  const today = getTodayDate();
  const userId = getUserIdForDaily();
  const { facialDifficulty, emotion } = seededFromDate(today);

  const GAMES: { id: DailyGameId; label: string; subtitle: string; href: string }[] = [
    {
      id: 'facial_recognition',
      label: 'Facial Recognition',
      subtitle: DIFF_LABELS[facialDifficulty] || 'Medium',
      href: `/facial-recognition/quiz/${facialDifficulty}`
    },
    {
      id: 'transition_recognition',
      label: 'Transition Recognition',
      subtitle: 'Normal',
      href: '/transition-recognition/quiz/Normal'
    },
    {
      id: 'emotion_training',
      label: 'Emotion Training',
      subtitle: emotion,
      href: `/training/${encodeURIComponent(emotion)}?coach=true`
    },
    {
      id: 'mirroring',
      label: 'Mirroring Game',
      subtitle: 'Mirror the face',
      href: '/mirroring/settings'
    }
  ];

  function playGame(game: (typeof GAMES)[0]) {
    setPendingGame(game.id);
    goto(game.href);
  }

  $: played = (id: DailyGameId) => hasPlayed(today, userId, id);
</script>

<svelte:head>
  <title>Daily Free Play • AboutFace</title>
</svelte:head>

<style>
  .stage {
    position: fixed;
    inset: 0;
    z-index: 10;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    background-image: linear-gradient(
      180deg,
      rgba(15, 20, 46, 0.5) 0%,
      rgba(26, 31, 71, 0.55) 50%,
      rgba(15, 20, 46, 0.5) 100%
    ), url('/web.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .inner {
    width: 100%;
    max-width: 480px;
    padding: clamp(60px, 12vh, 120px) 24px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }

  .back {
    align-self: flex-start;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 1.0625rem;
    font-weight: 600;
    cursor: pointer;
    padding: 8px 0;
  }
  .back:hover { text-decoration: underline; }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    margin: 0;
  }

  .subtitle {
    font-size: 0.9375rem;
    color: rgba(255, 255, 255, 0.8);
    text-align: center;
    margin: 0;
    padding: 0 16px;
    line-height: 1.4;
  }

  .list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    border-radius: 16px;
    background: rgba(26, 31, 71, 0.85);
    border: 1px solid rgba(115, 166, 242, 0.35);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .row:hover:not(.played) {
    background: rgba(26, 31, 71, 0.95);
    border-color: rgba(115, 166, 242, 0.55);
  }
  .row.played {
    cursor: default;
    opacity: 0.9;
  }

  .row-text {
    flex: 1;
    text-align: left;
  }
  .row-title {
    font-size: 1.0625rem;
    font-weight: 600;
    color: #fff;
    margin: 0 0 4px;
  }
  .row-sub {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.75);
    margin: 0;
  }

  .row-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check {
    font-size: 1.5rem;
    line-height: 1;
  }
  .check.green {
    color: #22c55e;
  }
  .played-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
  }
  .play-label {
    font-size: 1rem;
    font-weight: 700;
    color: #73a6f2;
  }
  .chevron {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
  }
</style>

<div class="stage">
  <div class="inner">
    <button type="button" class="back" on:click={() => goto('/dashboard')}>← Back</button>

    <h1 class="title">Daily Free Play</h1>
    <p class="subtitle">Play each game once per day. New random difficulties each day!</p>

    <div class="list">
      {#each GAMES as game}
        {@const isPlayed = played(game.id)}
        <button
          type="button"
          class="row"
          class:played={isPlayed}
          on:click={() => !isPlayed && playGame(game)}
          disabled={isPlayed}
        >
          <div class="row-text">
            <p class="row-title">{game.label}</p>
            <p class="row-sub">{game.subtitle}</p>
          </div>
          <div class="row-right">
            {#if isPlayed}
              <span class="check green" aria-hidden="true">✓</span>
              <span class="played-label">Played</span>
            {:else}
              <span class="play-label">Play</span>
              <span class="chevron">›</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>
