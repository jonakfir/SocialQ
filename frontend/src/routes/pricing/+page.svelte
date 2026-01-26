<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  let billingPeriod: 'monthly' | 'yearly' = 'yearly';
  let appear = false;

  onMount(() => {
    appear = true;
  });

  const memberships = [
    {
      name: 'Family Membership',
      monthlyPrice: 25,
      yearlyPrice: 250,
      features: [
        'Up to 4 family members',
        'Unlimited training sessions',
        'Progress tracking',
        'All emotion modules',
        'Priority support'
      ],
      buttonText: 'Upgrade to Pro Package',
      buttonColor: '#4f46e5'
    },
    {
      name: 'Buy One, Give One',
      monthlyPrice: 40,
      yearlyPrice: 400,
      features: [
        'Full access for you',
        'Gift access to someone',
        'Unlimited training',
        'All emotion modules',
        'BoGo Pro CheckMark Icon'
      ],
      buttonText: 'BoGo Pro',
      buttonColor: '#4f46e5'
    },
    {
      name: 'Class Membership',
      monthlyPrice: 200,
      yearlyPrice: 2000,
      features: [
        'Up to 30 students',
        'Teacher dashboard',
        'Class progress tracking',
        'All emotion modules',
        'Bulk management tools'
      ],
      buttonText: 'Class Membership Options',
      buttonColor: '#6b7280'
    },
    {
      name: 'Behavioral Health Practice & Clinics',
      monthlyPrice: 45,
      yearlyPrice: 500,
      features: [
        '5 seats: $45/mo start',
        '10 seats: $80/mo',
        '20+ seats: Custom pricing'
      ],
      buttonText: 'Button',
      buttonColor: '#6b7280'
    }
  ];

  $: currentPrices = billingPeriod === 'monthly' 
    ? memberships.map(m => ({ ...m, price: m.monthlyPrice, period: '/mo' }))
    : memberships.map(m => ({ ...m, price: m.yearlyPrice, period: '/yr' }));
</script>

<svelte:head>
  <title>AboutFace™ Pro Membership</title>
</svelte:head>

<style>
  @import '/static/style.css';

  .pricing-container {
    min-height: 100vh;
    padding: 24px;
    background: transparent;
    position: relative;
  }

  .header-section {
    text-align: center;
    margin-bottom: 32px;
  }

  .membership-title {
    font-family: 'Georgia', serif;
    font-size: 2.5rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
    margin-bottom: 16px;
  }

  .toggle-container {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-bottom: 40px;
  }

  .toggle-btn {
    padding: 10px 20px;
    border: 2px solid #4f46e5;
    background: white;
    color: #4f46e5;
    border-radius: 9999px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-btn.active {
    background: #4f46e5;
    color: white;
  }

  .memberships-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .membership-card {
    background: rgba(0,0,0,0.85);
    border-radius: 16px;
    padding: 24px;
    color: white;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    backdrop-filter: blur(10px);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .membership-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
  }

  .membership-name {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 16px;
  }

  .membership-price {
    font-size: 2rem;
    font-weight: 900;
    margin-bottom: 20px;
  }

  .membership-features {
    list-style: none;
    padding: 0;
    margin: 0 0 24px 0;
  }

  .membership-features li {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }

  .membership-features li:last-child {
    border-bottom: none;
  }

  .membership-button {
    width: 100%;
    padding: 14px 20px;
    border: none;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .membership-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0,0,0,0.3);
  }

  .membership-button:active {
    transform: translateY(0);
  }

  .sibling-addon {
    margin-top: 12px;
    padding: 12px;
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .blobs {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="pricing-container">
  <div class="header-section" in:fade={{ duration: 300 }}>
    <h1 class="membership-title">AboutFace™ Pro Membership</h1>
    
    <div class="toggle-container">
      <button
        class="toggle-btn {billingPeriod === 'monthly' ? 'active' : ''}"
        on:click={() => billingPeriod = 'monthly'}
      >
        Monthly
      </button>
      <button
        class="toggle-btn {billingPeriod === 'yearly' ? 'active' : ''}"
        on:click={() => billingPeriod = 'yearly'}
      >
        Yearly
      </button>
    </div>
  </div>

  <div class="memberships-grid">
    {#each currentPrices as membership, index}
      <div class="membership-card" in:fade={{ duration: 300, delay: index * 100 }}>
        <div class="membership-name">{membership.name}</div>
        <div class="membership-price">
          ${membership.price}{membership.period}
          {#if membership.name === 'Class Membership' || membership.name === 'Behavioral Health Practice & Clinics'}
            <span style="font-size: 1rem; font-weight: 400;"> start</span>
          {/if}
        </div>
        <ul class="membership-features">
          {#each membership.features as feature}
            <li>{feature}</li>
          {/each}
        </ul>
        {#if membership.name === 'Family Membership' && billingPeriod === 'yearly'}
          <div class="sibling-addon">Sibling Add On $5/mo</div>
        {/if}
        <button
          class="membership-button"
          style="background: {membership.buttonColor}; color: white;"
          on:click={() => alert(`Upgrading to ${membership.name}`)}
        >
          {membership.buttonText}
        </button>
      </div>
    {/each}
  </div>
</div>
