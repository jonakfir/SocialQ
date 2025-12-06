<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  export let data: {
    user: { id: number; email?: string } | null;
    friend: { id: string; username: string } | null;
    collages: any[];
  };

  let collages = data?.collages || [];

  // Organize collages by emotion
  const EMOTIONS = ['Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise'];
  
  function groupByEmotion(collages: any[]) {
    const groups: Record<string, any[]> = {};
    
    // Initialize all emotion groups
    EMOTIONS.forEach(emotion => {
      groups[emotion] = [];
    });
    groups['All'] = [];
    
    collages.forEach(collage => {
      // Add to "All" category
      groups['All'].push(collage);
      
      // Add to each emotion category if the collage contains that emotion
      if (collage.emotions && Array.isArray(collage.emotions)) {
        collage.emotions.forEach((emotion: string) => {
          const normalizedEmotion = emotion.charAt(0).toUpperCase() + emotion.slice(1).toLowerCase();
          if (groups[normalizedEmotion]) {
            groups[normalizedEmotion].push(collage);
          }
        });
      }
    });
    
    return groups;
  }

  let selectedEmotion = 'All';
  $: groupedCollages = groupByEmotion(collages);
  $: currentCollages = groupedCollages[selectedEmotion] || [];

  function goBack() {
    if (data?.friend?.id) {
      goto(`/friends/${data.friend.id}`);
    } else {
      goto('/friends');
    }
  }
</script>

<style>
  .container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100vw;
    position: relative;
    z-index: 2;
    padding: 40px 20px;
    align-items: center;
  }

  .content {
    max-width: 1200px;
    width: 100%;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    z-index: 3;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 30px;
  }

  h1 {
    font-family: 'Georgia', serif;
    font-size: 2.5rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
    margin: 0;
  }

  .back-btn {
    padding: 12px 24px;
    border-radius: 20px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    background: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    transition: all 0.2s ease;
    color: black;
    text-decoration: none;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 1);
    transform: translateY(-1px);
  }

  .emotion-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 2px solid rgba(0, 0, 0, 0.1);
  }

  .emotion-tab {
    padding: 12px 24px;
    border-radius: 24px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    background: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    transition: all 0.2s ease;
  }

  .emotion-tab:hover {
    background: rgba(255, 255, 255, 0.95);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .emotion-tab.active {
    background: #4f46e5;
    color: white;
    border-color: #4f46e5;
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
  }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 24px;
    padding: 20px 0;
  }

  .photo-item {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    aspect-ratio: 1;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    background: rgba(0, 0, 0, 0.05);
  }

  .photo-item:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: rgba(0, 0, 0, 0.6);
    font-size: 18px;
    font-weight: 500;
  }

  .blobs {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }

  .friend-name {
    font-size: 1.2rem;
    color: rgba(0, 0, 0, 0.7);
    margin-bottom: 8px;
    text-align: center;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="content">
    <div class="header">
      <div>
        <h1>Saved Photos</h1>
        {#if data?.friend}
          <div class="friend-name">{data.friend.username}'s Photos</div>
        {/if}
      </div>
      <button class="back-btn" on:click={goBack}>← Back</button>
    </div>

    {#if !data?.friend}
      <div class="empty-state">
        Friend not found or you're not friends with this user.
      </div>
    {:else if collages.length === 0}
      <div class="empty-state">
        {data.friend.username} hasn't saved any photos yet.
      </div>
    {:else}
      <div class="emotion-tabs">
        {#each ['All', ...EMOTIONS] as emotion}
          <button
            class="emotion-tab"
            class:active={selectedEmotion === emotion}
            on:click={() => selectedEmotion = emotion}
          >
            {emotion}
            {#if emotion !== 'All'}
              <span style="opacity: 0.8; margin-left: 6px;">
                ({groupedCollages[emotion]?.length || 0})
              </span>
            {/if}
          </button>
        {/each}
      </div>

      {#if currentCollages.length === 0}
        <div class="empty-state">
          {selectedEmotion === 'All' 
            ? "No saved photos yet." 
            : `No ${selectedEmotion.toLowerCase()} photos yet.`}
        </div>
      {:else}
        <div class="photos-grid">
          {#each currentCollages as collage}
            <div class="photo-item">
              <img src={collage.imageUrl} alt="Friend's collage" />
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

