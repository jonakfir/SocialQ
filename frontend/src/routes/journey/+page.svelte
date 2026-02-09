<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import { goto } from '$app/navigation';

  export let data: { user: { id: number; email?: string } | null };

  type PuzzleShape = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
  type TaskType = 'facial_recognition' | 'transition_recognition' | 'emotion_training' | 'mirroring' | 'timed_quiz';

  interface JourneyTask {
    id: string;
    type: TaskType;
    title: string;
    description: string;
    difficulty: number | null;
    level: string | null;
    emotion: string | null;
    webModuleId: string | null;
    requiredScore: number;
    completed: boolean;
  }

  interface JourneyStage {
    id: string;
    name: string;
    description: string;
    color: string;
    puzzleShape: PuzzleShape;
    tasks: JourneyTask[];
    unlocked: boolean;
    completed: boolean;
  }

  // Same stages and tasks as mobile JourneyView createDefaultStages
  const STAGES: Array<{
    id: string;
    name: string;
    description: string;
    color: string;
    puzzleShape: PuzzleShape;
    tasks: Omit<JourneyTask, 'completed'>[];
  }> = [
    {
      id: 'stage_1',
      name: 'Foundation',
      description: 'Master the basics of emotion recognition',
      color: '#3B82F6',
      puzzleShape: 'topLeft',
      tasks: [
        { id: 'task_1_1', type: 'facial_recognition', title: 'Facial Recognition Level 1', description: 'Identify basic emotions', difficulty: 1, level: null, emotion: null, webModuleId: '1', requiredScore: 60 },
        { id: 'task_1_2', type: 'transition_recognition', title: 'Transition Recognition Basic', description: 'Simple emotion transitions', difficulty: null, level: 'basic', emotion: null, webModuleId: '3', requiredScore: 65 },
        { id: 'task_1_3', type: 'emotion_training', title: 'Happy Emotion Training', description: 'Practice recognizing happiness', difficulty: null, level: null, emotion: 'Happy', webModuleId: null, requiredScore: 70 },
      ],
    },
    {
      id: 'stage_2',
      name: 'Building Blocks',
      description: 'Expand your recognition skills',
      color: '#10B981',
      puzzleShape: 'topRight',
      tasks: [
        { id: 'task_2_1', type: 'facial_recognition', title: 'Facial Recognition Level 2', description: 'Medium difficulty', difficulty: 2, level: null, emotion: null, webModuleId: '1', requiredScore: 65 },
        { id: 'task_2_2', type: 'transition_recognition', title: 'Transition Intermediate', description: 'More complex transitions', difficulty: null, level: 'intermediate', emotion: null, webModuleId: '4', requiredScore: 70 },
        { id: 'task_2_3', type: 'emotion_training', title: 'Surprise Emotion Training', description: 'Master surprise recognition', difficulty: null, level: null, emotion: 'Surprise', webModuleId: '2', requiredScore: 70 },
        { id: 'task_2_4', type: 'mirroring', title: 'Mirroring Basics', description: 'Learn to mirror emotions', difficulty: null, level: null, emotion: null, webModuleId: '7', requiredScore: 65 },
      ],
    },
    {
      id: 'stage_3',
      name: 'Mastery',
      description: 'Advanced emotion recognition',
      color: '#F59E0B',
      puzzleShape: 'bottomLeft',
      tasks: [
        { id: 'task_3_1', type: 'facial_recognition', title: 'Facial Recognition Level 3', description: 'Hard difficulty', difficulty: 3, level: null, emotion: null, webModuleId: '1', requiredScore: 70 },
        { id: 'task_3_2', type: 'transition_recognition', title: 'Transition Advanced', description: 'Complex transitions', difficulty: null, level: 'advanced', emotion: null, webModuleId: '6', requiredScore: 75 },
        { id: 'task_3_3', type: 'emotion_training', title: 'Fear Emotion Training', description: 'Master fear recognition', difficulty: null, level: null, emotion: 'Fear', webModuleId: '5', requiredScore: 75 },
        { id: 'task_3_4', type: 'mirroring', title: 'Mirroring Intermediate', description: 'Intermediate mirroring', difficulty: null, level: null, emotion: null, webModuleId: '7', requiredScore: 70 },
        { id: 'task_3_5', type: 'timed_quiz', title: 'Timed Quiz Level 3', description: 'Speed and accuracy', difficulty: 3, level: null, emotion: null, webModuleId: '1', requiredScore: 75 },
      ],
    },
    {
      id: 'stage_4',
      name: 'Expertise',
      description: 'Expert-level recognition',
      color: '#8B5CF6',
      puzzleShape: 'bottomRight',
      tasks: [
        { id: 'task_4_1', type: 'facial_recognition', title: 'Facial Recognition Level 4', description: 'Very hard', difficulty: 4, level: null, emotion: null, webModuleId: '9', requiredScore: 75 },
        { id: 'task_4_2', type: 'transition_recognition', title: 'Transition Expert', description: 'Expert-level transitions', difficulty: null, level: 'expert', emotion: null, webModuleId: '8', requiredScore: 80 },
        { id: 'task_4_3', type: 'emotion_training', title: 'Sad Emotion Training', description: 'Master sadness recognition', difficulty: null, level: null, emotion: 'Sad', webModuleId: '10', requiredScore: 80 },
        { id: 'task_4_4', type: 'mirroring', title: 'Mirroring Advanced', description: 'Advanced mirroring', difficulty: null, level: null, emotion: null, webModuleId: '7', requiredScore: 75 },
        { id: 'task_4_5', type: 'timed_quiz', title: 'Timed Quiz Level 4', description: 'Expert speed', difficulty: 4, level: null, emotion: null, webModuleId: '9', requiredScore: 80 },
      ],
    },
    {
      id: 'stage_5',
      name: 'Perfection',
      description: 'Master-level recognition',
      color: '#FBBF24',
      puzzleShape: 'center',
      tasks: [
        { id: 'task_5_1', type: 'facial_recognition', title: 'Facial Recognition Level 5', description: 'Master with time limit', difficulty: 5, level: null, emotion: null, webModuleId: '13', requiredScore: 85 },
        { id: 'task_5_2', type: 'transition_recognition', title: 'Transition Master', description: 'Master-level transitions', difficulty: null, level: 'master', emotion: null, webModuleId: '11', requiredScore: 85 },
        { id: 'task_5_3', type: 'emotion_training', title: 'Anger Emotion Training', description: 'Master anger recognition', difficulty: null, level: null, emotion: 'Anger', webModuleId: null, requiredScore: 85 },
        { id: 'task_5_4', type: 'mirroring', title: 'Mirroring Expert', description: 'Expert mirroring', difficulty: null, level: null, emotion: null, webModuleId: '7', requiredScore: 85 },
        { id: 'task_5_5', type: 'timed_quiz', title: 'Challenge Mode', description: 'Ultimate speed test', difficulty: 5, level: null, emotion: null, webModuleId: '13', requiredScore: 90 },
      ],
    },
  ];

  let stages: JourneyStage[] = [];
  let level = 1;
  let completionPercent = 0;
  let loading = true;
  let expandedStageId: string | null = null;

  onMount(async () => {
    // Always show stages (from STAGES) so the page is never broken
    const applyProgress = (progress: { completedModules?: string[]; level?: number; completionPercent?: number }) => {
      const completedSet = new Set<string>(progress?.completedModules || []);
      level = progress?.level ?? 1;
      completionPercent = progress?.completionPercent ?? 0;
      stages = STAGES.map((stage, stageIndex) => {
        const tasks: JourneyTask[] = stage.tasks.map((t) => ({
          ...t,
          completed: t.webModuleId ? completedSet.has(t.webModuleId) : false,
        }));
        const completed = tasks.every((t) => t.completed);
        const prevCompleted = stageIndex === 0 || STAGES[stageIndex - 1].tasks.every((t) =>
          t.webModuleId ? completedSet.has(t.webModuleId) : false
        );
        const unlocked = stageIndex === 0 || prevCompleted;
        return {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          color: stage.color,
          puzzleShape: stage.puzzleShape,
          tasks,
          completed,
          unlocked,
        } as JourneyStage;
      });
    };

    try {
      const res = await apiFetch('/api/user/progress');
      const progress = await res.json();
      if (progress?.ok !== false) {
        applyProgress(progress);
      } else {
        applyProgress({});
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
      applyProgress({});
    } finally {
      loading = false;
    }
  });

  function taskHref(task: JourneyTask): string {
    switch (task.type) {
      case 'facial_recognition':
        return `/facial-recognition/quiz/${task.difficulty ?? 1}`;
      case 'timed_quiz':
        return `/facial-recognition/quiz/${task.difficulty ?? 5}`;
      case 'transition_recognition': {
        const level = (task.level || 'basic').toLowerCase();
        return `/transition-recognition/quiz/${level}`;
      }
      case 'emotion_training': {
        const emotion = (task.emotion || 'Happiness').toLowerCase();
        const path: Record<string, string> = {
          happy: 'Happiness',
          happiness: 'Happiness',
          surprise: 'Surprise',
          fear: 'Fear',
          sad: 'Sadness',
          sadness: 'Sadness',
          anger: 'Anger',
          angry: 'Anger',
          disgust: 'Disgust',
        };
        const slug = path[emotion] || 'Happiness';
        return `/training/${slug}`;
      }
      case 'mirroring':
        return '/mirroring/mirroring';
      default:
        return '/dashboard';
    }
  }

  function toggleStage(id: string) {
    expandedStageId = expandedStageId === id ? null : id;
  }

  function diagonalClass(index: number): string {
    return index % 2 === 0 ? 'diagonal-left' : 'diagonal-right';
  }

  // Map iOS puzzle shapes to your puzzle piece PNGs (4 assets → 5 shapes)
  const PUZZLE_IMAGES: Record<PuzzleShape, string> = {
    topLeft: '/puzzle-piece.png',
    topRight: '/puzzle-piece-alt.png',
    bottomLeft: '/puzzle.png',
    bottomRight: '/puzzle-piece-icon.png',
    center: '/puzzle-piece.png',
  };
</script>

<svelte:head>
  <title>{data?.user?.email ? `${data.user.email.split('@')[0]}'s Journey` : 'Journey'} • AboutFace</title>
</svelte:head>

<style>
  .journey-container {
    height: 100vh;
    min-height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 24px;
    padding-bottom: 100px;
    background: transparent;
    position: relative;
    z-index: 1;
    -webkit-overflow-scrolling: touch;
  }

  .header {
    text-align: center;
    margin-bottom: 28px;
  }

  .journey-title {
    font-family: Georgia, serif;
    font-size: clamp(1.5rem, 5vw, 2.25rem);
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 8px 12px rgba(0,0,0,0.4);
    margin-bottom: 12px;
  }

  .level-info, .completion {
    font-size: 1rem;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .progress-bar {
    width: 100%;
    max-width: 360px;
    height: 8px;
    background: rgba(148, 163, 184, 0.4);
    border-radius: 9999px;
    overflow: hidden;
    margin: 0 auto 32px;
  }

  .progress-fill {
    height: 100%;
    background: #94a3b8;
    border-radius: 9999px;
    transition: width 0.3s ease;
  }

  .path-wrap {
    max-width: 560px;
    margin: 0 auto;
    position: relative;
    padding-left: 24px;
    padding-right: 24px;
  }

  .spine {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 3px;
    background: #ea580c;
    border-radius: 2px;
    transform: translateX(-50%);
    z-index: 0;
  }

  .stage-block {
    position: relative;
  }

  .stage-block.is-open::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 14px;
    transform: translateX(-50%);
    background: rgba(30, 58, 95, 0.75);
    z-index: 1;
    pointer-events: none;
  }

  .stage-row {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .stage-row.diagonal-left {
    flex-direction: row;
    justify-content: flex-start;
    padding-right: 50%;
  }

  .stage-row.diagonal-right {
    flex-direction: row-reverse;
    justify-content: flex-start;
    padding-left: 50%;
  }

  .stage-card {
    display: flex;
    align-items: center;
    gap: 14px;
    max-width: 100%;
    cursor: pointer;
    padding: 4px;
    border-radius: 16px;
    transition: background 0.2s;
    background: transparent;
    border: none;
    -webkit-tap-highlight-color: transparent;
    tap-highlight-color: transparent;
  }

  .stage-card:hover {
    background: rgba(255,255,255,0.06);
  }

  .stage-card:active,
  .stage-card:focus {
    background: rgba(255,255,255,0.06);
    outline: none;
  }

  .stage-card:focus-visible {
    outline: 2px solid rgba(255,255,255,0.5);
    outline-offset: 2px;
  }

  .puzzle-wrap {
    position: relative;
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  }

  .puzzle-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .puzzle-wrap.locked {
    opacity: 0.65;
    filter: grayscale(0.6);
  }

  .puzzle-wrap.locked img {
    opacity: 0.9;
  }

  .puzzle-wrap.completed {
    box-shadow: 0 0 0 3px rgba(34,197,94,0.9), 0 4px 12px rgba(0,0,0,0.25);
  }

  .puzzle-wrap .check {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(34,197,94,0.95);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
  }

  .puzzle-wrap .lock-icon {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 18px;
    line-height: 1;
  }

  .stage-info {
    flex: 1;
    min-width: 0;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }

  .stage-block.is-open .stage-info {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .stage-name {
    font-size: 1rem;
    font-weight: 800;
    color: #111;
    margin-bottom: 2px;
  }

  .stage-desc {
    font-size: 0.8rem;
    color: #64748b;
    margin-bottom: 6px;
  }

  .stage-meta {
    font-size: 0.75rem;
    font-weight: 700;
    color: #475569;
  }

  .connector {
    width: 3px;
    height: 20px;
    background: #ea580c;
    margin: 0 auto 4px;
    border-radius: 2px;
    position: relative;
    z-index: 1;
  }

  .tasks-dropdown {
    max-width: 520px;
    margin: 8px auto 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    position: relative;
    z-index: 2;
  }

  .tasks-dropdown::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 14px;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    z-index: -1;
    pointer-events: none;
    border-radius: 2px;
  }

  .task-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    margin-bottom: 8px;
    border-radius: 12px;
    border: 1px solid rgba(0,0,0,0.08);
    background: #fff;
    color: #111;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.05s;
  }

  .task-item:last-child {
    margin-bottom: 0;
  }

  .task-item:hover {
    background: #f1f5f9;
  }

  .task-item.completed {
    background: rgba(34,197,94,0.1);
    border-color: rgba(34,197,94,0.3);
  }

  .task-item .req {
    font-size: 0.75rem;
    font-weight: 500;
    color: #64748b;
    margin-top: 2px;
  }

  .home-btn {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    padding: 14px 40px;
    background: #3730a3;
    color: white;
    border: none;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .home-btn:hover {
    transform: translateX(-50%) translateY(-2px);
    background: #4f46e5;
    box-shadow: 0 6px 20px rgba(55,48,163,0.4);
  }
</style>

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
    <div style="text-align: center; color: #94a3b8;">Loading journey...</div>
  {:else}
    <div class="path-wrap">
      <div class="spine" aria-hidden="true"></div>

      {#each stages as stage, index}
        <div class="stage-block {expandedStageId === stage.id && stage.unlocked ? 'is-open' : ''}">
          <div class="stage-row {diagonalClass(index)}">
            <button
              type="button"
              class="stage-card"
              on:click={() => stage.unlocked && toggleStage(stage.id)}
              aria-expanded={expandedStageId === stage.id}
              aria-label="{stage.name}, {stage.completed ? 'completed' : ''}"
            >
              <div
                class="puzzle-wrap {stage.completed ? 'completed' : ''} {!stage.unlocked ? 'locked' : ''}"
                style="background: {stage.color}"
              >
                <img
                  src={PUZZLE_IMAGES[stage.puzzleShape]}
                  alt=""
                  role="presentation"
                />
                {#if stage.completed}
                  <span class="check" aria-hidden="true">✓</span>
                {:else if !stage.unlocked}
                  <span class="lock-icon" aria-hidden="true">🔒</span>
                {/if}
              </div>
              <div class="stage-info">
                <div class="stage-name">{stage.name}</div>
                <div class="stage-desc">{stage.description}</div>
                <div class="stage-meta">
                  {stage.tasks.filter(t => t.completed).length}/{stage.tasks.length} tasks
                  {#if stage.completed}
                    · Complete
                  {/if}
                </div>
              </div>
            </button>
          </div>

          {#if expandedStageId === stage.id && stage.unlocked}
            <div class="tasks-dropdown">
              {#each stage.tasks as task}
                <a
                  href={taskHref(task)}
                  class="task-item {task.completed ? 'completed' : ''}"
                >
                  {task.title}
                  <div class="req">Requires {task.requiredScore}% to pass</div>
                </a>
              {/each}
            </div>
          {/if}

          {#if index < stages.length - 1}
            <div class="connector"></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <button class="home-btn" on:click={() => goto('/dashboard')}>Home</button>
</div>
