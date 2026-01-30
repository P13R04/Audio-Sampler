// Wrapper pour compatibilité Render
import('./index.mjs').catch(err => {
  console.error('Failed to load backend:', err);
  process.exit(1);
});
