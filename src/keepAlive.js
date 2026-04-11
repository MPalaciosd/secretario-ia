// keepAlive.js — Ping the service every 14 minutes to prevent Render free tier spin-down
function startKeepAlive(port) {
  if (process.env.NODE_ENV !== 'production') return;
  
  const url = process.env.APP_URL || `http://localhost:${port}`;
  
  setInterval(async () => {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        console.log('[KeepAlive] ✅ Ping OK');
      }
    } catch (err) {
      console.warn('[KeepAlive] ⚠️ Ping failed:', err.message);
    }
  }, 14 * 60 * 1000); // Every 14 minutes
  
  console.log('[KeepAlive] Started for:', url);
}

module.exports = { startKeepAlive };
