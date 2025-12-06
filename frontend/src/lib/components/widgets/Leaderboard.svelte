<script lang="ts">
  export let players: Array<{
    rank: number;
    name: string;
    score: number;
    percentage: number;
    sessions: number;
    badge?: string;
  }> = [];
  export let title: string = 'Top Performers';
  
  function getRankEmoji(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }
</script>

<div class="leaderboard">
  <h3>{title}</h3>
  <div class="leaderboard-list">
    {#each players as player (player.rank)}
      <div class="leaderboard-item" class:top-three={player.rank <= 3}>
        <div class="rank-badge">
          {getRankEmoji(player.rank)}
        </div>
        <div class="player-info">
          <div class="player-name">
            {#if player.badge}
              <span class="player-badge">{player.badge}</span>
            {/if}
            {player.name}
          </div>
          <div class="player-stats">
            <span class="stat">{player.percentage.toFixed(1)}%</span>
            <span class="stat-divider">•</span>
            <span class="stat">{player.sessions} sessions</span>
          </div>
        </div>
        <div class="player-score">
          {player.score}
        </div>
      </div>
    {/each}
    {#if players.length === 0}
      <div class="empty-leaderboard">
        No players yet
      </div>
    {/if}
  </div>
</div>

<style>
  .leaderboard {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .leaderboard h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  
  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .leaderboard-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.2);
    transition: all 0.2s;
  }
  
  .leaderboard-item:hover {
    background: linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.15));
    transform: translateX(4px);
  }
  
  .leaderboard-item.top-three {
    background: linear-gradient(135deg, rgba(79,70,229,.15), rgba(34,211,238,.15));
    border-color: rgba(79,70,229,.3);
  }
  
  .rank-badge {
    font-size: 1.25rem;
    font-weight: 700;
    min-width: 40px;
    text-align: center;
  }
  
  .player-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .player-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .player-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #92400e;
    font-weight: 700;
  }
  
  .player-stats {
    font-size: 0.75rem;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  
  .stat {
    font-weight: 500;
  }
  
  .stat-divider {
    opacity: 0.5;
  }
  
  .player-score {
    font-size: 1.125rem;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .empty-leaderboard {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
    font-size: 0.875rem;
  }
</style>

