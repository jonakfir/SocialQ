<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import TrashDeleteButton from '$lib/components/TrashDeleteButton.svelte';

  let loading = true;
  let photos: Array<{
    id: string;
    imageUrl: string;
    emotions: string[] | null;
    folder: string;
    createdAt: string;
    user: { id: string; username: string };
  }> = [];
  
  let ekmanImages: Array<{
    id: string;
    imageData: string;
    label: string;
    difficulty: string;
    photoType: string;
    folder?: string | null;
    createdAt: string;
    organizations: Array<{ id: string; name: string }>;
  }> = [];
  
  let generatedImages: Array<{
    id: string;
    imageData: string;
    label: string;
    difficulty: string;
    photoType: string;
    folder?: string | null;
    createdAt: string;
    organizations: Array<{ id: string; name: string }>;
  }> = [];
  
  let totalPhotos = 0;
  let totalEkmanImages = 0;
  let totalGeneratedImages = 0;
  let error: string | null = null;
  let deletingPhoto: Record<string, boolean> = {};
  let deletingEkmanImage: Record<string, boolean> = {};
  let deletingGeneratedImage: Record<string, boolean> = {};

  // Active tab: 'user' | 'ekman' | 'generated'
  let activeTab: 'user' | 'ekman' | 'generated' = 'user';

  // Upload modal state
  let showUploadModal = false;
  let uploading = false;
  let uploadFiles: File[] = [];
  let uploadPreviews: string[] = [];
  let uploadProgress = { current: 0, total: 0 };
  let uploadEmotion = 'Happy';
  let uploadDifficulty = 'all';
  let uploadPhotoType: 'ekman' | 'other' | 'synthetic' = 'ekman';
  let uploadFolder = ''; // For generated photos folder; empty = none
  let uploadOrganizationIds: string[] = [];

  // Visibility modal state
  let showVisibilityModal = false;
  let editingImageId: string | null = null;
  let editingOrganizationIds: string[] = [];
  let savingVisibility = false;

  // Filters
  const EMOTIONS = ['All', 'Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise', 'Neutral'];
  const EKMAN_EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise', 'Neutral'];
  const DIFFICULTIES = ['all', '1', '2', '3', '4'];
  const EMOTION_MAP: Record<string, string> = {
    'Angry': 'Anger',
    'Disgust': 'Disgust',
    'Fear': 'Fear',
    'Happy': 'Happy',
    'Sad': 'Sad',
    'Surprise': 'Surprise',
    'Neutral': 'Neutral'
  };
  // Folder options: None or Generated Photos (emotion comes from Emotion dropdown above)
  const UPLOAD_FOLDER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: 'None (Ekman / default)' },
    { value: 'generated', label: 'Generated Photos' }
  ];
  let selectedEmotion = 'All';
  let selectedDifficulty = 'All';
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
    await Promise.all([loadPhotos(), loadEkmanImages(), loadGeneratedImages(), loadUsers(), loadOrganizations()]);
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

  async function loadEkmanImages() {
    try {
      const params = new URLSearchParams();
      // Exclude synthetic photos and generated photos folder
      params.set('excludeSynthetic', 'true');
      params.set('excludeGeneratedFolder', 'true');
      
      if (selectedEmotion && selectedEmotion !== 'All') {
        params.set('emotion', EMOTION_MAP[selectedEmotion] || selectedEmotion);
      }
      if (selectedDifficulty && selectedDifficulty !== 'All') {
        params.set('difficulty', selectedDifficulty);
      }

      const res = await apiFetch(`/api/admin/ekman-images?${params.toString()}`);
      const data = await res.json();
      
      if (data.ok) {
        ekmanImages = data.images || [];
        totalEkmanImages = data.total || 0;
      }
    } catch (e: any) {
      console.error('Error loading Ekman images:', e);
    }
  }

  async function loadGeneratedImages() {
    if (activeTab === 'generated') loading = true;
    try {
      const params = new URLSearchParams();
      params.set('photoType', 'synthetic');
      
      // Use emotion filter to determine folder
      if (selectedEmotion && selectedEmotion !== 'All') {
        const mappedEmotion = EMOTION_MAP[selectedEmotion] || selectedEmotion;
        params.set('folder', `Generated Photos/${mappedEmotion}`);
        params.set('emotion', mappedEmotion);
      }

      const res = await apiFetch(`/api/admin/ekman-images?${params.toString()}`);
      const data = await res.json();
      
      if (data.ok) {
        generatedImages = data.images || [];
        totalGeneratedImages = data.total || 0;
      }
    } catch (e: any) {
      console.error('Error loading generated images:', e);
    } finally {
      if (activeTab === 'generated') loading = false;
    }
  }

  function clearFilters() {
    selectedEmotion = 'All';
    selectedDifficulty = 'All';
    selectedUserId = '';
    selectedOrgId = '';
    startDate = '';
    endDate = '';
    if (activeTab === 'user') {
      loadPhotos();
    } else if (activeTab === 'ekman') {
      loadEkmanImages();
    } else {
      loadGeneratedImages();
    }
  }

  function getActiveFilterCount() {
    let count = 0;
    if (selectedEmotion !== 'All') count++;
    if (activeTab === 'ekman') {
      if (selectedDifficulty !== 'All') count++;
    } else if (activeTab === 'generated') {
      // Emotion filter is already counted above
    } else {
      if (selectedUserId) count++;
      if (selectedOrgId) count++;
      if (startDate) count++;
      if (endDate) count++;
    }
    return count;
  }

  function handleTabChange(tab: 'user' | 'ekman' | 'generated') {
    activeTab = tab;
    if (tab === 'user') {
      loadPhotos();
    } else if (tab === 'ekman') {
      loadEkmanImages();
    } else {
      loadGeneratedImages();
    }
  }


  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files?.length) return;
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    uploadFiles = fileArray;
    const previews: string[] = new Array(fileArray.length).fill('');
    uploadPreviews = previews;
    fileArray.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        previews[i] = e.target?.result as string;
        uploadPreviews = [...previews];
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) {
      alert('Please select one or more photos');
      return;
    }

    uploading = true;
    const total = uploadFiles.length;
    uploadProgress = { current: 0, total };
    let succeeded = 0;
    let failed = 0;
    try {
      const folderValue =
        uploadFolder && uploadFolder.trim() !== ''
          ? uploadFolder === 'generated'
            ? `Generated Photos/${uploadEmotion}`
            : uploadFolder
          : '';

      for (let i = 0; i < uploadFiles.length; i++) {
        uploadProgress = { current: i + 1, total };
        const formData = new FormData();
        formData.append('file', uploadFiles[i]);
        formData.append('emotion', uploadEmotion);
        formData.append('difficulty', uploadDifficulty);
        formData.append('photoType', uploadPhotoType);
        if (folderValue) formData.append('folder', folderValue);
        formData.append('organizationIds', JSON.stringify(uploadOrganizationIds));

        try {
          const res = await apiFetch('/api/admin/ekman-images', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.ok) succeeded++;
          else failed++;
        } catch {
          failed++;
        }
      }

      // Reset form and close
      uploadFiles = [];
      uploadPreviews = [];
      uploadEmotion = 'Happy';
      uploadDifficulty = 'all';
      uploadPhotoType = 'ekman';
      uploadFolder = '';
      uploadOrganizationIds = [];
      showUploadModal = false;
      uploadProgress = { current: 0, total: 0 };

      if (activeTab === 'user') {
        await loadPhotos();
      } else if (activeTab === 'ekman') {
        await loadEkmanImages();
      } else if (activeTab === 'generated') {
        await loadGeneratedImages();
      }

      if (failed === 0) {
        alert(total === 1 ? 'Photo uploaded successfully!' : `${succeeded} photos uploaded successfully!`);
      } else {
        alert(`${succeeded} uploaded, ${failed} failed.`);
      }
    } catch (e: any) {
      console.error('Error uploading photo:', e);
      alert('Failed to upload photos: ' + (e?.message || 'Network error'));
    } finally {
      uploading = false;
      uploadProgress = { current: 0, total: 0 };
    }
  }

  async function deleteEkmanImage(imageId: string) {
    deletingEkmanImage[imageId] = true;
    try {
      const res = await apiFetch(`/api/admin/ekman-images/${imageId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.ok) {
        ekmanImages = ekmanImages.filter(img => img.id !== imageId);
        totalEkmanImages = Math.max(0, totalEkmanImages - 1);
      } else {
        alert('Failed to delete image: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error('Error deleting image:', e);
      alert('Failed to delete image: ' + (e?.message || 'Network error'));
    } finally {
      deletingEkmanImage[imageId] = false;
    }
  }

  async function deleteGeneratedImage(imageId: string) {
    deletingGeneratedImage[imageId] = true;
    try {
      const res = await apiFetch(`/api/admin/ekman-images/${imageId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.ok) {
        generatedImages = generatedImages.filter(img => img.id !== imageId);
        totalGeneratedImages = Math.max(0, totalGeneratedImages - 1);
      } else {
        alert('Failed to delete image: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error('Error deleting image:', e);
      alert('Failed to delete image: ' + (e?.message || 'Network error'));
    } finally {
      deletingGeneratedImage[imageId] = false;
    }
  }

  function openVisibilityModal(imageId: string, currentOrgIds: string[]) {
    editingImageId = imageId;
    editingOrganizationIds = [...currentOrgIds];
    showVisibilityModal = true;
  }

  async function saveVisibility() {
    if (!editingImageId) return;

    savingVisibility = true;
    try {
      const res = await apiFetch(`/api/admin/ekman-images/${editingImageId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationIds: editingOrganizationIds })
      });
      const data = await res.json();

      if (data.ok) {
        showVisibilityModal = false;
        editingImageId = null;
        editingOrganizationIds = [];
        await loadEkmanImages();
        alert('Visibility updated successfully!');
      } else {
        alert('Failed to update visibility: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error('Error updating visibility:', e);
      alert('Failed to update visibility: ' + (e?.message || 'Network error'));
    } finally {
      savingVisibility = false;
    }
  }

  async function deletePhoto(photoId: string) {
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
      <button class="upload-btn" on:click={() => {
        uploadPhotoType = activeTab === 'generated' ? 'synthetic' : 'ekman';
        if (activeTab === 'generated' && selectedEmotion !== 'All') {
          const mappedEmotion = EMOTION_MAP[selectedEmotion] || selectedEmotion;
          uploadFolder = 'generated';
          uploadEmotion = mappedEmotion;
        } else {
          uploadFolder = '';
          uploadEmotion = 'Happy';
        }
        uploadDifficulty = 'all';
        uploadFiles = [];
        uploadPreviews = [];
        uploadOrganizationIds = [];
        showUploadModal = true;
      }}>
        📤 Upload Photo
      </button>
      <button class="refresh-btn" on:click={() => {
        if (activeTab === 'user') loadPhotos();
        else if (activeTab === 'ekman') loadEkmanImages();
        else loadGeneratedImages();
      }} disabled={loading}>
        {loading ? 'Refreshing...' : '🔄 Refresh'}
      </button>
      {#if getActiveFilterCount() > 0}
        <button class="clear-filters-btn" on:click={clearFilters}>
          🗑️ Clear Filters ({getActiveFilterCount()})
        </button>
      {/if}
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button 
      class="tab-btn" 
      class:active={activeTab === 'user'}
      on:click={() => handleTabChange('user')}
    >
      User Photos ({totalPhotos})
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'ekman'}
      on:click={() => handleTabChange('ekman')}
    >
      Ekman Photos ({totalEkmanImages})
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'generated'}
      on:click={() => handleTabChange('generated')}
    >
      Generated Photos ({totalGeneratedImages})
    </button>
  </div>

  <!-- Filters Section -->
  <div class="filters-section">
    <div class="filters-grid">
      <!-- Emotion Filter -->
      <div class="filter-group">
        <label class="filter-label">Emotion</label>
        <select class="filter-select" bind:value={selectedEmotion} on:change={() => {
          if (activeTab === 'user') {
            loadPhotos();
          } else if (activeTab === 'ekman') {
            loadEkmanImages();
          } else if (activeTab === 'generated') {
            loadGeneratedImages();
          }
        }}>
          {#each EMOTIONS as emotion}
            <option value={emotion}>{emotion}</option>
          {/each}
        </select>
      </div>

      {#if activeTab === 'user'}
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
      {:else if activeTab === 'ekman'}
        <!-- Difficulty Filter -->
        <div class="filter-group">
          <label class="filter-label">Difficulty</label>
          <select class="filter-select" bind:value={selectedDifficulty} on:change={loadEkmanImages}>
            <option value="All">All Difficulties</option>
            {#each DIFFICULTIES as diff}
              <option value={diff}>{diff === 'all' ? 'All' : `Level ${diff}`}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- Results -->
  <div class="results-section">
    {#if activeTab === 'user'}
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
                <div class="delete-photo-btn-wrapper">
                  <TrashDeleteButton
                    confirmMessage="Are you sure you want to delete this photo? This action cannot be undone."
                    onConfirm={() => deletePhoto(photo.id)}
                    disabled={deletingPhoto[photo.id]}
                    loading={deletingPhoto[photo.id]}
                    title="Delete this photo"
                  />
                </div>
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
    {:else if activeTab === 'ekman'}
      {#if loading}
        <div class="loading-state">Loading Ekman images...</div>
      {:else if ekmanImages.length === 0}
        <div class="empty-state">
          <p>No Ekman images found matching your filters.</p>
          {#if getActiveFilterCount() > 0}
            <button class="clear-filters-btn" on:click={clearFilters}>Clear Filters</button>
          {/if}
        </div>
      {:else}
        <div class="stats-bar">
          <span class="total-count">Total: {totalEkmanImages} image{totalEkmanImages !== 1 ? 's' : ''}</span>
        </div>
        <div class="photos-grid">
          {#each ekmanImages as image}
            <div class="photo-card">
              <div class="photo-image-container">
                <img src={image.imageData} alt="Ekman Image" loading="lazy" />
                <div class="delete-photo-btn-wrapper">
                  <TrashDeleteButton
                    confirmMessage="Are you sure you want to delete this image? This action cannot be undone."
                    onConfirm={() => deleteEkmanImage(image.id)}
                    disabled={deletingEkmanImage[image.id]}
                    loading={deletingEkmanImage[image.id]}
                    title="Delete this image"
                  />
                </div>
              </div>
              <div class="photo-info">
                <div class="photo-emotions">
                  <strong>Emotion:</strong> {image.label}
                </div>
                <div class="photo-folder">
                  <strong>Type:</strong> {image.photoType}
                </div>
                <div class="photo-folder">
                  <strong>Difficulty:</strong> {image.difficulty === 'all' ? 'All' : `Level ${image.difficulty}`}
                </div>
                <div class="photo-organizations">
                  <strong>Organizations:</strong>
                  {#if image.organizations.length === 0}
                    <span class="all-orgs">All organizations</span>
                  {:else}
                    <div class="org-tags">
                      {#each image.organizations as org}
                        <span class="org-tag">{org.name}</span>
                      {/each}
                    </div>
                  {/if}
                  <button 
                    class="edit-visibility-btn"
                    on:click={() => openVisibilityModal(image.id, image.organizations.map(o => o.id))}
                    title="Edit organization visibility"
                  >
                    ✏️ Edit
                  </button>
                </div>
                <div class="photo-date">
                  <strong>Date:</strong> {new Date(image.createdAt).toLocaleDateString()} {new Date(image.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'generated'}
      {#if loading}
        <div class="loading-state">Loading generated images...</div>
      {:else if generatedImages.length === 0}
        <div class="empty-state">
          <p>No generated photos yet. Run the generate-synthetic-photos script to create images.</p>
          {#if selectedEmotion !== 'All'}
            <button class="clear-filters-btn" on:click={() => { selectedEmotion = 'All'; loadGeneratedImages(); }}>Show All</button>
          {/if}
        </div>
      {:else}
        <div class="stats-bar">
          <span class="total-count">Generated Photos: {totalGeneratedImages} image{totalGeneratedImages !== 1 ? 's' : ''}</span>
        </div>
        <div class="photos-grid">
          {#each generatedImages as image}
            <div class="photo-card">
              <div class="photo-image-container">
                <img src={image.imageData} alt="Generated" loading="lazy" />
                <div class="delete-photo-btn-wrapper">
                  <TrashDeleteButton
                    confirmMessage="Are you sure you want to delete this image? This action cannot be undone."
                    onConfirm={() => deleteGeneratedImage(image.id)}
                    disabled={deletingGeneratedImage[image.id]}
                    loading={deletingGeneratedImage[image.id]}
                    title="Delete this image"
                  />
                </div>
              </div>
              <div class="photo-info">
                <div class="photo-emotions">
                  <strong>Emotion:</strong> {image.label}
                </div>
                <div class="photo-folder">
                  <strong>Folder:</strong> {image.folder || 'Generated Photos'}
                </div>
                <div class="photo-date">
                  <strong>Date:</strong> {new Date(image.createdAt).toLocaleDateString()} {new Date(image.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Upload Modal -->
{#if showUploadModal}
  <div class="modal-overlay" on:click={() => showUploadModal = false}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Upload Photo</h2>
        <button class="modal-close" on:click={() => showUploadModal = false}>×</button>
      </div>
      <div class="modal-body">
        <div class="upload-form">
          <div class="form-group">
            <label class="form-label">Photo(s)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              on:change={handleFileSelect}
              class="form-input"
            />
            {#if uploadPreviews.length > 0}
              <div class="upload-preview-grid">
                {#each uploadPreviews as preview, i}
                  <img src={preview} alt="Preview {i + 1}" class="upload-preview" />
                {/each}
              </div>
              <p class="form-help">{uploadFiles.length} file(s) selected</p>
            {/if}
          </div>
          <div class="form-group">
            <label class="form-label">Emotion</label>
            <select class="form-select" bind:value={uploadEmotion}>
              {#each EKMAN_EMOTIONS as emotion}
                <option value={emotion}>{emotion}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Difficulty</label>
            <select class="form-select" bind:value={uploadDifficulty}>
              {#each DIFFICULTIES as diff}
                <option value={diff}>{diff === 'all' ? 'All' : `Level ${diff}`}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Folder</label>
            <select class="form-select" bind:value={uploadFolder}>
              {#each UPLOAD_FOLDER_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            <p class="form-help">Choose "Generated Photos" to put the image in Generated Photos / [the emotion selected above]. Use None for Ekman/default.</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel" on:click={() => showUploadModal = false}>Cancel</button>
        <button class="modal-btn primary" on:click={handleUpload} disabled={uploading || uploadFiles.length === 0}>
          {uploading
            ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
            : uploadFiles.length > 0
              ? `Upload ${uploadFiles.length} photo${uploadFiles.length === 1 ? '' : 's'}`
              : 'Upload'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Visibility Modal -->
{#if showVisibilityModal}
  <div class="modal-overlay" on:click={() => showVisibilityModal = false}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Edit Organization Visibility</h2>
        <button class="modal-close" on:click={() => showVisibilityModal = false}>×</button>
      </div>
      <div class="modal-body">
        <p class="form-help">Leave empty to make visible to all organizations. Select specific organizations to limit visibility.</p>
        <div class="org-checkboxes">
          {#each availableOrgs as org}
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                checked={editingOrganizationIds.includes(org.id)}
                on:change={(e) => {
                  if (e.currentTarget.checked) {
                    editingOrganizationIds = [...editingOrganizationIds, org.id];
                  } else {
                    editingOrganizationIds = editingOrganizationIds.filter(id => id !== org.id);
                  }
                }}
              />
              {org.name}
            </label>
          {/each}
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel" on:click={() => showVisibilityModal = false}>Cancel</button>
        <button class="modal-btn primary" on:click={saveVisibility} disabled={savingVisibility}>
          {savingVisibility ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .upload-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(34, 197, 94, 0.3);
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  .upload-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
  }

  .clear-filters-btn {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border-color: rgba(239, 68, 68, 0.3);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid rgba(79, 70, 229, 0.2);
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    background: transparent;
    color: rgba(0, 0, 0, 0.6);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-btn:hover {
    color: rgba(0, 0, 0, 0.8);
    background: rgba(79, 70, 229, 0.05);
  }

  .tab-btn.active {
    color: #4f46e5;
    border-bottom-color: #4f46e5;
    font-weight: 700;
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

  .delete-photo-btn-wrapper {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
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

  .photo-organizations {
    margin-top: 0.5rem;
  }

  .all-orgs {
    color: rgba(34, 197, 94, 0.8);
    font-weight: 600;
  }

  .org-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .org-tag {
    padding: 0.25rem 0.5rem;
    background: rgba(79, 70, 229, 0.1);
    border-radius: 6px;
    font-size: 0.75rem;
    color: rgba(79, 70, 229, 0.9);
  }

  .edit-visibility-btn {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: rgba(79, 70, 229, 0.1);
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .edit-visibility-btn:hover {
    background: rgba(79, 70, 229, 0.2);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.8);
  }

  .modal-close {
    width: 2rem;
    height: 2rem;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.8);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .upload-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-weight: 700;
    font-size: 0.875rem;
    color: rgba(0, 0, 0, 0.7);
  }

  .form-input, .form-select {
    padding: 0.625rem;
    border-radius: 8px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: white;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .form-input:focus, .form-select:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .form-help {
    font-size: 0.75rem;
    color: rgba(0, 0, 0, 0.5);
    margin: 0;
  }

  .upload-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    margin-top: 0.5rem;
  }
  .upload-preview-grid .upload-preview {
    width: 100%;
    height: 80px;
    object-fit: cover;
    border-radius: 8px;
  }
  .upload-preview {
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    margin-top: 0.5rem;
    object-fit: contain;
  }

  .org-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .checkbox-label:hover {
    background: rgba(79, 70, 229, 0.05);
  }

  .checkbox-label input[type="checkbox"] {
    width: 1.25rem;
    height: 1.25rem;
    cursor: pointer;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .modal-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-btn.cancel {
    background: white;
    color: rgba(0, 0, 0, 0.7);
  }

  .modal-btn.cancel:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .modal-btn.primary {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: transparent;
  }

  .modal-btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .modal-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

    .tabs {
      flex-wrap: wrap;
    }

    .modal-content {
      max-width: 100%;
      margin: 1rem;
    }
  }
</style>

