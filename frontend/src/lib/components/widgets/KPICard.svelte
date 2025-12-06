<script lang="ts">
  export let title: string;
  export let value: string | number;
  export let icon: string;
  export let trend: { value: number; label: string; isPositive: boolean } | undefined = undefined;
  export let sparkline: number[] | undefined = undefined;
  export let color: string = '#4f46e5';
  
  let sparklineCanvas: HTMLCanvasElement;
  
  function drawSparkline() {
    if (!sparklineCanvas || !sparkline || sparkline.length === 0) return;
    
    const ctx = sparklineCanvas.getContext('2d');
    if (!ctx) return;
    
    const width = sparklineCanvas.width;
    const height = sparklineCanvas.height;
    const padding = 4;
    const max = Math.max(...sparkline);
    const min = Math.min(...sparkline);
    const range = max - min || 1;
    
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    sparkline.forEach((val, idx) => {
      const x = padding + (idx / (sparkline.length - 1 || 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  }
  
  $: if (sparklineCanvas && sparkline) {
    drawSparkline();
  }
</script>

<div class="kpi-card">
  <div class="kpi-header">
    <div class="kpi-icon" style="background: {color}20; color: {color}">
      {icon}
    </div>
    {#if trend}
      <div class="kpi-trend" class:positive={trend.isPositive} class:negative={!trend.isPositive}>
        {trend.isPositive ? '↑' : '↓'} {trend.value}% {trend.label}
      </div>
    {/if}
  </div>
  
  <div class="kpi-content">
    <div class="kpi-title">{title}</div>
    <div class="kpi-value">{value}</div>
  </div>
  
  {#if sparkline}
    <div class="kpi-sparkline">
      <canvas bind:this={sparklineCanvas} width="120" height="30"></canvas>
    </div>
  {/if}
</div>

<style>
  .kpi-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.25rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 28px 78px rgba(79,70,229,.35);
    filter: brightness(1.02);
  }
  
  .kpi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .kpi-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .kpi-trend {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  
  .kpi-trend.positive {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
  
  .kpi-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .kpi-title {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .kpi-value {
    font-size: 1.75rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    line-height: 1.2;
  }
  
  .kpi-sparkline {
    margin-top: 0.5rem;
    opacity: 0.7;
  }
  
  .kpi-sparkline canvas {
    width: 100%;
    height: 30px;
    display: block;
  }
</style>

