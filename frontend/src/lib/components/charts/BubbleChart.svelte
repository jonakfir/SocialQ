<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  
  Chart.register(...registerables);
  
  export let data: { datasets: any[] };
  export let options: any = {};
  
  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      },
      tooltip: {
        mode: 'point' as const,
        intersect: false
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Sessions'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Score %'
        }
      }
    }
  };
  
  onMount(() => {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    chart = new Chart(ctx, {
      type: 'bubble',
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
    height: 300px;
    width: 100%;
  }
</style>

