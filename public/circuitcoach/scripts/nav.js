/* mark the nav link for whichever section is in view */
  (function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.bar-nav a[href^="#"]'));
    var ids = links.map(function (a) { return a.getAttribute('href').slice(1); });
    var seen = new Map();
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen.set(e.target.id, e.intersectionRatio); });
      var best = null, top = 0;
      seen.forEach(function (r, id) { if (r > top) { top = r; best = id; } });
      links.forEach(function (a) {
        a.classList.toggle('here', a.getAttribute('href') === '#' + best);
      });
    }, { threshold: [0.15, 0.4, 0.7] });
    ids.forEach(function (id) { var n = document.getElementById(id); if (n) io.observe(n); });
  })();
