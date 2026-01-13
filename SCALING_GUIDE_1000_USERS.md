# Scaling Guide: Preparing for 1000 Users on Railway

## Current Setup
- **Backend**: Express.js on Railway ($5/month Hobby plan)
- **Frontend**: SvelteKit on Vercel
- **Database**: PostgreSQL (via Railway DATABASE_URL)
- **Connection Pool**: Max 20 connections

---

## 1. Railway Plan Upgrade

### Current Plan ($5/month Hobby)
- $5 usage credits included
- Up to 8 GB RAM, 8 vCPU per service
- 5 GB storage
- Pay-as-you-go after credits

### Recommended: Pro Plan ($20/month)
- **Why**: Better resource allocation and more predictable costs
- **Includes**: $20 usage credits
- **Resources**: Up to 32 GB RAM, 32 vCPU per service
- **Storage**: 250 GB volume storage
- **Estimated Monthly Cost**: $50-100 (depending on actual usage)

### Alternative: Stay on Hobby + Monitor
- You can stay on Hobby plan but will pay per usage
- Monitor your usage in Railway dashboard
- Upgrade if you consistently exceed $20/month

---

## 2. Database Connection Pool Optimization

### Current Settings (in `backend/db/db.js`)
```javascript
max: 20,  // Maximum connections
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 5000,
```

### Recommended Changes for 1000 Users

**For 1000 concurrent users, you'll need:**
- **Connection Pool Size**: Increase to 50-100 connections
- **Formula**: `(expected_concurrent_users / 10) + 10`
- For 1000 users with ~10% concurrent: ~20-30 concurrent = pool of 30-40
- For safety margin: Use 50-75 connections

**Update `backend/db/db.js`:**

```javascript
pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '50', 10), // Increased from 20
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  // Add these for better connection management
  min: 5, // Minimum connections to keep alive
  statement_timeout: 30000, // 30 second query timeout
});
```

**Add to Railway Environment Variables:**
- `DB_POOL_MAX=50` (or higher if needed)

---

## 3. Database Scaling Considerations

### Current Database Limits
Railway PostgreSQL databases have limits based on plan:
- **Hobby**: Shared resources, limited connections
- **Pro**: Better performance, more connections

### Recommendations
1. **Monitor Database Performance**
   - Check Railway dashboard for database CPU/RAM usage
   - Watch for connection pool exhaustion errors
   - Monitor query performance

2. **Database Query Optimization**
   - Ensure all frequently-used queries have indexes (you already have good indexes)
   - Consider adding query result caching for read-heavy endpoints
   - Use connection pooling effectively (already implemented)

3. **Consider Database Upgrade**
   - If you see database bottlenecks, Railway offers database scaling options
   - You can upgrade database resources separately from compute

---

## 4. Application Code Changes

### A. Add Rate Limiting

Create `backend/middleware/rateLimiter.js`:

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
});

module.exports = { apiLimiter, authLimiter };
```

**Install dependency:**
```bash
cd backend && npm install express-rate-limit
```

**Add to `backend/server.js`:**
```javascript
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

