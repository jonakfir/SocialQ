<script>
  import Buttons from '$lib/components/Buttons.svelte';
  import Header from '$lib/components/Header.svelte';
  import { goto } from '$app/navigation';

  let selected = '1';

  function handleSubmit(event) {
    event.preventDefault();
    // Replace with actual difficulty-setting logic or API call if needed
    console.log("Difficulty set to:", selected);
    goto('/mirroring/settings');
  }
</script>

<style>
  select {
    width: 100%;
    padding: 10px;
    margin-bottom: 20px;
    font-size: 16px;
    border-radius: 8px;
    border: none;
    outline: none;
  }

  form {
    width: 100%;
    max-width: 280px;
    text-align: center;
  }

  .dashboard-box {
    margin-top: 40px;
  }

  a.btn {
    display: inline-block;
    margin-top: 20px;
    text-decoration: none;
    background-color: #4f46e5;
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    transition: background-color 0.2s ease;
  }

  a.btn:hover {
    background-color: #4338ca;
  }
</style>

<!-- Background Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<!-- Glass Box -->
<div class="dashboard-box">
  <h2 class="settings-title">Change Difficulty</h2>
  <form on:submit={handleSubmit}>
    <label for="difficulty" style="display:block; margin-bottom:10px; font-size:18px;">
      Select Difficulty (1–4):
    </label>
    <select id="difficulty" bind:value={selected}>
      <option value="1">1 - Easy</option>
      <option value="2">2 - Medium</option>
      <option value="3">3 - Hard</option>
      <option value="4">4 - Expert</option>
    </select>
    <button type="submit" class="settings-btn">Save</button>
  </form>
  <a href="/mirroring/settings" class="btn">Back to Settings</a>
</div>
