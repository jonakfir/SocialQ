<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let usernameInitial = '';

  onMount(() => {
    const storedUser = localStorage.getItem('username');
    if (storedUser) {
      usernameInitial = storedUser[0].toUpperCase();
    }
  });

  function goTo(path) {
    goto(path);
  }
</script>

<style>
  body, html {
    margin: 0;
    padding: 0;
    font-family: 'Arial', sans-serif;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    position: relative;
  }

  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
    position: relative;
    z-index: 2;
  }

  .dashboard-box {
    background: rgba(255, 255, 255, 0.15);         /* more transparent */
    backdrop-filter: blur(30px) saturate(150%);    /* stronger blur and saturation */
    -webkit-backdrop-filter: blur(30px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.2);     /* glassy border */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);      /* softer shadow */
    padding: 20px;
    border-radius: 20px;
    width: 90%;
    max-width: 450px;
    text-align: center;
    z-index: 3;
  }

  h2 {
    font-size: 3.9rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  .btn {
    display: block;
    width: 90%;
    max-width: 280px;
    padding: 15px;
    margin: 15px auto;
    font-size: 18px;
    font-weight: bold;
    color: black;
    background-color: white;
    border: 2px solid black;
    border-radius: 40px;
    text-decoration: none;
    text-align: center;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .btn:hover {
    background-color: #4f46e5;
    color: white;
  }

  .profile-btn {
    position: absolute;
    top: 15px;
    left: 15px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: 1.5px solid black;
    font-size: 14px;
    font-weight: normal;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    color: black;
    z-index: 10;
    backdrop-filter: blur(10px);
  }

  .profile-btn:hover {
    background: #4f46e5;
    color: white;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.7;
    z-index: 1;
  }
</style>

<!-- 12 Background Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<!-- Dashboard Box -->
<div class="container">
  <div class="dashboard-box">
    <h2>SocialQ</h2>
    <div class="btn" on:click={() => goTo('/mirroring/settings')}>Mirroring Game</div>
    <div class="btn" on:click={() => goTo('/facial-recognition/settings')}>Recognition Quiz</div>
    <div class="btn" on:click={() => goTo('/transition-recognition/settings')}>Transition Recognition</div>
  </div>
</div>
