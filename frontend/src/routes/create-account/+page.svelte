<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';
  import { fade } from 'svelte/transition';

  type UserType = 'myself' | 'my_child' | 'my_student' | 'someone_else';
  type StepId =
    | 'ageOver18'
    | 'email'
    | 'password'
    | 'userName'
    | 'beneficiaryName'
    | 'birthdayOptional'
    | 'teacherOptional'
    | 'doctorOptional'
    | 'parentOptional'
    | 'canRead'
    | 'isVerbal'
    | 'goals';

  const GOALS: { id: string; label: string; subtitle: string }[] = [
    { id: 'just_try', label: 'Just here to try', subtitle: 'Daily free round of each game' },
    { id: 'learn_emotions', label: 'Learn to Recognize Emotions', subtitle: 'Start free trial' },
    { id: 'join_pro', label: 'Join AboutFace Pro!', subtitle: 'Membership Only' }
  ];

  function stepsFor(userType: UserType): StepId[] {
    switch (userType) {
      case 'myself':
      case 'someone_else':
        return ['ageOver18', 'userName', 'email', 'password', 'goals'];
      case 'my_child':
        return ['email', 'password', 'beneficiaryName', 'birthdayOptional', 'teacherOptional', 'doctorOptional', 'canRead', 'isVerbal', 'goals'];
      case 'my_student':
        return ['email', 'password', 'beneficiaryName', 'birthdayOptional', 'parentOptional', 'doctorOptional', 'canRead', 'isVerbal', 'goals'];
      default:
        return ['ageOver18', 'userName', 'email', 'password', 'goals'];
    }
  }

  function skippable(step: StepId): boolean {
    return ['birthdayOptional', 'teacherOptional', 'doctorOptional', 'parentOptional'].includes(step);
  }

  $: userTypeRaw = $page.url.searchParams.get('type') || 'myself';
  $: userType = (userTypeRaw === 'child' ? 'my_child' : userTypeRaw) as UserType;
  $: steps = stepsFor(userType);
  $: stepIndex = Math.max(0, Math.min(stepIdx, steps.length - 1));
  $: currentStep = steps[stepIndex] ?? steps[0] ?? 'ageOver18';

  let stepIdx = 0;
  let error = '';
  let loading = false;
  let acceptedTerms = false;
  let termsOpen = false;

  // Form data
  let isOver18: boolean | null = null;
  let userName = '';
  let beneficiaryName = '';
  let email = '';
  let password = '';
  let showPassword = false;
  let birthday = '';
  let teacherEmail = '';
  let doctorEmail = '';
  let doctorName = '';
  let parentName = '';
  let parentEmail = '';
  let isLiterate: boolean | null = null;
  let isVerbal: boolean | null = null;
  let goal: string = '';

  function promptFor(step: StepId): string {
    switch (step) {
      case 'beneficiaryName':
        return userType === 'my_student' ? "What is Your Student's Name" : "What is Your Child's Name";
      case 'birthdayOptional':
        return userType === 'my_student' ? "What is Your Student's Birthday (optional)" : "What is Your Child's Birthday (optional)";
      case 'teacherOptional':
        return "Your Child's Teacher (optional)";
      case 'doctorOptional':
        return userType === 'my_student' ? 'Doctor Information (optional)' : "Your Child's Doctor (optional)";
      case 'parentOptional':
        return 'Parent Information (optional)';
      case 'canRead':
        return userType === 'my_student' ? 'Can your Student Read?' : 'Can your Child Read?';
      case 'isVerbal':
        return userType === 'my_student' ? 'Is Your Student Verbal?' : 'Is Your Child Verbal?';
      case 'goals':
        return userType === 'my_student' ? 'What are your Goals for your Student' : userType === 'my_child' ? 'What are your Goals for your Child' : 'What are your Goals';
      case 'ageOver18':
        return 'Are you over 18?';
      case 'email':
        return 'Enter an Email Address';
      case 'password':
        return 'Create a Password';
      case 'userName':
        return 'What is Your Name';
      default:
        return step;
    }
  }

  function validateStep(): boolean {
    error = '';
    switch (currentStep) {
      case 'ageOver18':
        if (isOver18 === null) { error = 'Please select Yes or No'; return false; }
        break;
      case 'email':
        const e = email.trim();
        if (!e) { error = 'Please enter an email'; return false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { error = 'Please enter a valid email'; return false; }
        break;
      case 'password':
        if (password.length < 6) { error = 'Password must be at least 6 characters'; return false; }
        break;
      case 'userName':
        if (!userName.trim()) { error = 'Please enter your name'; return false; }
        break;
      case 'beneficiaryName':
        if (!beneficiaryName.trim()) { error = 'Please enter the name'; return false; }
        break;
      case 'canRead':
        if (isLiterate === null) { error = 'Please select Yes or No'; return false; }
        break;
      case 'isVerbal':
        if (isVerbal === null) { error = 'Please select Yes or No'; return false; }
        break;
      case 'goals':
        if (!goal) { error = 'Please select a goal'; return false; }
        if (!acceptedTerms) { error = 'Please accept the Terms and Conditions'; return false; }
        break;
      default:
        break;
    }
    return true;
  }

  function goBack() {
    error = '';
    if (stepIndex > 0) stepIdx--;
    else goto('/register');
  }

  function nextStep() {
    if (!validateStep()) return;
    if (stepIndex < steps.length - 1) stepIdx++;
  }

  const SERVICES_URL = 'https://www.social-q.net/services';

  async function submit() {
    if (!validateStep()) return;
    loading = true;
    error = '';

    const e = email.trim().toLowerCase();
    const profile: Record<string, unknown> = {
      user_type: userType,
      goal: goal || null
    };
    if (isOver18 !== null) profile.is_over_18 = isOver18;
    if (isVerbal !== null) profile.is_verbal = isVerbal;
    if (isLiterate !== null) profile.is_literate = isLiterate;
    if (beneficiaryName.trim()) profile.beneficiary_name = beneficiaryName.trim();
    else if (userName.trim()) profile.beneficiary_name = userName.trim();
    if (birthday.trim()) profile.birthday = birthday.trim();
    if (teacherEmail.trim()) profile.teacher_email = teacherEmail.trim();
    if (doctorEmail.trim()) profile.doctor_email = doctorEmail.trim();
    if (doctorName.trim()) profile.doctor_name = doctorName.trim();
    if (parentName.trim()) profile.parent_name = parentName.trim();
    if (parentEmail.trim()) profile.parent_email = parentEmail.trim();

    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, password, profile })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.ok || data.user)) {
        if (data.token && typeof window !== 'undefined') {
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('email', data.user?.email ?? e);
          if (data.user?.id != null) localStorage.setItem('userId', String(data.user.id));
        }
        try {
          await apiFetch('/api/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: e, backendUserId: data.user?.id, password })
          });
        } catch (_) {}
        // Learn to Recognize Emotions / Join AboutFace Pro → account created with daily free play, then send to services
        if (goal === 'learn_emotions' || goal === 'join_pro') {
          window.location.href = SERVICES_URL;
        } else {
          goto('/dashboard');
        }
        return;
      }
      error = data.error || `Registration failed (${res.status})`;
    } catch (_) {
      error = 'Network error';
    } finally {
      loading = false;
    }
  }

  function ripple(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = d + 'px';
    span.style.left = (e.clientX - rect.left - d / 2) + 'px';
    span.style.top = (e.clientY - rect.top - d / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }
</script>

<svelte:head>
  <title>Create Account • AboutFace</title>
</svelte:head>

<style>
  .onboarding-stage {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    /* Background art (web.png) with dark overlay so it shows through */
    background-image: linear-gradient(
      180deg,
      rgba(15, 20, 46, 0.5) 0%,
      rgba(26, 31, 71, 0.55) 50%,
      rgba(15, 20, 46, 0.5) 100%
    ), url('/web.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    isolation: isolate;
  }

  .scroll-area {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .step-content {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    opacity: 1;
    flex-shrink: 0;
  }

  .speech-bubble {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
  }
  .speech-bubble img {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }
  .speech-bubble .prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: #e8c547;
    text-align: center;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .input-group {
    width: 100%;
    max-width: 320px;
  }
  .input-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    margin-bottom: 8px;
  }
  .input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
    box-sizing: border-box;
  }
  .input::placeholder { color: #9ca3af; }
  .pw-wrap { position: relative; }
  .pw-wrap .input { padding-right: 44px; }
  .pw-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.7;
  }

  .yes-no-row {
    display: flex;
    gap: 16px;
    width: 100%;
    max-width: 320px;
  }
  .yn-btn {
    flex: 1;
    height: 52px;
    border-radius: 14px;
    border: 2px solid rgba(115, 166, 242, 0.6);
    background: rgba(115, 166, 242, 0.25);
    color: white;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .yn-btn.selected {
    background: rgba(115, 166, 242, 0.9);
    border-color: rgba(115, 166, 242, 1);
  }
  .yn-btn:hover { background: rgba(115, 166, 242, 0.4); }

  .goals-list {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .goal-btn {
    width: 100%;
    padding: 16px;
    border-radius: 14px;
    border: 2px solid rgba(115, 166, 242, 0.6);
    background: rgba(115, 166, 242, 0.25);
    color: white;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .goal-btn:hover { background: rgba(115, 166, 242, 0.4); }
  .goal-btn.selected {
    background: rgba(115, 166, 242, 0.9);
    border-color: rgba(115, 166, 242, 1);
  }
  .goal-btn .label { font-size: 1rem; font-weight: 600; display: block; }
  .goal-btn .sub { font-size: 0.75rem; color: rgba(255,255,255,0.85); margin-top: 4px; }

  .terms-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    color: rgba(255,255,255,0.9);
    margin-top: 8px;
  }
  .terms-row input { width: 18px; height: 18px; }
  .terms-row a { color: #73a6f2; text-decoration: underline; cursor: pointer; }

  .bottom-bar {
    padding: 20px 24px max(24px, env(safe-area-inset-bottom));
    background: #1a1f47;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bottom-bar .row {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: center;
  }
  .sec-btn {
    flex: 1;
    max-width: 160px;
    height: 46px;
    border-radius: 9999px;
    border: 1.5px solid rgba(115, 166, 242, 0.6);
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .sec-btn:hover { background: rgba(115, 166, 242, 0.2); }
  .pri-btn {
    flex: 1;
    max-width: 200px;
    height: 48px;
    border-radius: 9999px;
    border: none;
    background: rgba(115, 166, 242, 0.95);
    color: white;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    transition: filter 0.2s;
    position: relative;
    overflow: hidden;
  }
  .pri-btn:hover:not(:disabled) { filter: brightness(1.05); }
  .pri-btn:disabled { opacity: 0.7; cursor: not-allowed; }

  .error-msg { color: #e57373; font-size: 0.875rem; font-weight: 600; margin-top: 8px; }
  .back-link { background: none; border: none; font-size: 0.875rem; color: rgba(255,255,255,0.85); margin-top: 12px; cursor: pointer; text-decoration: underline; }
  .ripple { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.5); transform: scale(0); animation: rip 0.6s ease-out forwards; pointer-events: none; }
  @keyframes rip { to { transform: scale(2.6); opacity: 0; } }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 10; padding: 16px;
  }
  .modal {
    width: min(900px, 92vw); max-height: 90vh; background: #fff; border-radius: 16px; padding: 20px; overflow: auto;
  }
  .modal h3 { margin: 0 0 8px; }
  .modal-body { line-height: 1.5; overflow: auto; max-height: 70vh; }
  .modal-actions { margin-top: 14px; }
  .policy h4 { margin-top: 1rem; }
  .policy ul { padding-left: 1.2rem; }
</style>

<div class="onboarding-stage">
  <div class="scroll-area">
    <div class="step-content">
      <div class="speech-bubble">
        <img src="/BUB1A.png" alt="" width="56" height="56" />
        <p class="prompt">{promptFor(currentStep)}</p>
      </div>

      {#if currentStep === 'ageOver18'}
        <div class="yes-no-row">
          <button type="button" class="yn-btn" class:selected={isOver18 === true} on:click={() => { isOver18 = true; error = ''; if (stepIndex < steps.length - 1) stepIdx++; }}>Yes</button>
          <button type="button" class="yn-btn" class:selected={isOver18 === false} on:click={() => { isOver18 = false; error = ''; if (stepIndex < steps.length - 1) stepIdx++; }}>No</button>
        </div>
        <button type="button" class="back-link" on:click={() => goto('/register')}>Back to Register</button>
      {:else if currentStep === 'email'}
        <div class="input-group">
          <label>Email</label>
          <input class="input" type="email" bind:value={email} placeholder="your@email.com" />
        </div>
      {:else if currentStep === 'password'}
        <div class="input-group">
          <label>Password</label>
          <div class="pw-wrap">
            <input class="input" type={showPassword ? 'text' : 'password'} value={password} on:input={(e) => password = e.currentTarget?.value ?? ''} placeholder="Min 6 characters" />
            <button type="button" class="pw-toggle" on:click={() => showPassword = !showPassword} aria-label="Toggle password">{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      {:else if currentStep === 'userName'}
        <div class="input-group">
          <label>Your Name</label>
          <input class="input" type="text" bind:value={userName} placeholder="Name" />
        </div>
      {:else if currentStep === 'beneficiaryName'}
        <div class="input-group">
          <label>{userType === 'my_student' ? "Student's Name" : "Child's Name"}</label>
          <input class="input" type="text" bind:value={beneficiaryName} placeholder="Name" />
        </div>
      {:else if currentStep === 'birthdayOptional'}
        <div class="input-group">
          <label>Birthday (optional)</label>
          <input class="input" type="date" bind:value={birthday} />
        </div>
      {:else if currentStep === 'teacherOptional'}
        <div class="input-group">
          <label>Teacher's Email (optional)</label>
          <input class="input" type="email" bind:value={teacherEmail} placeholder="teacher@school.edu" />
        </div>
      {:else if currentStep === 'doctorOptional'}
        <div class="input-group" style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label>Doctor's Email (optional)</label>
            <input class="input" type="email" bind:value={doctorEmail} placeholder="email" />
          </div>
          <div>
            <label>Doctor's Name (optional)</label>
            <input class="input" type="text" bind:value={doctorName} placeholder="Name" />
          </div>
        </div>
      {:else if currentStep === 'parentOptional'}
        <div class="input-group" style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label>Parent Name (optional)</label>
            <input class="input" type="text" bind:value={parentName} placeholder="Name" />
          </div>
          <div>
            <label>Parent Email (optional)</label>
            <input class="input" type="email" bind:value={parentEmail} placeholder="email" />
          </div>
        </div>
      {:else if currentStep === 'canRead'}
        <div class="yes-no-row">
          <button type="button" class="yn-btn" class:selected={isLiterate === true} on:click={() => isLiterate = true}>Yes</button>
          <button type="button" class="yn-btn" class:selected={isLiterate === false} on:click={() => isLiterate = false}>No</button>
        </div>
      {:else if currentStep === 'isVerbal'}
        <div class="yes-no-row">
          <button type="button" class="yn-btn" class:selected={isVerbal === true} on:click={() => isVerbal = true}>Yes</button>
          <button type="button" class="yn-btn" class:selected={isVerbal === false} on:click={() => isVerbal = false}>No</button>
        </div>
      {:else if currentStep === 'goals'}
        <div class="goals-list">
          {#each GOALS as g}
            <button type="button" class="goal-btn" class:selected={goal === g.id} on:click={() => goal = g.id}>
              <span class="label">{g.label}</span>
              <span class="sub">{g.subtitle}</span>
            </button>
          {/each}
        </div>
        <div class="terms-row">
          <input type="checkbox" id="terms" bind:checked={acceptedTerms} />
          <label for="terms">
            I agree to the <a href="#" on:click|preventDefault={() => (termsOpen = true)}>Terms and Conditions</a>
          </label>
        </div>
      {/if}

      {#if error}<p class="error-msg">{error}</p>{/if}
    </div>
  </div>

  <footer class="bottom-bar">
    {#if currentStep !== 'ageOver18'}
      <div class="row">
        <button type="button" class="sec-btn" on:click={goBack}>Back</button>
        {#if currentStep === 'goals'}
          <button type="button" class="pri-btn" disabled={loading || !acceptedTerms || !goal} on:click={(ev) => { ripple(ev); submit(); }}>
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        {:else if skippable(currentStep)}
          <button type="button" class="sec-btn" on:click={nextStep}>Next / Skip</button>
        {:else}
          <button type="button" class="pri-btn" on:click={(ev) => { ripple(ev); nextStep(); }}>Next</button>
        {/if}
      </div>
    {/if}
  </footer>
</div>

{#if termsOpen}
  <div class="modal-backdrop" transition:fade on:click={() => (termsOpen = false)}>
    <div class="modal" role="dialog" aria-modal="true" on:click|stopPropagation>
      <h3>Terms and Conditions / Privacy Policy</h3>
      <div class="modal-body">
        <article class="policy">
          <p><strong>Effective Date:</strong> August 29, 2025</p>
          <p>SocialQ, Inc. (“SocialQ”) is committed to protecting your privacy. By using AboutFace you agree to our Terms and Privacy Policy. We collect account information, usage data, and (where applicable) biometric data for the purposes stated in the policy. We do not sell your data. Contact: <a href="mailto:info@social-q.net">info@social-q.net</a>. Full policy available at signup.</p>
        </article>
      </div>
      <div class="modal-actions">
        <button type="button" class="sec-btn" style="max-width: none;" on:click={() => (termsOpen = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}
