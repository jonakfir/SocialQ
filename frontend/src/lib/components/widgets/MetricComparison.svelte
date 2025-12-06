<script lang="ts">
  export let metrics: Array<{
    label: string;
    current: number;
    previous: number;
    unit?: string;
    color?: string;
  }> = [];
</script>

<div class="metric-comparison">
  <h3>Period Comparison</h3>
  <div class="metrics-list">
    {#each metrics as metric (metric.label)}
      {@const change = metric.previous > 0 ? ((metric.current - metric.previous) / metric.previous) * 100 : 0}
      {@const isPositive = change >= 0}
      <div class="metric-item">
        <div class="metric-header">
          <span class="metric-label">{metric.label}</span>
          <span class="metric-change" class:positive={isPositive} class:negative={!isPositive}>
            {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </span>
        </div>
        <div class="metric-values">
          <div class="metric-current">
            <span class="metric-value">{metric.current}</span>
            {#if metric.unit}
              <span class="metric-unit">{metric.unit}</span>
            {/if}
          </div>
          <div class="metric-previous">
            vs previous: {metric.previous} {metric.unit || ''}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .metric-comparison {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .metric-comparison h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  
  .metrics-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .metric-item {
    padding: 1rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.2);
    transition: all 0.2s;
  }
  
  .metric-item:hover {
    background: linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.15));
    transform: translateY(-2px);
  }
  
  .metric-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .metric-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
  }
  
  .metric-change {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  
  .metric-change.positive {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
  
  .metric-values {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  
  .metric-current {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }
  
  .metric-value {
    font-size: 1.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .metric-unit {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .metric-previous {
    font-size: 0.75rem;
    color: #9ca3af;
  }
</style>

