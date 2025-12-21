<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';

  let loading = true;
  let photos: Array<{
    id: string;
    imageUrl: string;
    emotions: string[] | null;
    folder: string;
    createdAt: string;
    user: { id: string; username: string };
  }> = [];
  
  let totalPhotos = 0;
  let error: string | null = null;
  let deletingPhoto: Record<string, boolean> = {};

  // Filters
  const EMOTIONS = ['All', 'Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise'];
  let selectedEmotion = 'All';
  let selectedUserId = '';
  let selectedOrgId = '';
  let startDate = '';
  let endDate = '';
  
  // Options for filters
  let availableUsers: Array<{ id: string; username: string }> = [];
  let availableOrgs: Array<{ id: string; name: string }> = [];
  let loadingUsers = false;
  let loadingOrgs = false;

  onMount(async () => {
    await Promise.all([loadPhotos(), loadUsers(), loadOrganizations()]);
  });

  async function loadUsers() {
    loadingUsers = true;
    try {
      const res = await apiFetch('/api/admin/users?limit=1000');
      const data = await res.json();
      if (data.ok) {
        availableUsers = (data.users || []).map((u: any) => ({ id: u.id, username: u.username }));
      }
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      loadingUsers = false;
    }
  }

  async function loadOrganizations() {
    loadingOrgs = true;
    try {
      const res = await apiFetch('/api/admin/organizations');
      const data = await res.json();
      if (data.ok) {
        availableOrgs = (data.organizations || []).map((o: any) => ({ id: o.id, name: o.name }));
      }
    } catch (e) {
      console.error('Error loading organizations:', e);
    } finally {
      loadingOrgs = false;
    }
  }

  async function loadPhotos() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (selectedEmotion && selectedEmotion !== 'All') {
        params.set('emotion', selectedEmotion);
      }
      if (selectedUserId) {
        params.set('userId', selectedUserId);
      }
      if (selectedOrgId) {
        params.set('organizationId', selectedOrgId);
      }
      if (startDate) {
        params.set('startDate', startDate);
      }
      if (endDate) {
        params.set('endDate', endDate);
      }

      const res = await apiFetch(`/api/admin/photos?${params.toString()}`);
      const data = await res.json();
      
      if (data.ok) {
        photos = data.photos || [];
        totalPhotos = data.total || 0;
      } else {
        error = data.error || 'Failed to load photos';
      }
    } catch (e: any) {
      error = e?.message || 'Failed to load photos';
      console.error('Error loading photos:', e);
    } finally {
      loading = false;
    }
  }

  function clearFilters() {
    selectedEmotion = 'All';
    selectedUserId = '';
    selectedOrgId = '';
    startDate = '';
    endDate = '';
    loadPhotos();
  }

  function getActiveFilterCount() {
    let count = 0;
    if (selectedEmotion !== 'All') count++;
    if (selectedUserId) count++;
    if (selectedOrgId) count++;
    if (startDate) count++;
    if (endDate) count++;
    return count;
  }

  async function deletePhoto(photoId: string) {
    if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      return;
    }

    deletingPhoto[photoId] = true;
    try {
      const res = await apiFetch(`/api/collages/${photoId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.ok) {
        // Remove from local array and reload
        photos = photos.filter(p => p.id !== photoId);
        totalPhotos = Math.max(0, totalPhotos - 1);
      } else {
        alert('Failed to delete photo: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error('Error deleting photo:', e);
      alert('Failed to delete photo: ' + (e?.message || 'Network error'));
    } finally {
      deletingPhoto[photoId] = false;
    }
  }
</script>

<div class="photos-admin-page">
  <div class="page-header">
    <h1>All Photos</h1>
    <div class="header-actions">
      <button class="refresh-btn" on:click={loadPhotos} disabled={loading}>
        {loading ? 'Refreshing...' : '🔄 Refresh'}
      </button>
      {#if getActiveFilterCount() > 0}
        <button class="clear-filters-btn" on:click={clearFilters}>
          🗑️ Clear Filters ({getActiveFilterCount()})
        </button>
      {/if}
    </div>
  </div>

  <!-- Filters Section -->
  <div class="filters-section">
    <div class="filters-grid">
      <!-- Emotion Filter -->
      <div class="filter-group">
        <label class="filter-label">Emotion</label>
        <select class="filter-select" bind:value={selectedEmotion} on:change={loadPhotos}>
          {#each EMOTIONS as emotion}
            <option value={emotion}>{emotion}</option>
          {/each}
        </select>
      </div>

      <!-- User Filter -->
      <div class="filter-group">
        <label class="filter-label">User</label>
        <select class="filter-select" bind:value={selectedUserId} on:change={loadPhotos} disabled={loadingUsers}>
          <option value="">All Users</option>
          {#each availableUsers as user}
            <option value={user.id}>{user.username}</option>
          {/each}
        </select>
      </div>

      <!-- Organization Filter -->
      <div class="filter-group">
        <label class="filter-label">Organization</label>
        <select class="filter-select" bind:value={selectedOrgId} on:change={loadPhotos} disabled={loadingOrgs}>
          <option value="">All Organizations</option>
          {#each availableOrgs as org}
            <option value={org.id}>{org.name}</option>
          {/each}
        </select>
      </div>

      <!-- Date Range Filters -->
      <div class="filter-group">
        <label class="filter-label">Start Date</label>
        <input 
          type="date" 
          class="filter-input" 
          bind:value={startDate} 
          on:change={loadPhotos}
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">End Date</label>
        <input 
          type="date" 
          class="filter-input" 
          bind:value={endDate} 
          on:change={loadPhotos}
        />
      </div>
    </div>
  </div>

  <!-- Results -->
  <div class="results-section">
    {#if loading}
      <div class="loading-state">Loading photos...</div>
    {:else if error}
      <div class="error-state">{error}</div>
    {:else if photos.length === 0}
      <div class="empty-state">
        <p>No photos found matching your filters.</p>
        {#if getActiveFilterCount() > 0}
          <button class="clear-filters-btn" on:click={clearFilters}>Clear Filters</button>
        {/if}
      </div>
    {:else}
      <div class="stats-bar">
        <span class="total-count">Total: {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''}</span>
      </div>
      <div class="photos-grid">
        {#each photos as photo}
          <div class="photo-card">
            <div class="photo-image-container">
              <img src={photo.imageUrl} alt="Photo" loading="lazy" />
              <button
                class="delete-photo-btn"
                on:click={() => deletePhoto(photo.id)}
                disabled={deletingPhoto[photo.id]}
                title="Delete this photo"
              >
                {deletingPhoto[photo.id] ? '⏳' : '🗑️'}
              </button>
            </div>
            <div class="photo-info">
              <div class="photo-user">
                <strong>User:</strong> {photo.user.username}
              </div>
              <div class="photo-emotions">
                <strong>Emotions:</strong> 
                {#if photo.emotions && photo.emotions.length > 0}
                  {photo.emotions.join(', ')}
                {:else}
                  <span class="no-emotions">None</span>
                {/if}
              </div>
              <div class="photo-folder">
                <strong>Folder:</strong> {photo.folder || 'Me'}
              </div>
              <div class="photo-date">
                <strong>Date:</strong> {new Date(photo.createdAt).toLocaleDateString()} {new Date(photo.createdAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .photos-admin-page {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(79, 70, 229, 0.2);
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 800;
    color: rgba(0, 0, 0, 0.8);
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .refresh-btn, .clear-filters-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .refresh-btn:hover, .clear-filters-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .clear-filters-btn {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border-color: rgba(239, 68, 68, 0.3);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .filters-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 16px;
    border: 1px solid rgba(79, 70, 229, 0.2);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-label {
    font-weight: 700;
    font-size: 0.875rem;
    color: rgba(0, 0, 0, 0.7);
  }

  .filter-select, .filter-input {
    padding: 0.625rem;
    border-radius: 8px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: white;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .filter-select:focus, .filter-input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .filter-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .results-section {
    margin-top: 2rem;
  }

  .stats-bar {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: rgba(79, 70, 229, 0.1);
    border-radius: 12px;
  }

  .total-count {
    font-weight: 700;
    font-size: 1rem;
    color: rgba(0, 0, 0, 0.8);
  }

  .loading-state, .error-state, .empty-state {
    text-align: center;
    padding: 3rem;
    color: rgba(0, 0, 0, 0.6);
    font-size: 1.1rem;
  }

  .error-state {
    color: #ef4444;
  }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .photo-card {
    background: white;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .photo-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .photo-image-container {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: #f3f4f6;
    position: relative;
  }

  .photo-image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .delete-photo-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 2px solid rgba(239, 68, 68, 0.8);
    background: rgba(239, 68, 68, 0.9);
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  .delete-photo-btn:hover:not(:disabled) {
    background: #ef4444;
    border-color: #ef4444;
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);
  }

  .delete-photo-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .photo-info {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .photo-user, .photo-emotions, .photo-folder, .photo-date {
    color: rgba(0, 0, 0, 0.7);
  }

  .photo-user strong, .photo-emotions strong, .photo-folder strong, .photo-date strong {
    color: rgba(0, 0, 0, 0.9);
  }

  .no-emotions {
    color: rgba(0, 0, 0, 0.4);
    font-style: italic;
  }

  @media (max-width: 768px) {
    .photos-grid {
      grid-template-columns: 1fr;
    }

    .filters-grid {
      grid-template-columns: 1fr;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
  }
</style>

