// Feelings Wheel — 3-tier emotion taxonomy
// Tier 1: Core (7 base emotions)
// Tier 2: Mid-level (named clusters under each core)
// Tier 3: Granular (specific nuanced emotions)
//
// Color palette matches the CTFOD Feelings Wheel:
//   Yellow → Happy family
//   Blue   → Sad family
//   Red    → Angry family
//   Purple → Fearful family
//   Green  → Disgusted family
//   Orange → Surprised family
//   Grey   → Bad family

export interface Emotion {
  id: string;
  label: string;
  tier: 1 | 2 | 3;
  parent?: string;
  emoji: string;
  color: string; // CSS hex — used for card accent + wheel visualization
}

export const EMOTIONS: Emotion[] = [
  // ── Tier 1: Core ────────────────────────────────────────────
  { id: 'happy',     label: 'Happy',     tier: 1, emoji: '😄', color: '#FFD700' },
  { id: 'sad',       label: 'Sad',       tier: 1, emoji: '😢', color: '#4A90D9' },
  { id: 'angry',     label: 'Angry',     tier: 1, emoji: '😠', color: '#E74C3C' },
  { id: 'fearful',   label: 'Fearful',   tier: 1, emoji: '😨', color: '#9B59B6' },
  { id: 'disgusted', label: 'Disgusted', tier: 1, emoji: '🤢', color: '#27AE60' },
  { id: 'surprised', label: 'Surprised', tier: 1, emoji: '😲', color: '#F39C12' },
  { id: 'bad',       label: 'Bad',       tier: 1, emoji: '😞', color: '#7F8C8D' },

  // ── Tier 2: Mid-level ───────────────────────────────────────
  // Happy family
  { id: 'joyful',    label: 'Joyful',    tier: 2, parent: 'happy', emoji: '😂', color: '#FFE066' },
  { id: 'content',   label: 'Content',   tier: 2, parent: 'happy', emoji: '😊', color: '#FFEC8B' },
  { id: 'peaceful',  label: 'Peaceful',  tier: 2, parent: 'happy', emoji: '😌', color: '#FFF2CC' },
  { id: 'proud',     label: 'Proud',     tier: 2, parent: 'happy', emoji: '🥹', color: '#FFD700' },
  { id: 'grateful',  label: 'Grateful',  tier: 2, parent: 'happy', emoji: '🤗', color: '#FFD966' },
  { id: 'inspired',  label: 'Inspired',  tier: 2, parent: 'happy', emoji: '🌟', color: '#FFE599' },
  // Sad family
  { id: 'lonely',    label: 'Lonely',    tier: 2, parent: 'sad', emoji: '🥺', color: '#6FA8DC' },
  { id: 'depressed', label: 'Depressed', tier: 2, parent: 'sad', emoji: '😔', color: '#3D85C8' },
  { id: 'hurt',      label: 'Hurt',      tier: 2, parent: 'sad', emoji: '😣', color: '#2E6DA4' },
  { id: 'hopeless',  label: 'Hopeless',  tier: 2, parent: 'sad', emoji: '😿', color: '#1F5180' },
  // Angry family
  { id: 'furious',     label: 'Furious',     tier: 2, parent: 'angry', emoji: '🤬', color: '#CC0000' },
  { id: 'frustrated',  label: 'Frustrated',  tier: 2, parent: 'angry', emoji: '😤', color: '#E06666' },
  { id: 'hostile',     label: 'Hostile',     tier: 2, parent: 'angry', emoji: '😡', color: '#FF6D6D' },
  { id: 'humiliated',  label: 'Humiliated',  tier: 2, parent: 'angry', emoji: '😖', color: '#EA9999' },
  // Fearful family
  { id: 'anxious',      label: 'Anxious',      tier: 2, parent: 'fearful', emoji: '😰', color: '#C27BA0' },
  { id: 'overwhelmed',  label: 'Overwhelmed',  tier: 2, parent: 'fearful', emoji: '😵', color: '#A64D79' },
  { id: 'insecure',     label: 'Insecure',     tier: 2, parent: 'fearful', emoji: '😟', color: '#B4A0FF' },
  // Disgusted family
  { id: 'revolted',  label: 'Revolted',  tier: 2, parent: 'disgusted', emoji: '🤮', color: '#38761D' },
  { id: 'judgmental',label: 'Judgmental',tier: 2, parent: 'disgusted', emoji: '🧐', color: '#6AA84F' },
  // Surprised family
  { id: 'amazed',   label: 'Amazed',   tier: 2, parent: 'surprised', emoji: '🤩', color: '#F6B26B' },
  { id: 'confused', label: 'Confused', tier: 2, parent: 'surprised', emoji: '😕', color: '#FFB347' },
  { id: 'excited',  label: 'Excited',  tier: 2, parent: 'surprised', emoji: '🤸', color: '#FF9900' },
  // Bad family
  { id: 'bored',   label: 'Bored',   tier: 2, parent: 'bad', emoji: '😑', color: '#999999' },
  { id: 'ashamed', label: 'Ashamed', tier: 2, parent: 'bad', emoji: '😳', color: '#B7B7B7' },
  { id: 'tired',   label: 'Tired',   tier: 2, parent: 'bad', emoji: '😪', color: '#888888' },

  // ── Tier 3: Granular ────────────────────────────────────────
  // Under joyful
  { id: 'overjoyed',  label: 'Overjoyed',  tier: 3, parent: 'joyful', emoji: '🥳', color: '#FFD700' },
  { id: 'delighted',  label: 'Delighted',  tier: 3, parent: 'joyful', emoji: '😁', color: '#FFE599' },
  { id: 'elated',     label: 'Elated',     tier: 3, parent: 'joyful', emoji: '😆', color: '#FFE066' },
  // Under content
  { id: 'amused',    label: 'Amused',    tier: 3, parent: 'content', emoji: '😄', color: '#FFD966' },
  { id: 'relieved',  label: 'Relieved',  tier: 3, parent: 'content', emoji: '😅', color: '#FFEC8B' },
  // Under peaceful
  { id: 'hopeful',   label: 'Hopeful',   tier: 3, parent: 'peaceful', emoji: '🌈', color: '#FFF2CC' },
  { id: 'serene',    label: 'Serene',    tier: 3, parent: 'peaceful', emoji: '🧘', color: '#D9EAD3' },
  // Under lonely
  { id: 'abandoned',   label: 'Abandoned',   tier: 3, parent: 'lonely', emoji: '😿', color: '#9FC5E8' },
  { id: 'isolated',    label: 'Isolated',    tier: 3, parent: 'lonely', emoji: '🏝️', color: '#6FA8DC' },
  // Under furious
  { id: 'enraged',  label: 'Enraged',  tier: 3, parent: 'furious', emoji: '🔥', color: '#990000' },
  { id: 'bitter',   label: 'Bitter',   tier: 3, parent: 'furious', emoji: '😒', color: '#CC4125' },
  // Under frustrated
  { id: 'annoyed',   label: 'Annoyed',   tier: 3, parent: 'frustrated', emoji: '😒', color: '#E06666' },
  { id: 'impatient', label: 'Impatient', tier: 3, parent: 'frustrated', emoji: '⏰', color: '#EA9999' },
  // Under anxious
  { id: 'worried',   label: 'Worried',   tier: 3, parent: 'anxious', emoji: '😟', color: '#C27BA0' },
  { id: 'terrified', label: 'Terrified', tier: 3, parent: 'anxious', emoji: '😱', color: '#741B47' },
  // Under amazed
  { id: 'astonished', label: 'Astonished', tier: 3, parent: 'amazed', emoji: '🤯', color: '#F6B26B' },
  { id: 'awestruck',  label: 'Awestruck',  tier: 3, parent: 'amazed', emoji: '😯', color: '#F9CB9C' },
];

export const emotionById = Object.fromEntries(EMOTIONS.map(e => [e.id, e]));

export function emotionsByTier(tiers: (1|2|3)[]): Emotion[] {
  return EMOTIONS.filter(e => tiers.includes(e.tier));
}
