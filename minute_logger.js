// Logs a timestamp entry every minute
setInterval(() => {
  console.log(`[${new Date().toISOString()}] Minute logger entry`);
}, 60000);

console.log('Minute logger started. Press Ctrl+C to stop.');
