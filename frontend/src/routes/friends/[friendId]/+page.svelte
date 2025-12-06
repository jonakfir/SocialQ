<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  export let data: {
    user: { id: number; email?: string } | null;
    friend: { id: string; username: string } | null;
    collages: any[];
    stats: any;
  };

  function initialFromEmail(email: string): string {
    if (!email) return '?';
    const local = email.includes('@') ? email.split('@')[0] : email;
    const ch = local.trim().charAt(0);
    return ch ? ch.toUpperCase() : '?';
  }

  function goBack() {
    goto('/friends');
  }

  function viewPhotos() {
    goto(`/friends/${data.friend?.id}/photos`);
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
    max-width: 900px;
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
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 1);
    transform: translateY(-1px);
  }

  .profile-section {
    text-align: center;
    margin-bottom: 40px;
  }

  .avatar {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 4px solid white;
    display: grid;
    place-items: center;
    font-size: 46px;
    font-weight: 900;
    margin: 0 auto 20px;
    background: linear-gradient(135deg, rgba(255,182,193,1), rgba(186,225,255,1));
    color: white;
  }

  .username {
    font-size: 1.8rem;
    font-weight: 700;
    color: black;
    margin-bottom: 16px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.8);
    padding: 20px;
    border-radius: 12px;
    border: 2px solid rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  .stat-label {
    font-size: 14px;
    color: rgba(0, 0, 0, 0.6);
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 900;
    color: #4f46e5;
  }

  .action-buttons {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-bottom: 32px;
  }

  .btn {
    padding: 12px 24px;
    border-radius: 20px;
    border: 2px solid #4f46e5;
    background: #4f46e5;
    color: white;
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: #4338ca;
    transform: translateY(-1px);
  }

  .photos-preview {
    margin-top: 32px;
  }

  .photos-preview h3 {
    font-size: 1.5rem;
    margin-bottom: 16px;
    color: black;
  }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
  }

  .photo-preview {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
  }

  .photo-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: rgba(0, 0, 0, 0.6);
    font-size: 18px;
  }

  .blobs {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
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
      <h1>Friend Profile</h1>
      <button class="back-btn" on:click={goBack}>← Back to Friends</button>
    </div>

    {#if !data?.friend}
      <div class="empty-state">Friend not found or you're not friends with this user.</div>
    {:else}
      <div class="profile-section">
        <div class="avatar">
          {initialFromEmail(data.friend.username)}
        </div>
        <div class="username">{data.friend.username}</div>

        {#if data.stats}
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Saved Photos</div>
              <div class="stat-value">{data.stats.savedPhotos || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Member Since</div>
              <div class="stat-value" style="font-size: 14px;">
                {new Date(data.stats.joinedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        {/if}

        <div class="action-buttons">
          <button class="btn" on:click={viewPhotos}>View Saved Photos</button>
        </div>
      </div>

      {#if data.collages && data.collages.length > 0}
        <div class="photos-preview">
          <h3>Recent Photos ({data.collages.length})</h3>
          <div class="photos-grid">
            {#each data.collages.slice(0, 9) as collage}
              <div class="photo-preview" on:click={viewPhotos}>
                <img src={collage.imageUrl} alt="Friend's collage" />
              </div>
            {/each}
          </div>
          {#if data.collages.length > 9}
            <button class="btn" on:click={viewPhotos} style="margin-top: 16px;">
              View All {data.collages.length} Photos
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

