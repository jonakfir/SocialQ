<script lang="ts">
  export let activities: Array<{
    id: string;
    type: string;
    user: string;
    action: string;
    timestamp: Date | string;
    icon?: string;
  }> = [];
  
  function formatTime(timestamp: Date | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
  
  function getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      'game': '🎮',
      'user': '👤',
      'session': '📊',
      'achievement': '🏆',
      'login': '🔐'
    };
    return icons[type] || '📌';
  }
</script>

<div class="activity-feed">
  <h3>Recent Activity</h3>
  <div class="activity-list">
    {#each activities.slice(0, 10) as activity (activity.id)}
      <div class="activity-item">
        <div class="activity-icon">
          {activity.icon || getActivityIcon(activity.type)}
        </div>
        <div class="activity-content">
          <div class="activity-text">
            <strong>{activity.user}</strong> {activity.action}
          </div>
          <div class="activity-time">
            {formatTime(activity.timestamp)}
          </div>
        </div>
      </div>
    {/each}
    {#if activities.length === 0}
      <div class="activity-empty">
        No recent activity
      </div>
    {/if}
  </div>
</div>

<style>
  .activity-feed {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .activity-feed h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .activity-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.1));
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.2);
    transition: all 0.2s;
  }
  
  .activity-item:hover {
    background: linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.15));
    transform: translateX(4px);
  }
  
  .activity-icon {
    font-size: 1.25rem;
    line-height: 1;
    flex-shrink: 0;
  }
  
  .activity-content {
    flex: 1;
    min-width: 0;
  }
  
  .activity-text {
    font-size: 0.875rem;
    color: #111;
    font-weight: 500;
    margin-bottom: 0.25rem;
  }
  
  .activity-text strong {
    color: #4f46e5;
    font-weight: 600;
  }
  
  .activity-time {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .activity-empty {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
    font-size: 0.875rem;
  }
</style>

