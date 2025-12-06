<script lang="ts">
  export let label: string;
  export let value: number; // 0-100
  export let max: number = 100;
  export let color: string = '#4f46e5';
  export let showValue: boolean = true;
  export let size: 'small' | 'medium' | 'large' = 'medium';
  
  const sizeClasses = {
    small: 'h-2',
    medium: 'h-3',
    large: 'h-4'
  };
  
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
</script>

<div class="progress-container">
  <div class="progress-header">
    <span class="progress-label">{label}</span>
    {#if showValue}
      <span class="progress-value">{percentage.toFixed(1)}%</span>
    {/if}
  </div>
  <div class={"progress-bar size-" + size}>
    <div 
      class="progress-fill" 
      style="width: {percentage}%; background: {color};"
    ></div>
  </div>
</div>

<style>
  .progress-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }
  
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .progress-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
  }
  
  .progress-value {
    font-size: 0.875rem;
    font-weight: 700;
    color: #6b7280;
  }
  
  .progress-bar {
    width: 100%;
    background: rgba(0,0,0,.1);
    border-radius: 9999px;
    overflow: hidden;
    position: relative;
    height: 8px;
  }
  
  .progress-bar.size-small {
    height: 6px;
  }
  
  .progress-bar.size-medium {
    height: 10px;
  }
  
  .progress-bar.size-large {
    height: 14px;
  }
  
  .progress-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.6s ease-out;
    background: linear-gradient(90deg, #4f46e5, #22d3ee);
    box-shadow: 0 2px 8px rgba(79,70,229,.3);
  }
</style>

