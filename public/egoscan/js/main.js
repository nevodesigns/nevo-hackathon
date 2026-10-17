(function () {
  'use strict';
  var root = document.documentElement;

  /* Theme toggle */
  var btn = document.getElementById('theme');
  function label() { btn.textContent = root.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark'; }
  label();
  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('egoscan-theme', next); } catch (e) { /* ignore */ }
    label();
  });

  /* Reveal on scroll */
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.sec .wrap > *, .hero-art, .hero-copy').forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }

  /* The checks, simplified. The real engine lives in the repository. */
  var SAMPLES = {
    clean: [
      'rice 2 x 14k = 28,000 paid',
      'sugar 3 x 2,500 = 7,500 paid',
      'Adaeze - oil 5 x 3k = 15,000 owe',
      'Total 50,500'
    ].join('\n'),
    messy: [
      'rice 2 x 14k = 28,000 paid',
      'sugar 3 x 2,500 paid',
      'Adaeze - oil 5 x 3k = 15,000 owe',
      'beans 4 x 1,200 = 4,900 paid',
      'pure water 3 600 paid',
      '~ Musa - flour 2 x 9,000 = 18,000 owe',
      'Total 75,300'
    ].join('\n')
  };

  var ta = document.getElementById('lines');
  var tbody = document.querySelector('#out tbody');
  var pagecheck = document.getElementById('pagecheck');
  var seg = document.querySelectorAll('.seg button');

  function naira(n) { return n === null || isNaN(n) ? '' : '₦' + Math.round(n).toLocaleString('en-NG'); }

  function amount(tok) {
    var t = tok.toLowerCase();
    var mult = 1;
    if (/k$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
    if (/\d\/\d{3}$/.test(t)) return { v: NaN, amb: true };
    var v = parseFloat(t.replace(/,/g, ''));
    return { v: isNaN(v) ? NaN : v * mult, amb: false };
  }

  function td(text, cls) { var c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text; return c; }

  function run() {
    var lines = ta.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var rows = [], pageTotal = null;
    lines.forEach(function (raw) {
      var struck = false, line = raw;
      if (line.charAt(0) === '~') { struck = true; line = line.slice(1).trim(); }
      if (/^total\b/i.test(line)) {
        var m = line.match(/\d[\d,./]*k?/i);
        if (m) pageTotal = amount(m[0]).v;
        return;
      }
      var customer = '';
      var dash = line.indexOf(' - ');
      if (dash > 0) { customer = line.slice(0, dash).trim(); line = line.slice(dash + 3).trim(); }
      var status = /\bowe/i.test(line) ? 'owed' : (/\bpaid\b/i.test(line) ? 'paid' : 'not marked');
      var left = line, written = null, flags = [];
      var eq = line.indexOf('=');
      if (eq > -1) {
        left = line.slice(0, eq);
        var wm = line.slice(eq + 1).match(/\d[\d,./]*k?/i);
        if (wm) written = amount(wm[0]).v;
      }
      var nums = left.match(/\d[\d,./]*k?/gi) || [];
      var item = left.replace(/\d[\d,./]*k?/gi, '').replace(/\bx\b|×/gi, '').replace(/\b(paid|owe[sd]?)\b/gi, '').replace(/\s+/g, ' ').trim();
      var qty = 1, price = NaN, computed = NaN, total = NaN;
      if (nums.length >= 2) {
        var a = amount(nums[0]), b = amount(nums[1]);
        qty = a.v; price = b.v;
        var plainPair = nums.length === 2 && /^\d{1,3}$/.test(nums[0]) && /^\d{3}$/.test(nums[1]) && !/\bx\b|×/i.test(left);
        if (plainPair) flags.push('"' + nums[0] + ' ' + nums[1] + '" could be ' + nums[0] + ' x ' + nums[1] + ' or ' + nums[0] + ',' + nums[1] + '. Pick one.');
        if (a.amb || b.amb) flags.push('A separator like 33/000 can be read two ways.');
      } else if (nums.length === 1) {
        var only = amount(nums[0]);
        price = only.v;
        if (only.amb) flags.push('A separator like 33/000 can be read two ways.');
      }
      computed = qty * price;
      if (written !== null && !isNaN(written)) {
        total = written;
        if (!isNaN(computed) && Math.abs(computed - written) > 0.5) {
          flags.push('Written ' + written.toLocaleString('en-NG') + ', quantity times price is ' + computed.toLocaleString('en-NG') + '. Difference ' + Math.abs(written - computed).toLocaleString('en-NG') + '.');
        }
      } else {
        total = computed;
        flags.push('No total was written, so it was worked out from quantity and price. Check it.');
      }
      if (status === 'owed' && !customer) flags.push('Owed, but no customer name. It cannot go on Owes You.');
      if (struck) { status = 'paid'; flags.push('Struck through, so marked paid. Confirm it.'); }
      rows.push({ item: item || '(no item)', qty: qty, price: price, total: total, status: status, flags: flags, struck: struck, customer: customer });
    });

    tbody.textContent = '';
    var sum = 0;
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.flags.length) tr.className = 'bad';
      var name = r.customer ? r.customer + ', ' + r.item : r.item;
      var c0 = document.createElement('td');
      if (r.struck) { var s = document.createElement('s'); s.textContent = name; c0.appendChild(s); } else { c0.textContent = name; }
      tr.appendChild(c0);
      tr.appendChild(td(isNaN(r.qty) ? '' : String(r.qty), 'n'));
      tr.appendChild(td(naira(r.price), 'n'));
      tr.appendChild(td(naira(r.total), 'n'));
      tr.appendChild(td(r.status));
      var c = document.createElement('td');
      if (r.flags.length) { c.className = 'chk'; c.textContent = r.flags.join(' '); } else { c.className = 'okc'; c.textContent = 'Clean'; }
      tr.appendChild(c);
      tbody.appendChild(tr);
      if (!isNaN(r.total)) sum += r.total;
    });

    pagecheck.className = 'pagecheck';
    if (pageTotal === null || isNaN(pageTotal)) {
      pagecheck.textContent = rows.length ? 'Rows add to ' + naira(sum) + '. No page total was written, so there is nothing to compare.' : 'Add some lines to check.';
    } else if (Math.abs(sum - pageTotal) < 0.5) {
      pagecheck.className = 'pagecheck ok';
      pagecheck.textContent = 'Page check passed. The rows add to ' + naira(sum) + ', the total written on the page.';
    } else {
      pagecheck.className = 'pagecheck bad';
      pagecheck.textContent = 'Page check failed. The rows add to ' + naira(sum) + ', the page says ' + naira(pageTotal) + '. Difference ' + naira(Math.abs(sum - pageTotal)) + '. A person should look.';
    }
  }

  function pick(name) {
    ta.value = SAMPLES[name];
    seg.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-sample') === name); });
    run();
  }
  seg.forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-sample')); }); });
  ta.addEventListener('input', function () { seg.forEach(function (b) { b.classList.remove('on'); }); run(); });
  pick('messy');
})();
