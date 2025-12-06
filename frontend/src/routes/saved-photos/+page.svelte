<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';

  // Accept what the backend actually returns: { id, email }
  export let data: { user: { id: number; email?: string } | null; collages: any[] };

  const user = data?.user ?? { id: 0, email: '' };
  let collages = data?.collages || [];
  let loading = false;

  // Display name = email (fallback to blank to avoid "undefined")
  const displayEmail = (user.email ?? '').toString();

  // Organize collages by emotion and by folder
  const EMOTIONS = ['Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise'];
  const DEFAULT_FOLDERS = ['Me', 'Family', 'Friends'];
  let folders: string[] = [...DEFAULT_FOLDERS];
  let newFolderName = '';
  let selectedFolder: string | null = null;
  let showFolderModal = false;
  let draggedCollageId: string | null = null;
  let dragOverFolder: string | null = null;

  // Load saved custom folders from localStorage
  function loadSavedFolders() {
    if (typeof localStorage === 'undefined' || !user.id) return [];
    try {
      const saved = localStorage.getItem(`user_${user.id}_folders`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error('Error loading saved folders:', e);
    }
    return [];
  }

  // Save custom folders to localStorage
  function saveFolders(folderList: string[]) {
    if (typeof localStorage === 'undefined' || !user.id) return;
    try {
      // Only save custom folders (not default ones)
      const customFolders = folderList.filter(f => !DEFAULT_FOLDERS.includes(f));
      localStorage.setItem(`user_${user.id}_folders`, JSON.stringify(customFolders));
    } catch (e) {
      console.error('Error saving folders:', e);
    }
  }
  
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
  let currentCollages: any[] = [];
  $: groupedCollages = groupByEmotion(collages || []);
  $: {
    try {
      // Combine default folders, folders from existing collages, and saved custom folders
      const foldersFromCollages = (collages || []).map((c: any) => (c.folder || 'Me'));
      const savedCustomFolders = loadSavedFolders();
      const allFolders = [
        ...DEFAULT_FOLDERS,
        ...foldersFromCollages,
        ...savedCustomFolders
      ];
      folders = Array.from(new Set(allFolders));
    } catch (e) {
      console.error('Error updating folders:', e);
      folders = [...DEFAULT_FOLDERS, ...(collages || []).map((c: any) => (c.folder || 'Me'))];
    }
  }
  $: {
    try {
      const filtered = (groupedCollages && groupedCollages[selectedEmotion]) ? groupedCollages[selectedEmotion] : [];
      if (selectedFolder) {
        currentCollages = filtered.filter((c: any) => (c.folder || 'Me') === selectedFolder);
      } else {
        currentCollages = filtered;
      }
    } catch (e) {
      console.error('Error filtering collages:', e);
      currentCollages = [];
    }
  }

  async function refreshCollages() {
    if (!user.id) {
      console.log('[saved-photos] No user.id, skipping collage fetch');
      return;
    }
    loading = true;
    try {
      console.log('[saved-photos] Fetching collages for user ID:', user.id);
      const res = await apiFetch('/api/collages');
      const data = await res.json();
      console.log('[saved-photos] Collages response:', data);
      if (data.ok) {
        collages = data.collages || [];
        console.log('[saved-photos] Loaded', collages.length, 'collages:', collages);
      } else {
        console.error('[saved-photos] Failed to fetch collages:', data.error);
      }
    } catch (error) {
      console.error('[saved-photos] Error fetching collages:', error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    refreshCollages();
    // Load saved folders on mount
    if (user.id) {
      const saved = loadSavedFolders();
      if (saved.length > 0) {
        folders = Array.from(new Set([...DEFAULT_FOLDERS, ...folders, ...saved]));
      }
    }
  });

  async function deleteCollage(id: string) {
    try {
      const res = await apiFetch(`/api/collages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshCollages();
      } else {
        const data = await res.json();
        alert('Failed to delete collage: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting collage:', error);
      alert('Failed to delete collage');
    }
  }

  async function moveCollage(id: string, folder: string) {
    try {
      const res = await apiFetch(`/api/collages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder })
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Failed to move photo');
      } else {
        await refreshCollages();
      }
    } catch (e) {
      alert('Failed to move photo');
    }
  }

  function handleDragStart(collageId: string, e: DragEvent) {
    draggedCollageId = collageId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', collageId);
      // Set drag opacity
      if (e.target instanceof HTMLElement) {
        const photoItem = e.target.closest('.photo-item');
        if (photoItem) {
          photoItem.style.opacity = '0.5';
        }
      }
    }
  }

  function handleDragEnd(e: DragEvent) {
    // Reset opacity
    if (e.target instanceof HTMLElement) {
      const photoItem = e.target.closest('.photo-item');
      if (photoItem) {
        photoItem.style.opacity = '';
      }
    }
    draggedCollageId = null;
    dragOverFolder = null;
  }

  function handleDragOver(folderName: string, e: DragEvent) {
    if (draggedCollageId) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      dragOverFolder = folderName;
    }
  }

  function handleDragLeave() {
    dragOverFolder = null;
  }

  function handleDrop(folderName: string, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedCollageId) {
      moveCollage(draggedCollageId, folderName);
    }
    draggedCollageId = null;
    dragOverFolder = null;
  }

  function openFolderModal() {
    newFolderName = '';
    showFolderModal = true;
  }

  function closeFolderModal() {
    showFolderModal = false;
    newFolderName = '';
  }

  function createFolder() {
    const name = (newFolderName || '').trim();
    if (!name) return;
    if (!folders.includes(name)) {
      folders = [...folders, name];
      // Save updated folders to localStorage
      saveFolders(folders);
    }
    closeFolderModal();
  }

  async function deleteFolder(folderName: string, e: Event) {
    e.stopPropagation();
    
    // Don't allow deleting default folders
    if (DEFAULT_FOLDERS.includes(folderName)) {
      return;
    }

    // Confirm deletion
    if (!confirm(`Delete folder "${folderName}"? Photos in this folder will be moved to "Me".`)) {
      return;
    }

    // Move all collages from this folder to "Me"
    const collagesToUpdate = collages.filter(c => (c.folder || 'Me') === folderName);
    
    for (const collage of collagesToUpdate) {
      try {
        await apiFetch(`/api/collages/${collage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'Me' })
        });
      } catch (error) {
        console.error(`Error updating collage ${collage.id}:`, error);
      }
    }

    // Remove folder from list
    folders = folders.filter(f => f !== folderName);
    
    // If this folder was selected, reset to null
    if (selectedFolder === folderName) {
      selectedFolder = null;
    }
    
    // Save updated folders to localStorage
    saveFolders(folders);
    
    // Refresh collages to reflect the changes
    await refreshCollages();
  }

  function isDefaultFolder(folderName: string): boolean {
    return DEFAULT_FOLDERS.includes(folderName);
  }

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeFolderModal();
    } else if (e.key === 'Enter' && showFolderModal) {
      createFolder();
    }
  }

  function goBack() {
    goto('/profile');
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

  .add-folder-btn {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: #4f46e5;
  }

  .add-folder-btn:hover {
    background: linear-gradient(135deg, #5b52f5, #34e3fe);
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.5);
  }

  .folder-tab-wrapper {
    position: relative;
    display: inline-block;
  }

  .folder-tab-wrapper.custom {
    padding-right: 8px;
  }

  .folder-tab-wrapper.drag-over {
    z-index: 10;
  }

  .folder-tab {
    position: relative;
  }

  .drop-zone {
    transition: all 0.2s ease;
  }

  .drop-zone.drag-target {
    background: linear-gradient(135deg, #4f46e5, #22d3ee) !important;
    color: white !important;
    border-color: #4f46e5 !important;
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5) !important;
    animation: pulse 0.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1.1);
    }
    50% {
      transform: scale(1.15);
    }
  }

  .folder-delete-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(239, 68, 68, 0.8);
    background: rgba(239, 68, 68, 0.95);
    color: white;
    font-size: 16px;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    z-index: 10;
    transition: all 0.2s ease;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .folder-delete-btn:hover {
    background: rgba(220, 38, 38, 1);
    border-color: rgba(220, 38, 38, 1);
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .folder-delete-btn:active {
    transform: scale(0.95);
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
    overflow: visible;
    aspect-ratio: 1;
    cursor: grab;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    background: rgba(0, 0, 0, 0.05);
  }

  .photo-item:active {
    cursor: grabbing;
  }

  .photo-item.dragging {
    opacity: 0.5;
    transform: scale(0.95);
    cursor: grabbing;
  }

  .photo-item:hover:not(.dragging) {
    transform: scale(1.05);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
    border-radius: 16px;
  }

  .folder-badge {
    position: absolute;
    left: 12px;
    bottom: 12px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #4f46e5;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    pointer-events: none;
  }

  .delete-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(239, 68, 68, 0.95);
    color: white;
    border: none;
    border-radius: 8px;
    width: 36px;
    height: 36px;
    cursor: pointer;
    font-weight: 900;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  .delete-btn:hover {
    background: rgba(220, 38, 38, 1);
    transform: scale(1.1);
  }

  .photo-item:hover .delete-btn {
    opacity: 1;
  }

  /* Trash icon SVG */
  .delete-btn svg {
    width: 18px;
    height: 18px;
    fill: white;
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: rgba(0, 0, 0, 0.6);
    font-size: 18px;
    font-weight: 500;
  }

  .loading {
    text-align: center;
    padding: 60px 20px;
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

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.90));
    backdrop-filter: blur(24px) saturate(140%);
    border: 1px solid rgba(255,255,255,.6);
    border-radius: 24px;
    padding: 2rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.3);
    max-width: 400px;
    width: 90%;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-title {
    font-family: 'Georgia', serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: #111;
    margin: 0 0 1.5rem 0;
    text-align: center;
  }

  .modal-input-group {
    margin-bottom: 1.5rem;
  }

  .modal-input {
    width: 100%;
    padding: 0.875rem 1.25rem;
    border-radius: 12px;
    border: 2px solid rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 1rem;
    font-weight: 500;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .modal-input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    background: rgba(255, 255, 255, 1);
  }

  .modal-input::placeholder {
    color: #9ca3af;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .modal-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    border: 2px solid rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    color: #111;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .modal-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
  }

  .modal-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background: rgba(255, 255, 255, 0.8);
    color: #6b7280;
  }

  .cancel-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.95);
    color: #111;
  }

  .create-btn {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: #4f46e5;
  }

  .create-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #5b52f5, #34e3fe);
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
  }
</style>

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div>
  <div class="blob blob2"></div>
  <div class="blob blob3"></div>
  <div class="blob blob4"></div>
  <div class="blob blob5"></div>
  <div class="blob blob6"></div>
  <div class="blob blob7"></div>
  <div class="blob blob8"></div>
  <div class="blob blob9"></div>
  <div class="blob blob10"></div>
  <div class="blob blob11"></div>
  <div class="blob blob12"></div>
</div>

<div class="container">
  <div class="content">
    <div class="header">
      <h1>Saved Photos</h1>
      <button class="back-btn" on:click={goBack}>← Back to Profile</button>
    </div>

    {#if !user.id}
      <div class="empty-state">
        Please log in to view your saved photos.
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

      <div class="emotion-tabs" style="margin-top: 8px;">
        <button 
          class="emotion-tab" 
          class:active={selectedFolder === null}
          on:click={() => { selectedFolder = null; }}
        >
          All Folders
        </button>
        {#each folders as f}
          <div class="folder-tab-wrapper" class:custom={!isDefaultFolder(f)} class:drag-over={dragOverFolder === f && !!draggedCollageId}>
            <button 
              class="emotion-tab folder-tab drop-zone" 
              class:active={selectedFolder === f}
              class:drag-target={dragOverFolder === f && !!draggedCollageId}
              on:click={() => { selectedFolder = f; }} 
              on:dragover={(e) => handleDragOver(f, e)}
              on:dragleave={handleDragLeave}
              on:drop={(e) => handleDrop(f, e)}
              title={"Folder: " + f + (draggedCollageId ? " (Drop photo here)" : "")}
            >
              {f}
            </button>
            {#if !isDefaultFolder(f)}
              <button
                class="folder-delete-btn"
                on:click={(e) => deleteFolder(f, e)}
                title={`Delete folder "${f}"`}
                aria-label={`Delete folder "${f}"`}
              >
                ×
              </button>
            {/if}
          </div>
        {/each}
        <button class="emotion-tab add-folder-btn" on:click={openFolderModal}>
          + Add Folder
        </button>
      </div>

      {#if loading}
        <div class="loading">Loading photos...</div>
      {:else if currentCollages.length === 0}
        <div class="empty-state">
          {selectedEmotion === 'All' 
            ? "No saved photos yet. Create a collage to get started!" 
            : `No ${selectedEmotion.toLowerCase()} photos yet.`}
        </div>
      {:else}
        <div class="photos-grid">
          {#each currentCollages as collage}
            <div 
              class="photo-item" 
              class:dragging={draggedCollageId === collage.id}
              draggable="true"
              on:dragstart={(e) => handleDragStart(collage.id, e)}
              on:dragend={(e) => handleDragEnd(e)}
            >
              <img src={collage.imageUrl} alt="Saved collage" draggable="false" />
              <button
                class="delete-btn"
                on:click|stopPropagation={() => deleteCollage(collage.id)}
                title="Delete"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
              <div class="folder-badge" title={`Current folder: ${collage.folder || 'Me'}`}>
                📁 {collage.folder || 'Me'}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Folder Modal -->
{#if showFolderModal}
  <div class="modal-overlay" on:click={closeFolderModal} on:keydown={handleModalKeydown} role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-content" on:click|stopPropagation>
      <h2 id="modal-title" class="modal-title">Create New Folder</h2>
      <div class="modal-input-group">
        <input
          class="modal-input"
          type="text"
          placeholder="Folder name..."
          bind:value={newFolderName}
          autofocus
          on:keydown={(e) => {
            if (e.key === 'Enter') {
              createFolder();
            } else if (e.key === 'Escape') {
              closeFolderModal();
            }
          }}
        />
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel-btn" on:click={closeFolderModal}>Cancel</button>
        <button class="modal-btn create-btn" on:click={createFolder} disabled={!newFolderName.trim()}>
          Create Folder
        </button>
      </div>
    </div>
  </div>
{/if}

