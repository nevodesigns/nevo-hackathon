if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/siwes/sw.v2.js?v=1', { scope: '/siwes/' })
      .catch(function () {
        /* no worker is fine, the app works fully online without it */
      })
  })
}
