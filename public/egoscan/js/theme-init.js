(function () {
  try {
    var t = localStorage.getItem('egoscan-theme');
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage may be blocked */ }
})();
