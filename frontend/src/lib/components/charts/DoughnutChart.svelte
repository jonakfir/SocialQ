<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  
  Chart.register(...registerables);
  
  export let data: { labels: string[]; datasets: any[] };
  export let options: any = {};
  
  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false
      }
    }
  };
  
  onMount(() => {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    chart = new Chart(ctx, {
      type: 'doughnut',
      data,
      options: { ...defaultOptions, ...options }
    });
  });
  
  onDestroy(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  });
  
  // Update chart when data changes
  $: if (chart && data) {
    chart.data = data;
    chart.update();
  }
</script>

<div class="chart-container">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-container {
    position: relative;
    width: 100%;
    min-height: 240px;
    max-height: 380px;
  }

  canvas { display: block; }
</style>

