<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let cardEl: HTMLDivElement | null = null;
  let showPassword = false;
  // account type
  let accountType: 'personal' | 'organization' = 'personal';
  let orgName = '';
  let orgDescription = '';

  // terms and modal
  let accepted = false;
  let termsOpen = false;

  // motion and pointer checks for tilt
  let motionOK = true;
  let finePointer = true;
  if (typeof window !== 'undefined') {
    motionOK    = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    finePointer = matchMedia('(pointer: fine)').matches;
  }

  let rafId = 0;
  function handleTilt(e: MouseEvent) {
    if (!cardEl || !motionOK || !finePointer) return;
    const r = cardEl.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;

    const ry = (px - 0.5) * 5;
    const rx = (0.5 - py) * 3;
    const gx = px * 100;
    const gy = py * 100;

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        cardEl!.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        cardEl!.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        cardEl!.style.setProperty('--gx', gx.toFixed(1) + '%');
        cardEl!.style.setProperty('--gy', gy.toFixed(1) + '%');
        rafId = 0;
      });
    }
  }

  function resetTilt() {
    if (!cardEl) return;
    cardEl.style.setProperty('--rx', '0deg');
    cardEl.style.setProperty('--ry', '0deg');
  }

  // Button ripple action
  function ripple(node: HTMLElement) {
    function onClick(e: MouseEvent) {
      const rect = node.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - d / 2;
      const y = e.clientY - rect.top - d / 2;
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = `${d}px`;
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      node.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
    node.addEventListener('click', onClick);
    return { destroy: () => node.removeEventListener('click', onClick) };
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    error = '';
    const u = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailCheck =  emailRegex.test(u);

    const p = password;
    if (!u || !p) {
      error = 'Please enter an email and password.';
      bump();
      return;
    }
    if (!emailCheck) {
      error = 'Please enter a valid email.';
      bump();
      return;
    }
    if (!accepted) {
      error = 'Please accept the Terms and Conditions.';
      bump();
      return;
    }
    if (accountType === 'organization' && (!orgName || orgName.trim().length < 2)) {
      error = 'Please enter an organization name.';
      bump();
      return;
    }

    loading = true;
    try {
      // Step 1: Register with backend
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u, password: p })
      });
      const data = await res.json().catch(() => ({}));
      
      if (res.ok && (data.ok || data.success)) {
        // Store JWT token for API authentication
        if (data.token && typeof window !== 'undefined') {
          localStorage.setItem('auth_token', data.token);
          console.log('[create-account] Stored JWT token');
        }
        
        // Step 2: Immediately create Prisma user so they have a 9-digit ID and are searchable
        let syncData: any = null;
        try {
          const syncRes = await apiFetch('/api/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: u,
              backendUserId: data.user?.id,
              password: p // Include password so it's stored correctly in Prisma
            })
          });
          syncData = await syncRes.json().catch(() => ({}));
          
          if (syncData.ok) {
            console.log('[create-account] Prisma user synced with ID:', syncData.user?.id);
          } else {
            console.warn('[create-account] Failed to sync Prisma user:', syncData.error);
            // Continue anyway - user will be created lazily on first access
          }
        } catch (syncError) {
          console.warn('[create-account] Error syncing Prisma user:', syncError);
          // Continue anyway - user will be created lazily on first access
        }
        
        // Auto-login after successful registration
        // The backend registration already sets session cookies, so we can go straight to dashboard
        const createdEmail = data.user?.email ?? email;
        const createdId = data.user?.id ?? null;
        if (typeof window !== 'undefined') {
          localStorage.setItem('email', createdEmail);
          if (createdId != null) localStorage.setItem('userId', String(createdId));
        }
        // If organization account selected, request org creation (pending approval)
        if (accountType === 'organization') {
          try {
            // Wait a moment for Prisma user sync to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const orgRes = await apiFetch('/api/organizations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: orgName.trim(), description: orgDescription.trim() || undefined })
            });
            const orgData = await orgRes.json().catch(() => ({}));
            if (orgData.ok && orgData.organization?.id) {
              // Redirect directly to the organization dashboard
              console.log('[create-account] Organization created, redirecting to:', orgData.organization.id);
              goto(`/org/${orgData.organization.id}/dashboard`);
              return;
            } else {
              console.warn('[create-account] Organization create failed:', orgData.error);
              // Still redirect to org hub, but show error
              error = orgData.error || 'Failed to create organization';
            }
          } catch (e: any) {
            console.warn('[create-account] Organization create error:', e);
            error = e?.message || 'Failed to create organization';
          }
          // If we get here, org creation failed - send them to Org hub
          goto('/org');
          return;
        }

        // Otherwise redirect based on role (new users are personal by default)
        const userRole = (typeof syncData === 'object' && syncData?.user?.role) ? syncData.user.role : 'personal';
        goto(userRole === 'admin' ? '/admin' : '/dashboard');
      } else {
        error = data.error || `Registration failed (HTTP ${res.status})`;
        bump();
      }
    } catch {
      error = 'Network error';
      bump();
    } finally {
      loading = false;
    }
  }

  function bump() {
    if (!cardEl) return;
    cardEl.classList.remove('shake');
    void cardEl.offsetWidth;
    cardEl.classList.add('shake');
  }
