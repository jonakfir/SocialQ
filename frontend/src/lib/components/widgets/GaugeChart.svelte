<script lang="ts">
  import { onMount } from 'svelte';
  
  export let value: number; // 0-100
  export let label: string = '';
  export let size: number = 200;
  export let strokeWidth: number = 20;
  export let color: string = '#4f46e5';
  /** When true, use light text/arc for dark card backgrounds */
  export let darkBackground: boolean = false;
  
  let canvas: HTMLCanvasElement;
  
  function drawGauge() {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = size;
    const height = size / 2;
    canvas.width = width;
    canvas.height = height + 20; // Extra space for label
    
    const centerX = width / 2;
    const centerY = height;
    const radius = (width - strokeWidth) / 2 - 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const bgStroke = darkBackground ? 'rgba(255,255,255,0.25)' : '#e5e7eb';
    const valueFill = darkBackground ? '#f1f5f9' : '#111';
    const labelFill = darkBackground ? 'rgba(255,255,255,0.85)' : '#6b7280';

    // Draw background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
    ctx.strokeStyle = bgStroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Draw value arc
    const normalizedValue = Math.min(Math.max(value, 0), 100);
    const angle = (normalizedValue / 100) * Math.PI;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, Math.PI - angle, true);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Draw value text
    ctx.fillStyle = valueFill;
    ctx.font = 'bold 32px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${normalizedValue.toFixed(0)}%`, centerX, centerY - 10);
    
    // Draw label
    if (label) {
      ctx.fillStyle = labelFill;
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(label, centerX, centerY + 25);
    }
  }
  
  $: if (canvas) {
    drawGauge();
  }
  
  onMount(() => {
    drawGauge();
  });
</script>

<div class="gauge-container">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .gauge-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
  }
</style>

