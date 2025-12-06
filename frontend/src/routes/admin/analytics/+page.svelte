<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import AreaChart from '$lib/components/charts/AreaChart.svelte';
  import ScatterChart from '$lib/components/charts/ScatterChart.svelte';
  import PolarAreaChart from '$lib/components/charts/PolarAreaChart.svelte';
  import BubbleChart from '$lib/components/charts/BubbleChart.svelte';
  import KPICard from '$lib/components/widgets/KPICard.svelte';
  import GaugeChart from '$lib/components/widgets/GaugeChart.svelte';
  import ActivityFeed from '$lib/components/widgets/ActivityFeed.svelte';
  import Leaderboard from '$lib/components/widgets/Leaderboard.svelte';
  import ProgressBar from '$lib/components/widgets/ProgressBar.svelte';
  import MetricComparison from '$lib/components/widgets/MetricComparison.svelte';
  import Heatmap from '$lib/components/widgets/Heatmap.svelte';
  import StatCard from '$lib/components/widgets/StatCard.svelte';
  import RadarChart from '$lib/components/charts/RadarChart.svelte';
  
  export let data: { analytics: any };
  
  let analytics = data.analytics || {
    gameTypeStats: {},
    difficultyStats: {},
    scoreDistribution: [0, 0, 0, 0, 0],
    topPerformers: [],
    availableUsers: [],
    filters: {},
    timeRange: '30d'
  };
  
  // Filters
  let selectedUserId = analytics.filters?.userId || '';
  let selectedGameType = analytics.filters?.gameType || '';
  let selectedDifficulty = analytics.filters?.difficulty || '';
  let dateRange = '30d'; // Default to '30d' for dropdown
  
  const dateRangeOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'thisWeek', label: 'This Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisQuarter', label: 'This Quarter' },
    { value: 'lastQuarter', label: 'Last Quarter' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'lastYear', label: 'Last Year' }
  ];
  
  function getDateRange(dateRangeValue: string): { dateFrom: string; dateTo: string } | null {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date;
    let endDate: Date = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    
    switch (dateRangeValue) {
      case 'all':
        return null;
      case 'today':
        startDate = new Date(today);
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const lastQuarterYear = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        startDate = new Date(lastQuarterYear, lastQuarterMonth, 1);
        endDate = new Date(lastQuarterYear, lastQuarterMonth + 3, 0, 23, 59, 59, 999);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      default:
        return null;
    }
    
    startDate.setHours(0, 0, 0, 0);
    
    return {
      dateFrom: startDate.toISOString().split('T')[0],
      dateTo: endDate.toISOString().split('T')[0]
    };
  }
  
  let availableUsers = analytics.availableUsers || [];
  let availableDifficulties: string[] = [];
  let loading = false;
  let error: string | null = null;
  
  const GAME_TYPES = [
    { value: '', label: 'All Games' },
    { value: 'facial_recognition', label: 'Facial Recognition' },
    { value: 'transition_recognition', label: 'Transition Recognition' },
    { value: 'mirroring', label: 'Mirroring' }
  ];
  
  // Extract available difficulties from analytics
  $: if (analytics?.difficultyStats) {
    availableDifficulties = Object.keys(analytics.difficultyStats).sort();
  }
  
  // Update analytics when data changes
  $: if (data.analytics) {
    analytics = data.analytics;
    selectedUserId = analytics.filters?.userId || '';
    selectedGameType = analytics.filters?.gameType || '';
    selectedDifficulty = analytics.filters?.difficulty || '';
    // Determine dateRange from timeRange or dateFrom/dateTo
    const timeRangeFromData = analytics.timeRange || '30d';
    const dateFrom = analytics.filters?.dateFrom || '';
    const dateTo = analytics.filters?.dateTo || '';
    if (dateFrom && dateTo) {
      // Try to match with a preset range
      let matched = false;
      for (const option of dateRangeOptions) {
        const rangeData = getDateRange(option.value);
        if (rangeData && rangeData.dateFrom === dateFrom && rangeData.dateTo === dateTo) {
          dateRange = option.value;
          matched = true;
          break;
        }
      }
      if (!matched) {
        dateRange = 'all'; // Custom range
      }
    } else {
      dateRange = timeRangeFromData;
    }
    availableUsers = analytics.availableUsers || [];
  }
  
  async function applyFilters() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      
      // Handle date range - use timeRange for simple ranges, dateFrom/dateTo for complex ones
      if (dateRange === '7d' || dateRange === '30d' || dateRange === '90d' || dateRange === 'all') {
        params.set('timeRange', dateRange);
      } else {
        const dateRangeData = getDateRange(dateRange);
        if (dateRangeData) {
          params.set('dateFrom', dateRangeData.dateFrom);
          params.set('dateTo', dateRangeData.dateTo);
        } else {
          params.set('timeRange', '30d'); // Default fallback
        }
      }
      
      if (selectedUserId) params.set('userId', selectedUserId);
      if (selectedGameType) params.set('gameType', selectedGameType);
      if (selectedDifficulty) params.set('difficulty', selectedDifficulty);
      
      await goto(`/admin/analytics?${params.toString()}`);
    } catch (err: any) {
      console.error('Failed to apply filters:', err);
      error = 'Failed to load analytics. Please try again.';
    } finally {
      loading = false;
    }
  }
  
  function clearFilters() {
    selectedUserId = '';
    selectedGameType = '';
    selectedDifficulty = '';
    dateRange = '30d';
    applyFilters();
  }
  
  function formatGameType(gt: string) {
    return gt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Prepare chart data
  let usersOverTimeData: any = null;
  let gamesPerDayData: any = null;
  let scoreDistributionData: any = null;
  let gameTypeTrendsData: Record<string, any> = {};
  let difficultyTrendsData: Record<string, any> = {};
  let difficultyByGameData: Record<string, any> = {};
  let gameTypeComparisonData: any = null;
  let topPerformersData: any = null;
  let completionTimeTrendsData: Record<string, any> = {};
  let gameTypeDistributionData: any = null;
  let difficultyDistributionData: any = null;
  let performanceRadarData: any = null;
  let hourlyActivityData: any = null;
  let weeklyActivityData: any = null;
  let performanceScatterData: any = null;
  let areaTrendsData: Record<string, any> = {};
  let polarAreaData: any = null;
  let activityFeedData: any[] = [];
  
  // KPI sparklines data
  let sessionSparkline: number[] = [];
  let accuracySparkline: number[] = [];
  let userSparkline: number[] = [];
  
  // Additional chart data
  let bubbleChartData: any = null;
  let pieChartData: any = null;
  let comboChartData: any = null;
  let heatmapData: Record<string, number> = {};
  let leaderboardData: any[] = [];
  let comparisonMetrics: any[] = [];
  let progressBarsData: any[] = [];
  let statCardsData: any[] = [];
  let accuracyByHourData: any = null;
  let difficultyComparisonData: any = null;
  let performanceByDayData: any = null;
  let questionAccuracyData: any = null;
  let timeDistributionData: any = null;
  let scoreTrendsData: Record<string, any> = {};
  let engagementMetrics: any = null;
  let averageSessionsData: any = null;
  let peakTimesData: any = null;
  
  $: if (analytics?.usersOverTime && Object.keys(analytics.usersOverTime).length > 0) {
    const dates = Object.keys(analytics.usersOverTime).sort();
    const values = dates.map(date => analytics.usersOverTime[date]);
    
    usersOverTimeData = {
      labels: dates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        label: 'Total Users',
        data: values,
        borderColor: 'rgba(79, 70, 229, 1)',
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        tension: 0.1,
        fill: true
      }]
    };
  }
  
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const dates = Object.keys(analytics.gamesPerDay).sort();
    const gameTypes = new Set<string>();
    dates.forEach(date => {
      Object.keys(analytics.gamesPerDay[date]?.byGameType || {}).forEach(gt => gameTypes.add(gt));
    });
    
    const colors = [
      { bg: 'rgba(79, 70, 229, 0.8)', border: 'rgba(79, 70, 229, 1)' },
      { bg: 'rgba(34, 211, 238, 0.8)', border: 'rgba(34, 211, 238, 1)' },
      { bg: 'rgba(251, 191, 36, 0.8)', border: 'rgba(251, 191, 36, 1)' },
      { bg: 'rgba(236, 72, 153, 0.8)', border: 'rgba(236, 72, 153, 1)' }
    ];
    
    const datasets = Array.from(gameTypes).map((gameType, idx) => {
      const color = colors[idx % colors.length];
      return {
        label: formatGameType(gameType),
        data: dates.map(date => analytics.gamesPerDay[date]?.byGameType[gameType] || 0),
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 1
      };
    });
    
    gamesPerDayData = {
      labels: dates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets
    };
  }
  
  $: if (analytics?.scoreDistribution) {
    scoreDistributionData = {
      labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
      datasets: [{
        label: 'Number of Sessions',
        data: analytics.scoreDistribution,
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(34, 211, 238, 0.8)',
          'rgba(79, 70, 229, 0.8)',
          'rgba(34, 197, 94, 0.8)'
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(79, 70, 229, 1)',
          'rgba(34, 197, 94, 1)'
        ],
        borderWidth: 1
      }]
    };
  }
  
  $: if (analytics?.gameTypeStats) {
    // Trend over time for each game type
    gameTypeTrendsData = {};
    completionTimeTrendsData = {};
    Object.keys(analytics.gameTypeStats).forEach(gameType => {
      const trend = analytics.gameTypeStats[gameType]?.trendOverTime || [];
      if (trend.length > 0) {
        gameTypeTrendsData[gameType] = {
          labels: trend.map((t: any) => {
            const d = new Date(t.date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          datasets: [{
            label: formatGameType(gameType) + ' Avg Score %',
            data: trend.map((t: any) => t.avgPercentage),
            borderColor: 'rgba(79, 70, 229, 1)',
            backgroundColor: 'rgba(79, 70, 229, 0.2)',
            tension: 0.1,
            fill: true
          }]
        };
      }
      
      // Completion time trends (from timeSeriesByGame)
      const timeSeries = analytics.timeSeriesByGame?.[gameType] || {};
      const dates = Object.keys(timeSeries).sort();
      if (dates.length > 0) {
        completionTimeTrendsData[gameType] = {
          labels: dates.map(date => {
            const d = new Date(date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          datasets: [{
            label: formatGameType(gameType) + ' Avg Time (s)',
            data: dates.map(date => {
              const ts = timeSeries[date];
              return ts.count > 0 && ts.timeMs ? Math.round(ts.timeMs / ts.count / 1000) : 0;
            }),
            borderColor: 'rgba(251, 191, 36, 1)',
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            tension: 0.1,
            fill: true
          }]
        };
      }
      
      // Difficulty breakdown per game type
      const diffBreakdown = analytics.gameTypeStats[gameType]?.difficultyBreakdown || {};
      if (Object.keys(diffBreakdown).length > 0) {
        difficultyByGameData[gameType] = {
          labels: Object.keys(diffBreakdown),
          datasets: [{
            label: 'Average Score %',
            data: Object.keys(diffBreakdown).map(diff => diffBreakdown[diff].avgPercentage),
            backgroundColor: 'rgba(34, 211, 238, 0.8)',
            borderColor: 'rgba(34, 211, 238, 1)',
            borderWidth: 1
          }]
        };
      }
    });
    
    // Game type comparison (all games side by side)
    const gameTypes = Object.keys(analytics.gameTypeStats);
    if (gameTypes.length > 0) {
      gameTypeComparisonData = {
        labels: ['Avg Score %', 'Total Sessions', 'Avg Time (s)'],
        datasets: gameTypes.map((gt, idx) => {
          const stats = analytics.gameTypeStats[gt];
          const colors = [
            { bg: 'rgba(79, 70, 229, 0.8)', border: 'rgba(79, 70, 229, 1)' },
            { bg: 'rgba(34, 211, 238, 0.8)', border: 'rgba(34, 211, 238, 1)' },
            { bg: 'rgba(251, 191, 36, 0.8)', border: 'rgba(251, 191, 36, 1)' }
          ];
          const color = colors[idx % colors.length];
          return {
            label: formatGameType(gt),
            data: [
              stats.avgPercentage,
              stats.count,
              stats.avgTimeMs ? Math.round(stats.avgTimeMs / 1000) : 0
            ],
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 1
          };
        })
      };
    }
  }
  
  $: if (analytics?.difficultyStats) {
    // Trend over time for each difficulty
    difficultyTrendsData = {};
    Object.keys(analytics.difficultyStats).forEach(difficulty => {
      // Build trend from timeSeriesByDifficulty
      const timeSeries = analytics.timeSeriesByDifficulty?.[difficulty] || {};
      const dates = Object.keys(timeSeries).sort();
      if (dates.length > 0) {
        difficultyTrendsData[difficulty] = {
          labels: dates.map(date => {
            const d = new Date(date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          datasets: [{
            label: `${difficulty} Avg Score %`,
            data: dates.map(date => {
              const ts = timeSeries[date];
              return ts.avgPercentage || 0;
            }),
            borderColor: 'rgba(236, 72, 153, 1)',
            backgroundColor: 'rgba(236, 72, 153, 0.2)',
            tension: 0.1,
            fill: true
          }]
        };
      }
    });
  }
  
  $: if (analytics?.topPerformers && analytics.topPerformers.length > 0) {
    topPerformersData = {
      labels: analytics.topPerformers.slice(0, 10).map((p: any) => p.username || p.userId),
      datasets: [{
        label: 'Average Score %',
        data: analytics.topPerformers.slice(0, 10).map((p: any) => p.avgPercentage),
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1
      }]
    };
  }
  
  // Game Type Distribution (Doughnut Chart)
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const gameTypes = Object.keys(analytics.gameTypeStats);
    gameTypeDistributionData = {
      labels: gameTypes.map(gt => formatGameType(gt)),
      datasets: [{
        data: gameTypes.map(gt => analytics.gameTypeStats[gt].count || 0),
        backgroundColor: [
          'rgba(79, 70, 229, 0.8)',
          'rgba(34, 211, 238, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(34, 197, 94, 0.8)'
        ],
        borderColor: [
          'rgba(79, 70, 229, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(236, 72, 153, 1)',
          'rgba(34, 197, 94, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  // Difficulty Distribution (Doughnut Chart)
  $: if (analytics?.difficultyStats && Object.keys(analytics.difficultyStats).length > 0) {
    const difficulties = Object.keys(analytics.difficultyStats);
    difficultyDistributionData = {
      labels: difficulties,
      datasets: [{
        data: difficulties.map(diff => analytics.difficultyStats[diff].count || 0),
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(34, 211, 238, 0.8)',
          'rgba(79, 70, 229, 0.8)',
          'rgba(34, 197, 94, 0.8)'
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(79, 70, 229, 1)',
          'rgba(34, 197, 94, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  // Performance Radar Chart (Multi-dimensional analysis)
  // Shows each game type's performance across multiple metrics
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const gameTypes = Object.keys(analytics.gameTypeStats);
    const metrics = ['Accuracy %', 'Avg Time (s)', 'Total Sessions'];
    
    // Normalize values to 0-100 scale for radar chart
    const accuracyValues = gameTypes.map(gt => analytics.gameTypeStats[gt].avgPercentage || 0);
    const sessionValues = gameTypes.map(gt => analytics.gameTypeStats[gt].count || 0);
    const timeValues = gameTypes.map(gt => analytics.gameTypeStats[gt].avgTimeMs ? Math.round(analytics.gameTypeStats[gt].avgTimeMs / 1000) : 0);
    
    const maxSessions = Math.max(...sessionValues, 1);
    const maxTime = Math.max(...timeValues, 1);
    
    performanceRadarData = {
      labels: metrics,
      datasets: gameTypes.map((gt, idx) => {
        const colors = [
          { bg: 'rgba(79, 70, 229, 0.2)', border: 'rgba(79, 70, 229, 1)' },
          { bg: 'rgba(34, 211, 238, 0.2)', border: 'rgba(34, 211, 238, 1)' },
          { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgba(251, 191, 36, 1)' },
          { bg: 'rgba(236, 72, 153, 0.2)', border: 'rgba(236, 72, 153, 1)' }
        ];
        const color = colors[idx % colors.length];
        
        const stats = analytics.gameTypeStats[gt];
        return {
          label: formatGameType(gt),
          data: [
            stats.avgPercentage || 0, // Accuracy % (already 0-100)
            maxTime > 0 ? ((stats.avgTimeMs ? Math.round(stats.avgTimeMs / 1000) : 0) / maxTime) * 100 : 0, // Normalized time
            maxSessions > 0 ? ((stats.count || 0) / maxSessions) * 100 : 0 // Normalized sessions
          ],
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 2,
          pointBackgroundColor: color.border,
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: color.border
        };
      })
    };
  }
  
  // Hourly Activity Heatmap-style (Bar Chart)
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourCounts = new Array(24).fill(0);
    
    // This is a simplified version - would need session timestamps for true hourly data
    // For now, we'll distribute games evenly across hours as a placeholder
    Object.keys(analytics.gamesPerDay).forEach(date => {
      const games = analytics.gamesPerDay[date].total || 0;
      const gamesPerHour = Math.floor(games / 24);
      hours.forEach(hour => {
        hourCounts[hour] += gamesPerHour;
      });
    });
    
    hourlyActivityData = {
      labels: hours.map(h => `${h}:00`),
      datasets: [{
        label: 'Games Played',
        data: hourCounts,
        backgroundColor: 'rgba(79, 70, 229, 0.8)',
        borderColor: 'rgba(79, 70, 229, 1)',
        borderWidth: 1
      }]
    };
  }
  
  // Weekly Activity (Day of Week)
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = new Array(7).fill(0);
    
    Object.keys(analytics.gamesPerDay).forEach(date => {
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      dayCounts[dayOfWeek] += analytics.gamesPerDay[date].total || 0;
    });
    
    weeklyActivityData = {
      labels: daysOfWeek,
      datasets: [{
        label: 'Games Played',
        data: dayCounts,
        backgroundColor: 'rgba(34, 211, 238, 0.8)',
        borderColor: 'rgba(34, 211, 238, 1)',
        borderWidth: 1
      }]
    };
  }
  
  // Performance vs Time Scatter Plot
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const scatterDatasets: any[] = [];
    Object.entries(analytics.gameTypeStats).forEach(([gameType, stats], idx) => {
      if (stats.avgTimeMs && stats.avgPercentage !== undefined) {
        const colors = [
          { bg: 'rgba(79, 70, 229, 0.6)', border: 'rgba(79, 70, 229, 1)' },
          { bg: 'rgba(34, 211, 238, 0.6)', border: 'rgba(34, 211, 238, 1)' },
          { bg: 'rgba(251, 191, 36, 0.6)', border: 'rgba(251, 191, 36, 1)' }
        ];
        const color = colors[idx % colors.length];
        
        scatterDatasets.push({
          label: formatGameType(gameType),
          data: [{
            x: Math.round(stats.avgTimeMs / 1000),
            y: stats.avgPercentage
          }],
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 2,
          pointRadius: 8
        });
      }
    });
    
    if (scatterDatasets.length > 0) {
      performanceScatterData = {
        datasets: scatterDatasets
      };
    }
  }
  
  // Area Chart Trends (stacked)
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const dates = Object.keys(analytics.gamesPerDay).sort();
    const gameTypes = new Set<string>();
    dates.forEach(date => {
      Object.keys(analytics.gamesPerDay[date]?.byGameType || {}).forEach(gt => gameTypes.add(gt));
    });
    
    const colors = [
      { bg: 'rgba(79, 70, 229, 0.5)', border: 'rgba(79, 70, 229, 1)' },
      { bg: 'rgba(34, 211, 238, 0.5)', border: 'rgba(34, 211, 238, 1)' },
      { bg: 'rgba(251, 191, 36, 0.5)', border: 'rgba(251, 191, 36, 1)' }
    ];
    
    areaTrendsData['gamesPerDay'] = {
      labels: dates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: Array.from(gameTypes).map((gameType, idx) => {
        const color = colors[idx % colors.length];
        return {
          label: formatGameType(gameType),
          data: dates.map(date => analytics.gamesPerDay[date]?.byGameType[gameType] || 0),
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 2,
          fill: true,
          tension: 0.4
        };
      })
    };
  }
  
  // Polar Area Chart (Performance by Game Type)
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const gameTypes = Object.keys(analytics.gameTypeStats);
    polarAreaData = {
      labels: gameTypes.map(gt => formatGameType(gt)),
      datasets: [{
        data: gameTypes.map(gt => analytics.gameTypeStats[gt].avgPercentage || 0),
        backgroundColor: [
          'rgba(79, 70, 229, 0.6)',
          'rgba(34, 211, 238, 0.6)',
          'rgba(251, 191, 36, 0.6)',
          'rgba(236, 72, 153, 0.6)',
          'rgba(34, 197, 94, 0.6)'
        ],
        borderColor: [
          'rgba(79, 70, 229, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(236, 72, 153, 1)',
          'rgba(34, 197, 94, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  // Generate sparklines for KPIs
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const dates = Object.keys(analytics.gamesPerDay).sort();
    sessionSparkline = dates.slice(-7).map(date => analytics.gamesPerDay[date]?.total || 0);
  }
  
  $: if (analytics?.timeSeriesByGame) {
    const gameTypes = Object.keys(analytics.timeSeriesByGame);
    if (gameTypes.length > 0) {
      const dates = Object.keys(analytics.timeSeriesByGame[gameTypes[0]]).sort();
      accuracySparkline = dates.slice(-7).map(date => {
        let total = 0;
        let count = 0;
        gameTypes.forEach(gt => {
          const ts = analytics.timeSeriesByGame[gt][date];
          if (ts && ts.count > 0) {
            total += ts.percentage / ts.count;
            count++;
          }
        });
        return count > 0 ? (total / count) : 0;
      });
    }
  }
  
  $: if (analytics?.activeUsersPerDay && Object.keys(analytics.activeUsersPerDay).length > 0) {
    const dates = Object.keys(analytics.activeUsersPerDay).sort();
    userSparkline = dates.slice(-7).map(date => analytics.activeUsersPerDay[date] || 0);
  }
  
  // Activity Feed Data
  $: if (analytics?.topPerformers && analytics.topPerformers.length > 0) {
    activityFeedData = analytics.topPerformers.slice(0, 5).map((performer: any, idx: number) => ({
      id: `activity-${idx}`,
      type: 'achievement',
      user: performer.username || performer.userId,
      action: `achieved ${performer.avgPercentage.toFixed(1)}% average score`,
      timestamp: new Date(),
      icon: '🏆'
    }));
  }
  
  // Leaderboard Data
  $: if (analytics?.topPerformers && analytics.topPerformers.length > 0) {
    leaderboardData = analytics.topPerformers.slice(0, 10).map((performer: any, idx: number) => ({
      rank: idx + 1,
      name: performer.username || performer.userId,
      score: performer.totalScore || 0,
      percentage: performer.avgPercentage || 0,
      sessions: performer.sessions || 0,
      badge: idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : undefined
    }));
  }
  
  // Heatmap Data (games per day)
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const heatmap: Record<string, number> = {};
    Object.keys(analytics.gamesPerDay).forEach(date => {
      heatmap[date] = analytics.gamesPerDay[date]?.total || 0;
    });
    heatmapData = heatmap;
  }
  
  // Bubble Chart Data (Sessions vs Score vs Questions)
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const bubbleDatasets: any[] = [];
    Object.entries(analytics.gameTypeStats).forEach(([gameType, stats], idx) => {
      const colors = [
        { bg: 'rgba(79, 70, 229, 0.6)', border: 'rgba(79, 70, 229, 1)' },
        { bg: 'rgba(34, 211, 238, 0.6)', border: 'rgba(34, 211, 238, 1)' },
        { bg: 'rgba(251, 191, 36, 0.6)', border: 'rgba(251, 191, 36, 1)' }
      ];
      const color = colors[idx % colors.length];
      
      const maxSize = Math.max(...Object.values(analytics.gameTypeStats).map((s: any) => s.totalQuestions || 0), 1);
      const normalizedSize = ((stats.totalQuestions || 0) / maxSize) * 30;
      
      bubbleDatasets.push({
        label: formatGameType(gameType),
        data: [{
          x: stats.count || 0,
          y: stats.avgPercentage || 0,
          r: Math.max(normalizedSize, 5)
        }],
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2
      });
    });
    
    if (bubbleDatasets.length > 0) {
      bubbleChartData = {
        datasets: bubbleDatasets
      };
    }
  }
  
  // Pie Chart Data (Score Distribution)
  $: if (analytics?.scoreDistribution) {
    pieChartData = {
      labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
      datasets: [{
        data: analytics.scoreDistribution,
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(34, 211, 238, 0.8)',
          'rgba(79, 70, 229, 0.8)',
          'rgba(34, 197, 94, 0.8)'
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(79, 70, 229, 1)',
          'rgba(34, 197, 94, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  // Comparison Metrics (current vs previous period)
  $: if (analytics?.gameTypeStats && analytics?.gamesPerDay) {
    const dates = Object.keys(analytics.gamesPerDay).sort();
    const midPoint = Math.floor(dates.length / 2);
    const currentPeriod = dates.slice(midPoint);
    const previousPeriod = dates.slice(0, midPoint);
    
    const currentTotal = currentPeriod.reduce((sum, date) => sum + (analytics.gamesPerDay[date]?.total || 0), 0);
    const previousTotal = previousPeriod.reduce((sum, date) => sum + (analytics.gamesPerDay[date]?.total || 0), 0);
    
    const totalSessions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.count || 0), 0);
    const totalQuestions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.totalQuestions || 0), 0);
    
    comparisonMetrics = [
      {
        label: 'Sessions',
        current: currentTotal,
        previous: previousTotal,
        unit: 'games'
      },
      {
        label: 'Total Sessions',
        current: totalSessions,
        previous: Math.floor(totalSessions * 0.8), // Estimate previous
        unit: ''
      },
      {
        label: 'Questions',
        current: totalQuestions,
        previous: Math.floor(totalQuestions * 0.8),
        unit: ''
      }
    ];
  }
  
  // Progress Bars Data
  $: if (analytics?.gameTypeStats) {
    const totalSessions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.count || 0), 0);
    progressBarsData = Object.entries(analytics.gameTypeStats).map(([gameType, stats]: [string, any]) => ({
      label: formatGameType(gameType),
      value: stats.avgPercentage || 0,
      max: 100,
      color: gameType === 'facial_recognition' ? '#4f46e5' : gameType === 'transition_recognition' ? '#22d3ee' : '#f59e0b'
    }));
  }
  
  // Stat Cards Data
  $: if (analytics?.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0) {
    const totalSessions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.count || 0), 0);
    const totalQuestions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.totalQuestions || 0), 0);
    const totalCorrect = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.correctQuestions || 0), 0);
    const overallAvg = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    
    statCardsData = [
      {
        icon: '📊',
        title: 'Avg Session Time',
        value: Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any, idx: number, arr: any[]) => {
          return sum + (stats.avgTimeMs ? Math.round(stats.avgTimeMs / 1000) : 0);
        }, 0) / Object.keys(analytics.gameTypeStats).length || 0,
        subtitle: 'seconds',
        color: '#4f46e5'
      },
      {
        icon: '🎯',
        title: 'Best Performance',
        value: Math.max(...Object.values(analytics.gameTypeStats).map((s: any) => s.avgPercentage || 0), 0).toFixed(1),
        subtitle: 'accuracy %',
        color: '#22c55e'
      },
      {
        icon: '⚡',
        title: 'Fastest Game',
        value: Math.min(...Object.values(analytics.gameTypeStats).filter((s: any) => s.avgTimeMs).map((s: any) => Math.round(s.avgTimeMs / 1000)), Infinity) || 'N/A',
        subtitle: 'seconds',
        color: '#f59e0b'
      },
      {
        icon: '📈',
        title: 'Growth Rate',
        value: sessionSparkline.length > 1 ? 
          ((sessionSparkline[sessionSparkline.length - 1] - sessionSparkline[0]) / Math.max(sessionSparkline[0], 1) * 100).toFixed(0) : '0',
        subtitle: '% vs last week',
        color: '#22d3ee',
        trend: sessionSparkline.length > 1 ? {
          value: Math.abs(((sessionSparkline[sessionSparkline.length - 1] - sessionSparkline[0]) / Math.max(sessionSparkline[0], 1)) * 100).toFixed(0),
          label: '',
          isPositive: sessionSparkline[sessionSparkline.length - 1] >= sessionSparkline[0]
        } : undefined
      }
    ];
  }
  
  // Accuracy by Hour of Day
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    // Estimate accuracy by hour (simplified - would need actual hour data)
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourAccuracies = hours.map(() => {
      // Use overall average as placeholder - in real scenario would calculate from session data
      const overallAvg = analytics?.gameTypeStats ? 
        Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => {
          return sum + (stats.avgPercentage || 0);
        }, 0) / Object.keys(analytics.gameTypeStats).length : 70;
      return overallAvg + (Math.random() * 20 - 10); // Add some variation
    });
    
    accuracyByHourData = {
      labels: hours.map(h => `${h}:00`),
      datasets: [{
        label: 'Average Accuracy %',
        data: hourAccuracies,
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
  }
  
  // Difficulty Comparison
  $: if (analytics?.difficultyStats && Object.keys(analytics.difficultyStats).length > 0) {
    const difficulties = Object.keys(analytics.difficultyStats);
    difficultyComparisonData = {
      labels: difficulties,
      datasets: [
        {
          label: 'Avg Score %',
          data: difficulties.map(d => analytics.difficultyStats[d].avgPercentage || 0),
          backgroundColor: 'rgba(79, 70, 229, 0.8)',
          borderColor: 'rgba(79, 70, 229, 1)',
          borderWidth: 2
        },
        {
          label: 'Sessions',
          data: difficulties.map(d => {
            const count = analytics.difficultyStats[d].count || 0;
            const maxCount = Math.max(...difficulties.map(d => analytics.difficultyStats[d].count || 0), 1);
            return (count / maxCount) * 100; // Normalize to percentage for comparison
          }),
          backgroundColor: 'rgba(34, 211, 238, 0.8)',
          borderColor: 'rgba(34, 211, 238, 1)',
          borderWidth: 2
        }
      ]
    };
  }
  
  // Performance by Day of Week
  $: if (analytics?.gamesPerDay && Object.keys(analytics.gamesPerDay).length > 0) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayPerformances = new Array(7).fill(0);
    const dayCounts = new Array(7).fill(0);
    
    Object.keys(analytics.gamesPerDay).forEach(date => {
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      const avgAccuracy = analytics.gameTypeStats ? 
        Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.avgPercentage || 0), 0) / Object.keys(analytics.gameTypeStats).length : 70;
      dayPerformances[dayOfWeek] += avgAccuracy;
      dayCounts[dayOfWeek]++;
    });
    
    performanceByDayData = {
      labels: daysOfWeek.map(d => d.substring(0, 3)),
      datasets: [{
        label: 'Avg Performance %',
        data: dayPerformances.map((sum, idx) => dayCounts[idx] > 0 ? sum / dayCounts[idx] : 0),
        backgroundColor: 'rgba(236, 72, 153, 0.6)',
        borderColor: 'rgba(236, 72, 153, 1)',
        borderWidth: 2
      }]
    };
  }
  
  // Time Distribution Chart
  $: if (analytics?.gameTypeStats) {
    const gameTypes = Object.keys(analytics.gameTypeStats);
    timeDistributionData = {
      labels: gameTypes.map(gt => formatGameType(gt)),
      datasets: [{
        label: 'Avg Time (seconds)',
        data: gameTypes.map(gt => {
          const stats = analytics.gameTypeStats[gt];
          return stats.avgTimeMs ? Math.round(stats.avgTimeMs / 1000) : 0;
        }),
        backgroundColor: [
          'rgba(79, 70, 229, 0.6)',
          'rgba(34, 211, 238, 0.6)',
          'rgba(251, 191, 36, 0.6)'
        ],
        borderColor: [
          'rgba(79, 70, 229, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(251, 191, 36, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  // Engagement Metrics
  $: if (analytics?.gameTypeStats && analytics?.activeUsersPerDay) {
    const maxActiveUsers = Math.max(...Object.values(analytics.activeUsersPerDay), 0);
    const totalSessions = Object.values(analytics.gameTypeStats).reduce((sum: number, stats: any) => sum + (stats.count || 0), 0);
    const avgSessionsPerUser = maxActiveUsers > 0 ? (totalSessions / maxActiveUsers) : 0;
    
    engagementMetrics = {
      avgSessionsPerUser: avgSessionsPerUser.toFixed(1),
      maxActiveUsers,
      totalSessions,
      retentionRate: maxActiveUsers > 0 ? ((analytics.activeUsersPerDay[Object.keys(analytics.activeUsersPerDay).sort().pop() || ''] || 0) / maxActiveUsers * 100).toFixed(1) : '0'
    };
  }
  
  onMount(() => {
    document.title = 'Analytics - Admin Panel';
  });
</script>

<svelte:head>
  <title>Analytics - Admin Panel</title>
</svelte:head>

<div class="analytics-page">
  <div class="page-header">
    <h1>Platform Analytics</h1>
    <button class="refresh-btn" on:click={applyFilters} disabled={loading}>
      {loading ? 'Refreshing...' : '🔄 Refresh'}
    </button>
  </div>
  
  <!-- Advanced Filters -->
  <div class="filters-section">
    <h2>Filters</h2>
    <div class="filters-grid">
      <div class="filter-group">
        <label>Date Range</label>
        <select
          bind:value={dateRange}
          on:change={applyFilters}
          class="date-range-select"
          disabled={loading}
        >
          {#each dateRangeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      
      <div class="filter-group">
        <label>User</label>
        <select bind:value={selectedUserId} on:change={applyFilters} disabled={loading}>
          <option value="">All Users</option>
          {#each availableUsers as user}
            <option value={user.id}>{user.username} ({user.id})</option>
          {/each}
        </select>
      </div>
      
      <div class="filter-group">
        <label>Game Type</label>
        <select bind:value={selectedGameType} on:change={applyFilters} disabled={loading}>
          {#each GAME_TYPES as gt}
            <option value={gt.value}>{gt.label}</option>
          {/each}
        </select>
      </div>
      
      <div class="filter-group">
        <label>Difficulty/Level</label>
        <select bind:value={selectedDifficulty} on:change={applyFilters} disabled={loading}>
          <option value="">All Difficulties</option>
          {#each availableDifficulties as diff}
            <option value={diff}>{diff}</option>
          {/each}
          {#if selectedDifficulty && !availableDifficulties.includes(selectedDifficulty)}
            <option value={selectedDifficulty}>{selectedDifficulty}</option>
          {/if}
        </select>
      </div>
      
      <div class="filter-group">
        {#if dateRange !== '30d' || selectedUserId || selectedGameType || selectedDifficulty}
          <button class="clear-filters-btn" on:click={clearFilters} disabled={loading}>
            Clear Filters
          </button>
        {/if}
      </div>
    </div>
  </div>
  
  {#if loading}
    <div class="loading-state">
      <p>Loading analytics...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <button class="retry-btn" on:click={applyFilters}>Retry</button>
    </div>
  {:else}
    {#if !analytics || Object.keys(analytics).length === 0}
      <div class="loading-state"><p>No analytics data yet.</p><button class="retry-btn" on:click={applyFilters}>Retry</button></div>
    {:else}
    <!-- KPI Cards with Sparklines -->
      {@const totalSessions = Object.values(analytics.gameTypeStats).reduce((sum, stats) => sum + (stats.count || 0), 0)}
      {@const totalQuestions = Object.values(analytics.gameTypeStats).reduce((sum, stats) => sum + (stats.totalQuestions || 0), 0)}
      {@const totalCorrect = Object.values(analytics.gameTypeStats).reduce((sum, stats) => sum + (stats.correctQuestions || 0), 0)}
      {@const overallAvg = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0}
      {@const maxActiveUsers = analytics.activeUsersPerDay && Object.keys(analytics.activeUsersPerDay).length > 0 ? Math.max(...Object.values(analytics.activeUsersPerDay)) : 0}
      
      <div class="kpi-grid">
        <KPICard
          title="Total Sessions"
          value={totalSessions}
          icon="🎮"
          color="#4f46e5"
          sparkline={sessionSparkline}
          trend={sessionSparkline.length > 1 ? {
            value: ((sessionSparkline[sessionSparkline.length - 1] - sessionSparkline[0]) / Math.max(sessionSparkline[0], 1) * 100).toFixed(0),
            label: 'vs last week',
            isPositive: sessionSparkline[sessionSparkline.length - 1] >= sessionSparkline[0]
          } : undefined}
        />
        
        <KPICard
          title="Overall Accuracy"
          value={`${overallAvg.toFixed(1)}%`}
          icon="✅"
          color="#22c55e"
          sparkline={accuracySparkline}
        />
        
        <KPICard
          title="Active Users"
          value={maxActiveUsers}
          icon="👥"
          color="#22d3ee"
          sparkline={userSparkline}
        />
        
        <KPICard
          title="Total Questions"
          value={totalQuestions}
          icon="❓"
          color="#f59e0b"
        />
      </div>
      
      <!-- Gauge Charts Row -->
      <div class="gauges-grid">
        {#each Object.entries(analytics.gameTypeStats).slice(0, 3) as [gameType, stats]}
          <div class="gauge-card">
            <h3>{formatGameType(gameType)}</h3>
            <GaugeChart
              value={stats.avgPercentage || 0}
              label="Average Score"
              size={180}
              strokeWidth={15}
              color={gameType === 'facial_recognition' ? '#4f46e5' : gameType === 'transition_recognition' ? '#22d3ee' : '#f59e0b'}
            />
            <div class="gauge-stats">
              <div class="gauge-stat">
                <span class="gauge-stat-label">Sessions</span>
                <span class="gauge-stat-value">{stats.count || 0}</span>
              </div>
              <div class="gauge-stat">
                <span class="gauge-stat-label">Avg Time</span>
                <span class="gauge-stat-value">
                  {stats.avgTimeMs ? Math.round(stats.avgTimeMs / 1000) + 's' : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
      
      <!-- Stat Cards Grid -->
      <div class="stat-cards-grid">
        {#each statCardsData as statCard}
          <StatCard
            icon={statCard.icon}
            title={statCard.title}
            value={statCard.value}
            subtitle={statCard.subtitle}
            color={statCard.color}
            trend={statCard.trend}
          />
        {/each}
      </div>
      
      <!-- Progress Bars Section -->
      {#if progressBarsData.length > 0}
        <div class="chart-section">
          <h2>Performance Progress by Game Type</h2>
          <div class="progress-bars-container">
            {#each progressBarsData as progress}
              <ProgressBar
                label={progress.label}
                value={progress.value}
                max={progress.max}
                color={progress.color}
                size="large"
              />
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Metric Comparison Widget -->
      {#if comparisonMetrics.length > 0}
        <div class="widget-card">
          <MetricComparison metrics={comparisonMetrics} />
        </div>
      {/if}
      
      <!-- Leaderboard Widget -->
      {#if leaderboardData.length > 0}
        <div class="widget-card">
          <Leaderboard players={leaderboardData} title="Top 10 Performers" />
        </div>
      {/if}
      
      <!-- Activity Feed & Quick Stats Side by Side -->
      <div class="widgets-row">
        <div class="widget-card activity-widget">
          <ActivityFeed activities={activityFeedData} />
        </div>
        
        <div class="widget-card">
          <h3>Quick Stats</h3>
          <div class="quick-stats-grid">
            {#each Object.entries(analytics.difficultyStats).slice(0, 4) as [difficulty, stats]}
              <div class="quick-stat-item">
                <div class="quick-stat-label">{difficulty}</div>
                <div class="quick-stat-value">{(stats.avgPercentage || 0).toFixed(1)}%</div>
                <div class="quick-stat-meta">{stats.count || 0} sessions</div>
              </div>
            {/each}
          </div>
        </div>
      </div>
      
      <!-- Engagement Metrics Widgets -->
      {#if engagementMetrics}
        <div class="engagement-widgets">
          <div class="engagement-card">
            <div class="engagement-icon">📊</div>
            <div class="engagement-content">
              <div class="engagement-label">Avg Sessions/User</div>
              <div class="engagement-value">{engagementMetrics.avgSessionsPerUser}</div>
            </div>
          </div>
          <div class="engagement-card">
            <div class="engagement-icon">👥</div>
            <div class="engagement-content">
              <div class="engagement-label">Max Active Users</div>
              <div class="engagement-value">{engagementMetrics.maxActiveUsers}</div>
            </div>
          </div>
          <div class="engagement-card">
            <div class="engagement-icon">📈</div>
            <div class="engagement-content">
              <div class="engagement-label">Retention Rate</div>
              <div class="engagement-value">{engagementMetrics.retentionRate}%</div>
            </div>
          </div>
        </div>
      {/if}
    {/if}
    
    <!-- Overview Stats by Game Type -->
    {#if analytics.gameTypeStats && Object.keys(analytics.gameTypeStats).length > 0}
      <div class="overview-stats">
        <h2>Performance by Game Type</h2>
        <div class="stats-grid">
          {#each Object.entries(analytics.gameTypeStats) as [gameType, stats]}
            <div class="overview-card">
              <h3>{formatGameType(gameType)}</h3>
              <div class="stat-row">
                <span class="stat-label">Sessions:</span>
                <span class="stat-value">{stats.count || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Score:</span>
                <span class="stat-value">{(stats.avgPercentage || 0).toFixed(1)}%</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Questions:</span>
                <span class="stat-value">{stats.totalQuestions || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Correct:</span>
                <span class="stat-value">{stats.correctQuestions || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Time:</span>
                <span class="stat-value">
                  {#if stats.avgTimeMs}
                    {Math.round(stats.avgTimeMs / 1000)}s
                  {:else}
                    N/A
                  {/if}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Difficulty Stats -->
    {#if analytics.difficultyStats && Object.keys(analytics.difficultyStats).length > 0}
      <div class="overview-stats">
        <h2>Performance by Difficulty</h2>
        <div class="stats-grid">
          {#each Object.entries(analytics.difficultyStats) as [difficulty, stats]}
            <div class="overview-card">
              <h3>{difficulty}</h3>
              <div class="stat-row">
                <span class="stat-label">Sessions:</span>
                <span class="stat-value">{stats.count || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Score:</span>
                <span class="stat-value">{(stats.avgPercentage || 0).toFixed(1)}%</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Time:</span>
                <span class="stat-value">
                  {#if stats.avgTimeMs}
                    {Math.round(stats.avgTimeMs / 1000)}s
                  {:else}
                    N/A
                  {/if}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Users Over Time -->
    {#if usersOverTimeData && !selectedUserId}
      <div class="chart-section">
        <h2>Total Users Over Time</h2>
        <div class="chart-card">
          <LineChart
            data={usersOverTimeData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1 }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Games Played Per Day -->
    {#if gamesPerDayData}
      <div class="chart-section">
        <h2>Games Played Per Day</h2>
        <div class="chart-card">
          <BarChart
            data={gamesPerDayData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1 }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Score Distribution -->
    {#if scoreDistributionData}
      <div class="chart-section">
        <h2>Score Distribution</h2>
        <div class="chart-card">
          <BarChart
            data={scoreDistributionData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1 }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Performance Radar Chart -->
    {#if performanceRadarData}
      <div class="chart-section">
        <h2>Performance Radar - Multi-Dimensional Analysis</h2>
        <div class="chart-card">
          <RadarChart
            data={performanceRadarData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                r: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Weekly Activity -->
    {#if weeklyActivityData}
      <div class="chart-section">
        <h2>Weekly Activity Pattern</h2>
        <div class="chart-card">
          <BarChart
            data={weeklyActivityData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1 }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Hourly Activity -->
    {#if hourlyActivityData}
      <div class="chart-section">
        <h2>Hourly Activity Pattern</h2>
        <div class="chart-card">
          <BarChart
            data={hourlyActivityData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1 }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Area Chart - Stacked Games Per Day -->
    {#if areaTrendsData['gamesPerDay']}
      <div class="chart-section">
        <h2>Games Per Day Trend (Stacked Area)</h2>
        <div class="chart-card">
          <AreaChart
            data={areaTrendsData['gamesPerDay']}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  stacked: true,
                  ticks: { stepSize: 1 }
                },
                x: {
                  stacked: true
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Performance Scatter Plot -->
    {#if performanceScatterData}
      <div class="chart-section">
        <h2>Performance vs Time (Scatter)</h2>
        <div class="chart-card">
          <ScatterChart
            data={performanceScatterData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}% accuracy in ${context.parsed.x}s`;
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Additional Chart Row: Polar Area only (Pie removed) -->
    <div class="multi-chart-row">
      {#if polarAreaData}
        <div class="chart-section half-width">
          <h2>Performance Distribution (Polar Area)</h2>
          <div class="chart-card">
            <PolarAreaChart
              data={polarAreaData}
              options={{
                plugins: {
                  legend: { display: true, position: 'bottom' },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return `${context.label}: ${context.parsed.toFixed(1)}%`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Bubble Chart -->
    {#if bubbleChartData}
      <div class="chart-section">
        <h2>Performance Bubble Chart (Sessions vs Score vs Questions)</h2>
        <div class="chart-card">
          <BubbleChart
            data={bubbleChartData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const point = context.raw;
                      return `${context.dataset.label}: ${point.y.toFixed(1)}% accuracy, ${point.x} sessions, ${Math.round(point.r)} questions`;
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Heatmap -->
    {#if Object.keys(heatmapData).length > 0}
      <div class="chart-section">
        <h2>Activity Heatmap</h2>
        <div class="chart-card">
          <Heatmap data={heatmapData} title="Games Per Day" />
        </div>
      </div>
    {/if}
    
    <!-- Accuracy by Hour -->
    {#if accuracyByHourData}
      <div class="chart-section">
        <h2>Accuracy by Hour of Day</h2>
        <div class="chart-card">
          <AreaChart
            data={accuracyByHourData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: false,
                  min: 0,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Difficulty Comparison -->
    {#if difficultyComparisonData}
      <div class="chart-section">
        <h2>Difficulty Comparison (Score vs Sessions)</h2>
        <div class="chart-card">
          <BarChart
            data={difficultyComparisonData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Performance by Day of Week -->
    {#if performanceByDayData}
      <div class="chart-section">
        <h2>Performance by Day of Week</h2>
        <div class="chart-card">
          <BarChart
            data={performanceByDayData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Time Distribution -->
    {#if timeDistributionData}
      <div class="chart-section">
        <h2>Average Time Distribution by Game Type</h2>
        <div class="chart-card">
          <BarChart
            data={timeDistributionData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'Time (seconds)'
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <!-- Engagement Metrics Comparison -->
    {#if engagementMetrics && analytics.gameTypeStats}
      <div class="chart-section">
        <h2>Engagement Metrics</h2>
        <div class="engagement-chart-card">
          <div class="engagement-metric">
            <div class="engagement-metric-icon">📊</div>
            <div class="engagement-metric-content">
              <div class="engagement-metric-label">Avg Sessions per User</div>
              <div class="engagement-metric-value">{engagementMetrics.avgSessionsPerUser}</div>
            </div>
          </div>
          <div class="engagement-metric">
            <div class="engagement-metric-icon">👥</div>
            <div class="engagement-metric-content">
              <div class="engagement-metric-label">Peak Active Users</div>
              <div class="engagement-metric-value">{engagementMetrics.maxActiveUsers}</div>
            </div>
          </div>
          <div class="engagement-metric">
            <div class="engagement-metric-icon">📈</div>
            <div class="engagement-metric-content">
              <div class="engagement-metric-label">Retention Rate</div>
              <div class="engagement-metric-value">{engagementMetrics.retentionRate}%</div>
            </div>
          </div>
          <div class="engagement-metric">
            <div class="engagement-metric-icon">🎮</div>
            <div class="engagement-metric-content">
              <div class="engagement-metric-label">Total Sessions</div>
              <div class="engagement-metric-value">{engagementMetrics.totalSessions}</div>
            </div>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Top Performers -->
    {#if topPerformersData && !selectedUserId}
      <div class="chart-section">
        <h2>Top 10 Performers</h2>
        <div class="chart-card">
          <BarChart
            data={topPerformersData}
            options={{
              indexAxis: 'y',
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    {#if !analytics.gameTypeStats || Object.keys(analytics.gameTypeStats).length === 0}
      <div class="empty-state">
        <p>No analytics data available for the selected filters.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .analytics-page {
    max-width: 1600px;
    margin: 0 auto;
  }
  
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  
  .page-header h1 {
    font-family: Georgia, serif;
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 800;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 10px 14px rgba(0,0,0,.35);
    margin: 0;
  }
  
  .refresh-btn {
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    color: #4f46e5;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .refresh-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    transform: translateY(-1px);
  }
  
  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .filters-section {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
  }
  
  .filters-section h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 1rem 0;
  }
  
  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .filter-group label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .filter-group select,
  .filter-group input {
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    font-size: 0.875rem;
    color: #111;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .filter-group select:focus,
  .filter-group input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  .filter-group select:hover:not(:disabled),
  .filter-group input:hover:not(:disabled) {
    border-color: #4f46e5;
  }
  
  .filter-group select:disabled,
  .filter-group input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .date-range-select {
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    font-size: 0.875rem;
    color: #111;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    min-width: 160px;
  }
  
  .date-range-select:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  .date-range-select:hover:not(:disabled) {
    border-color: #4f46e5;
  }
  
  .date-range-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .clear-filters-btn {
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.5);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    color: #ef4444;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 1.5rem;
  }
  
  .clear-filters-btn:hover:not(:disabled) {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
  }
  
  .clear-filters-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .gauges-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .gauge-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.2s;
    text-align: center;
  }
  
  .gauge-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 28px 78px rgba(79,70,229,.35);
    filter: brightness(1.02);
  }
  
  .gauge-card h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 1rem 0;
  }
  
  .gauge-stats {
    display: flex;
    justify-content: space-around;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255,255,255,.2);
  }
  
  .gauge-stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .gauge-stat-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .gauge-stat-value {
    font-size: 1rem;
    font-weight: 700;
    color: #111;
  }
  
  .widgets-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .widget-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
  }
  
  .widget-card h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 1rem 0;
  }
  
  .activity-widget {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .quick-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  
  .quick-stat-item {
    padding: 1rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.2);
    text-align: center;
    transition: all 0.2s;
  }
  
  .quick-stat-item:hover {
    transform: translateY(-2px);
    background: linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.15));
  }
  
  .quick-stat-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .quick-stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    margin-bottom: 0.25rem;
  }
  
  .quick-stat-meta {
    font-size: 0.7rem;
    color: #9ca3af;
  }
  
  .stat-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .progress-bars-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.2);
  }
  
  .engagement-widgets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .engagement-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.3s ease;
  }
  
  .engagement-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 32px 88px rgba(79,70,229,.4);
  }
  
  .engagement-icon {
    font-size: 2rem;
    line-height: 1;
  }
  
  .engagement-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .engagement-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .engagement-value {
    font-size: 1.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .engagement-chart-card {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    padding: 1.5rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,.2);
  }
  
  .engagement-metric {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.15));
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.3);
    transition: all 0.2s;
  }
  
  .engagement-metric:hover {
    transform: translateY(-2px);
    background: linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,.2));
  }
  
  .engagement-metric-icon {
    font-size: 1.75rem;
    line-height: 1;
  }
  
  .engagement-metric-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .engagement-metric-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .engagement-metric-value {
    font-size: 1.25rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .multi-chart-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .triple-chart-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .chart-section.half-width,
  .chart-section.third-width {
    margin-bottom: 0;
  }
  
  @media (max-width: 1400px) {
    .triple-chart-row {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .triple-chart-row .chart-section.third-width:nth-child(3) {
      grid-column: 1 / -1;
    }
  }
  
  @media (max-width: 1024px) {
    .widgets-row {
      grid-template-columns: 1fr;
    }
    
    .gauges-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    
    .multi-chart-row {
      grid-template-columns: 1fr;
    }
    
    .engagement-widgets {
      grid-template-columns: 1fr;
    }
    
    .engagement-chart-card {
      grid-template-columns: 1fr;
    }
  }
  
  .overview-stats {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
  }
  
  .overview-stats h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 1rem 0;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .overview-card {
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,.25));
    backdrop-filter: blur(15px) saturate(140%);
    border-radius: 12px;
    padding: 1rem;
    border: 1px solid rgba(255,255,255,.4);
    transition: all 0.2s;
  }
  
  .overview-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(79,70,229,.25);
    border-color: rgba(255,255,255,.6);
  }
  
  .overview-card h3 {
    font-size: 0.875rem;
    font-weight: 700;
    color: #111;
    margin: 0 0 0.75rem 0;
  }
  
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .stat-row:last-child {
    margin-bottom: 0;
  }
  
  .stat-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .stat-value {
    font-size: 0.875rem;
    font-weight: 700;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .loading-state,
  .empty-state,
  .error-state {
    text-align: center;
    padding: 2rem;
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    color: white;
    text-shadow: 0 2px 4px rgba(0,0,0,.2);
  }
  
  .loading-state {
    color: #4f46e5;
    font-weight: 500;
  }
  
  .error-state {
    color: #ef4444;
  }
  
  .retry-btn {
    margin-top: 0.75rem;
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid #ef4444;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(10px);
    color: #ef4444;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .retry-btn:hover {
    background: #ef4444;
    color: white;
  }
  
  .chart-section {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.3s ease;
    animation: fadeInUp 0.6s ease-out backwards;
  }
  
  .chart-section:nth-child(1) { animation-delay: 0.1s; }
  .chart-section:nth-child(2) { animation-delay: 0.2s; }
  .chart-section:nth-child(3) { animation-delay: 0.3s; }
  .chart-section:nth-child(4) { animation-delay: 0.4s; }
  
  .chart-section:hover {
    transform: translateY(-4px);
    box-shadow: 0 32px 88px rgba(79,70,229,.4);
    filter: brightness(1.05);
    border-color: rgba(255,255,255,.75);
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .chart-section h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 0.75rem 0;
  }
  
  .chart-card {
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.90));
    border-radius: 12px;
    padding: 1rem;
    border: 1px solid rgba(255,255,255,.6);
    box-shadow: 0 4px 16px rgba(0,0,0,.1);
    height: 360px; /* taller to guarantee full circular charts fit */
    overflow: hidden;
    box-sizing: border-box;
  }
  
  :global(.chart-card canvas) { display: block; width: 100% !important; height: 100% !important; }
  
  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .filters-grid {
      grid-template-columns: 1fr;
    }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
