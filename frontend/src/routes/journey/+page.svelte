<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import { goto } from '$app/navigation';

  export let data: { user: { id: number; email?: string } | null };

  interface Module {
    id: string;
    name: string;
    color: string;
    completed: boolean;
    requiresPhoto?: string;
  }

  let modules: Module[] = [];
  let level = 1;
  let completionPercent = 0;
  let loading = true;

  // Define the journey modules based on the design
  const journeyModules: Module[] = [
    { id: '1', name: 'Emotion Recognition', color: 'blue', completed: false },
    { id: '2', name: 'Surprise Training', color: 'yellow', completed: false, requiresPhoto: 'surprise' },
    { id: '3', name: 'Emotional Transitions', color: 'green', completed: false },
    { id: '4', name: 'Pop Timed Quiz', color: 'blue', completed: false },
    { id: '5', name: 'Fear vs. Surprise Primer & Fear Training', color: 'green', completed: false, requiresPhoto: 'fear' },
    { id: '6', name: 'Surprise vs. Fear Speed Test', color: 'yellow', completed: false },
    { id: '7', name: 'Mirroring & Empathy', color: 'green', completed: false },
    { id: '8', name: 'Memory Game/ Test Fear & Surprise', color: 'lightblue', completed: false },
    { id: '9', name: 'Emotion Recognition', color: 'blue', completed: false },
    { id: '10', name: 'Sad Training', color: 'yellow', completed: false, requiresPhoto: 'sad' },
    { id: '11', name: 'Emotional Transitions', color: 'green', completed: false },
    { id: '12', name: 'Memory Game/ Test Fear & Surprise', color: 'lightblue', completed: false },
    { id: '13', name: 'Level 2 Time Test', color: 'red', completed: false },
  ];

  onMount(async () => {
    // Load user's progress from backend
    try {
      const res = await apiFetch('/api/user/progress');
      const progressData = await res.json();
      if (progressData.ok) {
        level = progressData.level || 1;
        completionPercent = progressData.completionPercent || 0;
        // Mark completed modules
        if (progressData.completedModules) {
          modules = journeyModules.map(m => ({
            ...m,
            completed: progressData.completedModules.includes(m.id)
          }));
        } else {
          modules = journeyModules;
        }
      } else {
        modules = journeyModules;
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
      modules = journeyModules;
    } finally {
      loading = false;
    }
  });

  function getColorClass(color: string): string {
    const colors: Record<string, string> = {
      blue: '#3b82f6',
      yellow: '#eab308',
      green: '#22c55e',
      lightblue: '#06b6d4',
      red: '#ef4444'
    };
    return colors[color] || colors.blue;
  }

  function getPuzzleShape(index: number): string {
    const shapes = ['H', 'C', 'L'];
    return shapes[index % 3];
  }
</script>

<svelte:head>
  <title>{data?.user?.email ? `${data.user.email.split('@')[0]}'s Journey` : 'Journey'} • AboutFace</title>
</svelte:head>

<style>
  /* Blob background from global /style.css (loaded in app.html) */

  .journey-container {
    min-height: 100vh;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 24px;
    padding-bottom: 80px;
    background: transparent;
    position: relative;
    z-index: 1;
    -webkit-overflow-scrolling: touch;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
  }

  .journey-title {
    font-family: 'Georgia', serif;
    font-size: 2.5rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
    margin-bottom: 16px;
  }

  .level-info {
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 6px;
    text-shadow: 0 1px 2px rgba(255,255,255,0.8);
  }

  .completion {
    font-size: 1rem;
    font-weight: 600;
    color: #334155;
    margin-bottom: 12px;
  }

  .progress-bar {
    width: 100%;
    max-width: 400px;
    height: 16px;
    background: rgba(0,0,0,0.15);
    border-radius: 9999px;
    overflow: hidden;
    margin: 0 auto 32px;
    border: 2px solid rgba(255,255,255,0.4);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5, #22d3ee);
    border-radius: 9999px;
    transition: width 0.3s ease;
    box-shadow: 0 0 12px rgba(79,70,229,0.5);
  }

  .modules-path {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: 600px;
    margin: 0 auto;
    position: relative;
  }

  .module-item {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    position: relative;
  }

  .puzzle-piece {
    width: 80px;
    height: 80px;
    min-width: 80px;
    min-height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 24px;
    color: white;
    text-shadow: 0 2px 4px rgba(0,0,0,0.4);
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    clip-path: polygon(
      0% 20%, 20% 0%, 80% 0%, 100% 20%,
      100% 80%, 80% 100%, 20% 100%, 0% 80%
    );
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    border: 3px solid rgba(255,255,255,0.5);
  }

  .puzzle-piece:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 20px rgba(0,0,0,0.35);
  }

  .puzzle-piece.completed {
    opacity: 1;
    box-shadow: 0 0 0 3px rgba(34,197,94,0.8), 0 4px 12px rgba(0,0,0,0.25);
  }

  .puzzle-piece.completed::after {
    content: '✓';
    position: absolute;
    bottom: 4px;
    right: 6px;
    font-size: 14px;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  .module-name {
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
    color: #111;
    padding: 12px 16px;
    background: rgba(255,255,255,0.9);
    border-radius: 12px;
    border: 2px solid rgba(17,17,17,0.1);
  }

  .connector {
    width: 2px;
    height: 16px;
    background: #f97316;
    border-left: 2px dashed #f97316;
    margin: 0 auto;
  }

  .photo-requirement {
    font-size: 0.75rem;
    color: #ef4444;
    font-style: italic;
    margin-top: 4px;
  }

  .home-btn {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 9999px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(79,70,229,.3);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .home-btn:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 12px 28px rgba(79,70,229,.4);
  }

  .blobs {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="journey-container">
  <div class="header">
    <h1 class="journey-title">
      {data?.user?.email ? `${data.user.email.split('@')[0]}'s AboutFace™ Journey` : 'Your AboutFace™ Journey'}
    </h1>
    <div class="level-info">Level - {level}</div>
    <div class="completion">{completionPercent}% Complete</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {completionPercent}%"></div>
    </div>
  </div>

  {#if loading}
    <div style="text-align: center; color: #6b7280;">Loading journey...</div>
  {:else}
    <div class="modules-path">
      {#each modules as module, index}
        <div class="module-item">
          <div
            class="puzzle-piece {module.completed ? 'completed' : ''}"
            style="background: {getColorClass(module.color)}"
            title={module.name}
          >
            {getPuzzleShape(index)}
          </div>
          <div class="module-name">
            {module.name}
            {#if module.requiresPhoto}
              <div class="photo-requirement">
                "passing" this module requires a verified {module.requiresPhoto} photo upon exiting training
              </div>
            {/if}
          </div>
        </div>
        {#if index < modules.length - 1}
          <div class="connector"></div>
        {/if}
      {/each}
    </div>
  {/if}

  <button class="home-btn" on:click={() => goto('/dashboard')}>Home</button>
</div>
