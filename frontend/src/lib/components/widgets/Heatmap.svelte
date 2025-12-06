<script lang="ts">
  export let data: Record<string, number> = {}; // { '2024-01-01': 5, ... }
  export let title: string = 'Activity Heatmap';
  
  function getIntensity(value: number, max: number): string {
    if (max === 0) return '0';
    const ratio = value / max;
    if (ratio === 0) return '0';
    if (ratio < 0.25) return '1';
    if (ratio < 0.5) return '2';
    if (ratio < 0.75) return '3';
    return '4';
  }
  
  function generateHeatmapData() {
    const dates = Object.keys(data).sort();
    if (dates.length === 0) return [];
    
    const max = Math.max(...Object.values(data));
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeks: Array<Array<{ date: string; value: number; intensity: string; day: number }>> = [];
    
    let currentWeek: Array<{ date: string; value: number; intensity: string; day: number }> = [];
    
    dates.forEach(dateStr => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const value = data[dateStr] || 0;
      const intensity = getIntensity(value, max);
      
      // Start new week on Sunday
      if (day === 0 && currentWeek.length > 0) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
      
      currentWeek.push({ date: dateStr, value, intensity, day });
    });
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return weeks;
  }
  
  $: weeks = generateHeatmapData();
  $: maxValue = Math.max(...Object.values(data), 0);
  $: maxDate = maxValue > 0 ? Object.keys(data).find(d => data[d] === maxValue) : null;
  $: maxDateFormatted = maxDate ? new Date(maxDate).toLocaleDateString() : 'N/A';
</script>

<div class="heatmap">
  <div class="heatmap-header">
    <h3>{title}</h3>
    <div class="heatmap-legend">
      <span class="legend-label">Less</span>
      <div class="legend-colors">
        <div class="legend-color intensity-0"></div>
        <div class="legend-color intensity-1"></div>
        <div class="legend-color intensity-2"></div>
        <div class="legend-color intensity-3"></div>
        <div class="legend-color intensity-4"></div>
      </div>
      <span class="legend-label">More</span>
    </div>
  </div>
  <div class="heatmap-grid">
    {#each weeks as week}
      <div class="heatmap-week">
        {#each week as cell}
          <div 
            class="heatmap-cell intensity-{cell.intensity}" 
            title="{new Date(cell.date).toLocaleDateString()}: {cell.value} activities"
          >
            {cell.value > 0 ? cell.value : ''}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if maxValue > 0}
    <div class="heatmap-footer">
      Max: {maxValue} activities on {maxDateFormatted}
    </div>
  {/if}
</div>

<style>
  .heatmap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .heatmap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  .heatmap h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .legend-label {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .legend-colors {
    display: flex;
    gap: 2px;
  }
  
  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }
  
  .legend-color.intensity-0 { background: #ebedf0; }
  .legend-color.intensity-1 { background: #9be9a8; }
  .legend-color.intensity-2 { background: #40c463; }
  .legend-color.intensity-3 { background: #30a14e; }
  .legend-color.intensity-4 { background: #216e39; }
  
  .heatmap-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.5rem;
    background: rgba(255,255,255,.1);
    border-radius: 8px;
  }
  
  .heatmap-week {
    display: flex;
    gap: 2px;
  }
  
  .heatmap-cell {
    width: 24px;
    height: 24px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.625rem;
    font-weight: 600;
    color: #111;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .heatmap-cell:hover {
    transform: scale(1.2);
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
  }
  
  .heatmap-cell.intensity-0 { background: #ebedf0; }
  .heatmap-cell.intensity-1 { background: #9be9a8; }
  .heatmap-cell.intensity-2 { background: #40c463; }
  .heatmap-cell.intensity-3 { background: #30a14e; }
  .heatmap-cell.intensity-4 { background: #216e39; color: white; }
  
  .heatmap-footer {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: center;
  }
</style>