// Apply rate limiting after CORS
app.use('/api', apiLimiter);
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
```

### B. Add Response Caching for Read-Heavy Endpoints

Consider adding caching for:
- User profile data
- Organization lists
- Dashboard analytics

Use Redis or in-memory caching (for single instance).

### C. Optimize File Uploads

If you handle file uploads (images, videos):
- Resize images on upload
- Use CDN for static assets (Vercel handles this for frontend)
- Consider direct S3/R2 uploads for large files

---

## 5. Horizontal Scaling (Multiple Instances)

### When to Scale Horizontally
- If single instance can't handle load
- For high availability
- For geographic distribution

### How to Scale on Railway
1. **Railway Dashboard** → Your Service → Settings
2. **Scaling** → Increase replicas
3. **Note**: Each replica uses full allocated resources
4. **Cost**: 2 replicas = 2x compute costs

### Considerations
- **Session Management**: If using sessions, use Redis or database-backed sessions
- **Webhooks**: WhatsApp webhooks should work with any instance (stateless)
- **Database**: Shared database works fine with multiple instances
- **Load Balancing**: Railway handles this automatically

### Recommended Setup for 1000 Users
- **Start**: 1 instance with Pro plan
- **Scale to 2 instances** if you see:
  - High CPU usage (>70% sustained)
  - Memory pressure
  - Request queueing/delays

---

## 6. Monitoring & Observability

### Railway Built-in Monitoring
- **Usage Dashboard**: Track CPU, RAM, network usage
- **Logs**: Real-time application logs
- **Metrics**: Basic performance metrics

### Recommended Additions
1. **Application Performance Monitoring (APM)**
   - Consider adding Sentry, Datadog, or New Relic
   - Monitor response times, error rates, database query performance

2. **Custom Metrics**
   - Track active users
   - Monitor database connection pool usage
   - Track API endpoint response times

3. **Alerts**
   - Set up alerts for:
     - High error rates (>5%)
     - Slow response times (>2s p95)
     - Database connection pool exhaustion
     - High memory usage (>80%)

---

## 7. Cost Estimation

### Scenario 1: Pro Plan, Single Instance
- **Base Plan**: $20/month
- **Compute Usage**: ~$30-50/month (assuming moderate traffic)
- **Database**: Included or ~$10-20/month
- **Total**: ~$60-90/month

### Scenario 2: Pro Plan, 2 Instances (High Availability)
- **Base Plan**: $20/month
- **Compute**: $60-100/month (2x instances)
- **Database**: ~$10-20/month
- **Total**: ~$90-140/month

### Scenario 3: Hobby Plan, Pay-as-You-Go
- **Base Plan**: $5/month
- **Usage**: Could be $30-80/month depending on traffic
- **Total**: ~$35-85/month (less predictable)

**Recommendation**: Start with Pro Plan ($20/month) for predictability and better resources.

---

## 8. Implementation Checklist

### Immediate Changes (Before 1000 Users)
- [ ] Upgrade Railway plan to Pro ($20/month)
- [ ] Increase database connection pool to 50
- [ ] Add rate limiting middleware
- [ ] Set up monitoring/alerts
- [ ] Test with load testing tool (e.g., k6, Artillery)

### Before Launch
- [ ] Load test with 100-200 concurrent users
- [ ] Monitor database performance
- [ ] Optimize slow queries
- [ ] Set up error tracking (Sentry)
- [ ] Document runbooks for common issues

### As You Scale
- [ ] Monitor usage metrics weekly
- [ ] Adjust connection pool size based on actual usage
- [ ] Consider horizontal scaling if needed
- [ ] Optimize based on real-world usage patterns

---

## 9. Load Testing

### Recommended Load Test
Test your application with:
- **100 concurrent users**: Baseline
- **500 concurrent users**: Target load
- **1000 concurrent users**: Peak load

### Tools
- **k6**: `k6 run load-test.js`
- **Artillery**: `artillery quick --count 100 --num 10 https://your-api.com`
- **Apache Bench**: `ab -n 10000 -c 100 https://your-api.com`

### What to Monitor During Load Test
- Response times (p50, p95, p99)
- Error rates
- Database connection pool usage
- Memory/CPU usage
- Database query performance

---

## 10. Database-Specific Recommendations

### Connection Pool Monitoring
Add logging to track pool usage:

```javascript
// In backend/db/db.js, after pool creation
setInterval(() => {
  if (pool) {
    console.log('[DB Pool]', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    });
  }
}, 30000); // Log every 30 seconds
```

### Query Optimization
- All your tables already have good indexes
- Monitor slow queries in production
- Consider adding query result caching for frequently accessed data

### Database Backup
- Railway provides automatic backups on Pro plan
- Verify backup frequency and retention policy
- Test restore procedures

---

## 11. WhatsApp Webhook Considerations

Your WhatsApp webhook setup should handle 1000 users fine because:
- Webhooks are event-driven (not user-initiated)
- Each webhook is processed independently
- No state is maintained between webhooks

**No changes needed** for webhook handling at 1000 users.

---

## 12. Frontend Considerations (Vercel)

Vercel should handle 1000 users easily:
- **Free Tier**: 100 GB bandwidth/month
- **Pro Tier**: $20/month for unlimited bandwidth
- **Edge Network**: Global CDN, fast response times

**Recommendation**: Monitor Vercel usage, upgrade to Pro if needed.

---

## Summary

### Minimum Changes Required
1. ✅ Upgrade to Railway Pro plan ($20/month)
2. ✅ Increase DB connection pool to 50
3. ✅ Add rate limiting
4. ✅ Set up monitoring

### Estimated Monthly Cost
- **Railway Pro**: $20 base + $30-50 usage = **$50-70/month**
- **Vercel**: Free or Pro ($20/month) = **$0-20/month**
- **Total**: **$50-90/month**

### Expected Performance
- **Concurrent Users**: 50-100 without issues
- **Peak Load**: 200-300 concurrent users
- **Response Time**: <500ms for most endpoints
- **Uptime**: 99.9%+ with proper monitoring

---

## Questions to Answer Before Scaling

1. **What's your expected concurrent user rate?**
   - 10% of 1000 = 100 concurrent users
   - Plan for 2-3x peak (200-300 concurrent)

2. **What are your peak usage times?**
   - Plan resources for peak times
   - Consider auto-scaling if traffic is variable

3. **What's your budget?**
   - $50-90/month is reasonable for 1000 users
   - Can optimize costs based on actual usage

4. **Do you need high availability?**
   - Single instance: 99.5% uptime
   - Multiple instances: 99.9%+ uptime

---

## Next Steps

1. **This Week**: Upgrade plan, increase connection pool, add rate limiting
2. **Next Week**: Load test, monitor, optimize
3. **Before Launch**: Full load test, set up alerts, document procedures
4. **After Launch**: Monitor closely for first month, adjust as needed

Good luck scaling! 🚀

