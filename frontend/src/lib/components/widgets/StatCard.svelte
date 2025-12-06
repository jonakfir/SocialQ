<script lang="ts">
  export let icon: string;
  export let title: string;
  export let value: string | number;
  export let subtitle: string | undefined = undefined;
  export let trend: { value: number; label: string; isPositive: boolean } | undefined = undefined;
  export let color: string = '#4f46e5';
</script>

<div class="stat-card" style="border-left: 4px solid {color}">
  <div class="stat-icon" style="background: {color}20; color: {color}">
    {icon}
  </div>
  <div class="stat-content">
    <div class="stat-title">{title}</div>
    <div class="stat-value">{value}</div>
    {#if subtitle}
      <div class="stat-subtitle">{subtitle}</div>
    {/if}
    {#if trend}
      <div class="stat-trend" class:positive={trend.isPositive} class:negative={!trend.isPositive}>
        {trend.isPositive ? '↑' : '↓'} {trend.value}% {trend.label}
      </div>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.3s ease;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    position: relative;
    overflow: hidden;
  }
  
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--border-color, #4f46e5), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }
  
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 32px 88px rgba(79,70,229,.4);
    filter: brightness(1.05);
  }
  
  .stat-card:hover::before {
    opacity: 1;
  }
  
  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }
  
  .stat-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  
  .stat-title {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    line-height: 1.1;
  }
  
  .stat-subtitle {
    font-size: 0.875rem;
    color: #9ca3af;
    font-weight: 500;
  }
  
  .stat-trend {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    display: inline-block;
    width: fit-content;
    margin-top: 0.25rem;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  
  .stat-trend.positive {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
</style>

