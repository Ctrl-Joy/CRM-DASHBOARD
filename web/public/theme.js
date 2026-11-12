// Apply the saved theme before first paint. Kept in its own file because the
// content security policy does not allow inline scripts.
try {
  var t = (JSON.parse(localStorage.getItem('nimbus-ui') || '{}').state || {}).theme || 'system';
  if (t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) {}
