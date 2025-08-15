<script>
  import { goto } from '$app/navigation';
  const start = () => goto('/login');
</script>

<svelte:head>
  <title>SocialQ</title>
</svelte:head>

<style>
  @import '/static/style.css'; /* keeps your blob background if you use it */

  :global(html, body){ margin:0; height:100%; }

  .stage{
    position:relative;
    min-height:100vh;
    display:grid;
    place-items:center;
    overflow:hidden;
  }

  .hero{
    width:min(960px,92vw);
    padding:clamp(28px,6vw,60px);
    border-radius:28px;
    background:rgba(255,255,255,.55);
    backdrop-filter:blur(16px);
    box-shadow:0 20px 60px rgba(0,0,0,.18);
    text-align:center;
  }

  .title{
    font-size: 4.9rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  .dash{
    width:min(560px,70vw);
    height:10px;
    margin:0 auto 22px;
    border-radius:9999px;
    background:
      repeating-linear-gradient(90deg,#10b981 0 48px,transparent 48px 76px);
    mask:linear-gradient(90deg,transparent 0,#000 12%,#000 88%,transparent 100%);
    opacity:0;
    transform:translateY(-8px) scaleX(.9);
    animation: draw .9s ease-out .18s forwards;
  }

  .subtitle{
    font-size:clamp(16px,2.2vw,22px);
    color:#374151;
    margin:0 0 28px;
    opacity:0;
    transform:translateY(18px);
    animation: popin .55s ease-out .22s forwards;
  }

  .cta{
    display:inline-block;
    padding:14px 22px;
    border-radius:9999px;
    font-weight:900;
    font-size:clamp(14px,1.8vw,18px);
    background:#4f46e5;
    color:#fff;
    border:2px solid #4f46e5;
    cursor:pointer;
    box-shadow:0 10px 28px rgba(79,70,229,.35);
    transition:transform .06s ease, filter .2s ease;
    opacity:0;
    transform:translateY(16px);
    animation: popin .5s ease-out .3s forwards;
  }
  .cta:hover{ filter:brightness(1.05); }
  .cta:active{ transform:translateY(1px); }

  @keyframes popin{
    to { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes draw{
    to { opacity:1; transform:translateY(0) scaleX(1); filter:blur(0); }
  }

  @media (prefers-reduced-motion: reduce){
    .title,.dash,.subtitle,.cta{ animation:none; opacity:1; transform:none; }
  }
</style>

<!-- Optional blob background -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
  <div class="hero">
    <h1 class="title">Welcome to SocialQ</h1>
    <div class="dash"></div>
    <p class="subtitle">Learn, practice, and level up your social–emotional skills.</p>
    <button class="cta" on:click={start}>Get Started</button>
  </div>
</div>