</script>

<svelte:head>
  <title>Create Account • SocialQ</title>
</svelte:head>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; }

  .auth-wrap{
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    z-index: 1;
    perspective: 1000px; /* tilt depth */
  }

  .card{
    width: 100%;
    max-width: 440px;
    padding: 32px;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(18px);
    border-radius: 18px;
    box-shadow: 0 14px 48px rgba(0,0,0,.18);
    text-align: center;
    box-sizing: border-box;
    will-change: transform, opacity;
    transform-style: preserve-3d;
    transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform .12s ease, box-shadow .2s ease;
    position: relative;
  }

  /* soft glare */
  .card::before{
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: radial-gradient(300px circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.28), transparent 60%);
    opacity: 0;
    transition: opacity .18s ease;
  }
  .card:hover::before{ opacity: 1; }
  .card:hover{ box-shadow: 0 18px 56px rgba(0,0,0,.28); }

  .title{
    font-size: 3.2rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  form{
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 6px;
    padding: 0 1rem;
    box-sizing: border-box;
  }

  .input{
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid rgba(17,17,17,.18);
    background: rgba(255,255,255,.9);
    font-size: 16px;
    outline: none;
    transition: border-color .2s, box-shadow .2s, transform .12s ease;
    box-sizing: border-box;
  }
  .input::placeholder{ color:#9ca3af; }
  .input:focus{
    border-color:#4f46e5;
    box-shadow:0 0 0 4px rgba(79,70,229,.15);
    transform: translateY(-1px);
  }

  .password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-wrapper .input {
    padding-right: 45px;
  }

  .password-toggle {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .password-toggle:hover {
    opacity: 1;
  }

  .password-toggle:active {
    transform: scale(0.95);
  }

  .terms{
    display:flex;
    align-items:center;
    text-align:left;
    gap:10px;
    font-size: 14px;
    color:#111;
    background: rgba(255,255,255,.85);
    border: 1px solid rgba(17,17,17,.12);
    padding: 10px 12px;
    border-radius: 12px;
  }
  .terms input{ width:18px; height:18px; }
  .terms a{ color:#4f46e5; text-decoration: underline; cursor: pointer; }

  .btn{
    position: relative;
    overflow: hidden;
    display:block;
    width:100%;
    padding:12px 16px;
    border-radius:9999px;
    font-weight:800;
    font-size:16px;
    cursor:pointer;
    border:2px solid #111;
    background:#fff;
    color:#111;
    transition:transform .05s ease, filter .2s ease, background .2s ease;
    box-sizing:border-box;
  }
  .btn:hover{ filter:brightness(1.03); }
  .btn:active{ transform:translateY(1px); }

  .btn.primary{
    background:#4f46e5;
    border-color:#4f46e5;
    color:#fff;
  }
  .btn[disabled]{ opacity:.75; cursor:not-allowed; }

  /* Ripple */
  .ripple{
    position:absolute;
    border-radius:50%;
    transform: scale(0);
    animation: ripple .6s ease-out forwards;
    background: rgba(255,255,255,.55);
    pointer-events:none;
  }
  @keyframes ripple{ to { transform: scale(4); opacity: 0; } }

  /* Spinner inside primary button */
  .spinner{
    width: 16px;
    height: 16px;
    margin-right: 8px;
    border: 2px solid transparent;
    border-top-color: #fff;
    border-right-color: #fff;
    border-radius: 50%;
    display: inline-block;
    vertical-align: -3px;
    animation: spin .6s linear infinite;
  }
  @keyframes spin{ to { transform: rotate(360deg); } }

  .muted{ margin-top:8px; font-size:13px; color:#6b7280; }
  .error{ margin-top:10px; color:#b91c1c; font-weight:700; min-height: 1.2em; }

  /* Shake on error */
  .shake{ animation: shake .5s ease; }
  @keyframes shake{
    0%,100%{ transform: translateX(0); }
    20%{ transform: translateX(-6px); }
    40%{ transform: translateX(6px); }
    60%{ transform: translateX(-4px); }
    80%{ transform: translateX(4px); }
  }

  /* modal */
  .modal-backdrop{
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    display: grid;
    place-items: center;
    z-index: 3;
    padding: 16px;
  }
  .modal{
    width: min(900px, 92vw);
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.35);
    padding: 20px;
    text-align: left;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }
  .modal h3{ margin: 0 0 8px; }
  .modal-body{
    color:#111; line-height:1.5;
    overflow: auto; /* scroll long policy */
    max-height: 75vh;
    padding-right: 4px;
  }
  .modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top: 14px; }
  .policy h4 { margin-top: 1rem; }
  .policy ul { padding-left: 1.2rem; }
  .policy address { font-style: normal; line-height: 1.4; }
</style>

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div
    class="card"
    bind:this={cardEl}
    in:fly={{ y: 28, duration: 280, opacity: 0.25 }}
    on:mousemove={handleTilt}
    on:mouseleave={resetTilt}
  >
    <h2 class="title" in:fade={{ duration: 220 }}>Create Account</h2>

    <form on:submit={handleCreate} autocomplete="on" aria-busy={loading}>
      <input class="input" type="text" bind:value={email} placeholder="Email" required />
      <div class="password-wrapper">
        <input 
          class="input" 
          type={showPassword ? 'text' : 'password'} 
          value={password}
          on:input={(e) => password = e.currentTarget.value}
          placeholder="Password" 
          required 
        />
        <button
          type="button"
          class="password-toggle"
          on:click={() => showPassword = !showPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? '👁️' : '👁️‍🗨️'}
        </button>
      </div>

      <label class="terms">
        <input type="checkbox" bind:checked={accepted} aria-label="Accept Terms and Conditions" />
        <span>
          I agree to the
          <a href="#" on:click|preventDefault={() => (termsOpen = true)}>Terms and Conditions</a>
        </span>
      </label>

      <div style="background: rgba(255,255,255,.85); border:1px solid rgba(17,17,17,.12); padding:12px; border-radius:12px; display:grid; gap:10px; text-align:left; color:#111;">
        <div style="font-weight:700;">Account Type</div>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="radio" name="acctType" value="personal" checked={accountType === 'personal'} on:change={() => (accountType = 'personal')} />
          <span>Personal</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="radio" name="acctType" value="organization" checked={accountType === 'organization'} on:change={() => (accountType = 'organization')} />
          <span>Create an Organization (become Org Admin)</span>
        </label>

        {#if accountType === 'organization'}
          <div style="display:grid; gap:10px; margin-top:6px;">
            <input
              class="input"
              type="text"
              placeholder="Organization name"
              bind:value={orgName}
              required
            />
            <input
              class="input"
              type="text"
              placeholder="Organization description (optional)"
              bind:value={orgDescription}
            />
            <div class="muted">Your organization will be pending until approved by a master admin.</div>
          </div>
        {/if}
      </div>

      <button
        use:ripple
        type="submit"
        class="btn primary"
        disabled={loading || !accepted || (accountType === 'organization' && (!orgName || orgName.trim().length < 2))}
      >
        {#if loading}<span class="spinner" aria-hidden="true"></span>Creating…{:else}Create{/if}
      </button>
    </form>

    {#if error}<div class="error">{error}</div>{/if}

    <p class="muted">Have an account already?</p>
    <button use:ripple class="btn" type="button" on:click={() => goto('/login')}>Back to Login</button>
  </div>
</div>

{#if termsOpen}
  <div class="modal-backdrop" transition:fade on:click={() => (termsOpen = false)}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tc-title"
      on:click|stopPropagation
    >
      <h3 id="tc-title">SocialQ Privacy Policy</h3>

      <div class="modal-body">
        <article class="policy">
          <p><strong>Effective Date:</strong> August 29, 2025</p>

          <h4>1. Introduction</h4>
          <p>
            SocialQ, Inc. (“SocialQ,” "we," "our," or "us") is committed to protecting the privacy of our users ("you").
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our
            website <a href="https://www.social-q.net" target="_blank" rel="noopener noreferrer">www.social-q.net</a> and use our services,
            such as the mobile and web application known as AboutFace (the “Application,” or “AboutFace”).
          </p>
          <p>By accessing or using our services, you agree to the terms of this Privacy Policy. If you do not agree, please do not use our services.</p>

          <h4>2. Information We Collect</h4>
          <p>We may collect personal information that you voluntarily provide to us when you register on our site, place an order, subscribe to a newsletter, respond to a survey, fill out a form, or otherwise interact with our services. The types of personal information we may collect include:</p>
          <ul>
            <li><strong>Contact Information:</strong> Name, email address, mailing address, and phone number.</li>
            <li><strong>Account Information:</strong> Username, password, and other registration details.</li>
            <li><strong>Payment Information:</strong> Credit card numbers and other payment details (handled by a secure third-party processor).</li>
            <li><strong>Demographic Information:</strong> Age, gender, and other demographic data.</li>
            <li><strong>User Content:</strong> Any content you post, such as comments, reviews, or forum posts.</li>
          </ul>
          <p>We may also automatically collect certain information when you visit our website, including:</p>
          <ul>
            <li><strong>Log Data:</strong> IP address, browser type, device information, access times, and pages viewed.</li>
            <li><strong>Usage Data:</strong> Information about how you use our services, such as the features you access and the time you spend on them.</li>
            <li><strong>Cookies and Tracking Technologies:</strong> We use cookies, web beacons, and similar technologies to enhance your experience and analyze usage. You can control cookies through your browser settings.</li>
          </ul>

          <h4>3. How We Use Your Information</h4>
          <ul>
            <li>Provide, operate, and maintain our services.</li>
            <li>Process and fulfill your orders and transactions.</li>
            <li>Improve, personalize, and expand our services.</li>
            <li>Understand and analyze how you use our services.</li>
            <li>Communicate with you, including sending you updates, newsletters, and promotional materials.</li>
            <li>Respond to your comments, questions, and requests.</li>
            <li>Detect and prevent fraud and other malicious activities.</li>
            <li>Comply with legal obligations.</li>
          </ul>

          <h4>4. How We Share Your Information</h4>
          <ul>
            <li><strong>With Service Providers:</strong> We may share your information with third-party vendors, consultants, and other service providers who perform services on our behalf, such as payment processing, data analysis, email delivery, and hosting services.</li>
            <li><strong>For Business Transfers:</strong> In the event of a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred to the new owner.</li>
            <li><strong>For Legal Reasons:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).</li>
            <li><strong>With Your Consent:</strong> We may share your information with your explicit consent.</li>
          </ul>

          <h4>5. Your Choices and Rights</h4>
          <ul>
            <li><strong>Access:</strong> You have the right to request a copy of the personal data we hold about you.</li>
            <li><strong>Correction:</strong> You can request that we correct any inaccurate or incomplete information.</li>
            <li><strong>Deletion:</strong> You may request that we delete your personal data under certain circumstances.</li>
            <li><strong>Objection:</strong> You may object to the processing of your data for specific purposes.</li>
            <li><strong>Data Portability:</strong> You have the right to receive your data in a structured, commonly used, and machine-readable format.</li>
            <li><strong>Unsubscribe:</strong> You can opt out of receiving promotional emails from us by following the unsubscribe instructions in those emails.</li>
          </ul>

          <h4>6. Data Security</h4>
          <p>We implement reasonable security measures to protect your information from unauthorized access, alteration, disclosure, or destruction. However, please be aware that no method of transmission over the internet or electronic storage is 100% secure.</p>

          <h4>7. Biometric Data Collection</h4>
          <p>In order to <em>[clearly state the purpose, e.g., "verify your identity," "secure your account," or "enable facial recognition features"]</em>, we may collect, store, and use certain biometric data, including scans of your face geometry derived from the facial images you provide.</p>
          <p><strong>How We Collect It:</strong> We collect this information directly from you when you <em>[describe the action, e.g., "upload a selfie for identity verification," "enroll in our facial recognition login feature," or "use a specific app function"]</em>.</p>
          <p><strong>Purpose of Collection:</strong> We use this data solely for <em>[be very specific, e.g., "verifying your identity against the image on your government-issued ID," "authenticating your login to your account," or "providing the facial recognition feature you've opted into"]</em>. We do not use this data for any other commercial purposes, such as marketing or advertising.</p>
          <p><strong>Data Security and Retention:</strong> We take reasonable security measures to protect your biometric data. We will not sell, lease, or trade your biometric data. We will retain your biometric data only for as long as is necessary to fulfill the purpose for which it was collected or as required by law. After this period, we will securely and permanently destroy the data.</p>
          <p>By providing your facial image, you are giving us your explicit, informed consent to the collection, use, and storage of your biometric data as described in this policy. If you do not agree to this, please do not use the features that require biometric data.</p>

          <h4>8. Children's Privacy</h4>
          <p>Our services are only directed to individuals under the age of 18 with explicit informed consent from those individuals’ parents or guardians.</p>

          <h4>9. Changes to This Privacy Policy</h4>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Effective Date." We encourage you to review this policy periodically.</p>

          <h4>10. Contact Us</h4>
          <address>
            <div>Email: <a href="mailto:info@social-q.net">info@social-q.net</a></div>
            <div>Address: SocialQ, Inc.<br/>18 Via Lampara<br/>San Clemente, CA 92673</div>
          </address>
        </article>
      </div>

      <div class="modal-actions">
        <button class="btn" type="button" on:click={() => (termsOpen = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}
