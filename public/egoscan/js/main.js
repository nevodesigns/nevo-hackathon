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

  /* Product tour */
  var SHOTS = {
    review: { src: 'assets/shots/review.webp', w: 2000, h: 1560, wide: true, cap: 'Review. Highlighted fields are the ones the checks distrust. Fix anything wrong, then mark the page as checked.', alt: 'The Review screen: a photographed notebook page beside the rows read from it, with a doubtful field highlighted and a reason in plain words.' },
    home: { src: 'assets/shots/home.webp', w: 780, h: 1688, cap: 'Home. The first number is what customers owe the shop, from pages the owner has checked.', alt: 'The Home screen: how much customers owe, sales, collected, and pages that need a check.' },
    owes: { src: 'assets/shots/owes.webp', w: 780, h: 1688, cap: 'Owes You. Every customer who owes the shop, largest first, with the business name used in reminders.', alt: 'The Owes You list, customers ordered by what they owe.' },
    ledger: { src: 'assets/shots/ledger.webp', w: 780, h: 1688, cap: 'A customer\'s ledger. Remind on WhatsApp, copy a statement, and Record Payment against each item.', alt: 'One customer\'s ledger with Remind on WhatsApp, Copy statement and Record Payment.' },
    reports: { src: 'assets/shots/reports.webp', w: 780, h: 1688, cap: 'Reports and Insights. Every figure is added up by the program from checked pages. The model never calculates.', alt: 'Reports and Insights: sales, collected, still owed, and best sellers for a day.' },
    trust: { src: 'assets/shots/trust.webp', w: 780, h: 1688, cap: 'Trust. Where photos go, why nothing counts until checked, and what is stored.', alt: 'The Trust screen explaining where photos go and what is stored.' }
  };
  var tabs = document.querySelectorAll('.tour-tabs button');
  var frame = document.getElementById('frame'), img = document.getElementById('tour-img'), cap = document.getElementById('tour-cap');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var s = SHOTS[t.getAttribute('data-shot')];
      tabs.forEach(function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
      frame.className = 'frame ' + (s.wide ? 'wide' : 'phone');
      img.src = s.src; img.width = s.w; img.height = s.h; img.alt = s.alt; cap.textContent = s.cap;
    });
  });

  /* The checks, simplified. The real engine lives in the repository. */
  var SAMPLES = {
    clean: ['rice 2 x 14k = 28,000 paid', 'sugar 3 x 2,500 = 7,500 paid', 'Adaeze - oil 5 x 3k = 15,000 owe', 'Total 50,500'].join('\n'),
    messy: ['rice 2 x 14k = 28,000 paid', 'sugar 3 x 2,500 paid', 'Adaeze - oil 5 x 3k = 15,000 owe', 'beans 4 x 1,200 = 4,900 paid', 'pure water 3 600 paid', '~ Musa - flour 2 x 9,000 = 18,000 owe', 'Total 75,300'].join('\n')
  };
  var ta = document.getElementById('lines'), entriesEl = document.getElementById('entries'), checkEl = document.getElementById('pagecheck');
  var markBtn = document.getElementById('markbtn'), owesEl = document.getElementById('owescard');
  var sampleBtns = document.querySelectorAll('[data-sample]');
  var rows = [], pageTotal = null, checked = false;

  function naira(n) { return n === null || isNaN(n) ? '' : '₦' + Math.round(n).toLocaleString('en-NG'); }
  function fmt(n) { return Math.round(n).toLocaleString('en-NG'); }
  function amount(tok) {
    var t = String(tok).toLowerCase().trim(), mult = 1;
    if (/k$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
    if (/\d\/\d{3}$/.test(t)) return { v: NaN, amb: true };
    var v = parseFloat(t.replace(/,/g, ''));
    return { v: isNaN(v) ? NaN : v * mult, amb: false };
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function parse() {
    rows = []; pageTotal = null;
    ta.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (raw) {
      var struck = false, line = raw;
      if (line.charAt(0) === '~') { struck = true; line = line.slice(1).trim(); }
      if (/^total\b/i.test(line)) { var m = line.match(/\d[\d,./]*k?/i); if (m) pageTotal = amount(m[0]).v; return; }
      var customer = '', dash = line.indexOf(' - ');
      if (dash > 0) { customer = line.slice(0, dash).trim(); line = line.slice(dash + 3).trim(); }
      var status = /\bowe/i.test(line) ? 'owed' : (/\bpaid\b/i.test(line) ? 'paid' : 'unmarked');
      var left = line, written = null, flags = [], eq = line.indexOf('=');
      if (eq > -1) { left = line.slice(0, eq); var wm = line.slice(eq + 1).match(/\d[\d,./]*k?/i); if (wm) written = amount(wm[0]).v; }
      var nums = left.match(/\d[\d,./]*k?/gi) || [];
      var item = left.replace(/\d[\d,./]*k?/gi, '').replace(/\bx\b|×/gi, '').replace(/\b(paid|owe[sd]?)\b/gi, '').replace(/\s+/g, ' ').trim();
      var qty = 1, price = NaN;
      if (nums.length >= 2) {
        var a = amount(nums[0]), b = amount(nums[1]); qty = a.v; price = b.v;
        if (nums.length === 2 && /^\d{1,3}$/.test(nums[0]) && /^\d{3}$/.test(nums[1]) && !/\bx\b|×/i.test(left)) flags.push({ f: 'price', m: '"' + nums[0] + ' ' + nums[1] + '" could be ' + nums[0] + ' x ' + nums[1] + ' or ' + nums[0] + ',' + nums[1] + '. Pick one.' });
        if (a.amb || b.amb) flags.push({ f: 'price', m: 'A separator like 33/000 can be read two ways.' });
      } else if (nums.length === 1) { var o = amount(nums[0]); price = o.v; if (o.amb) flags.push({ f: 'price', m: 'A separator like 33/000 can be read two ways.' }); }
      var computed = qty * price, total;
      if (written !== null && !isNaN(written)) {
        total = written;
        if (!isNaN(computed) && Math.abs(computed - written) > 0.5) flags.push({ f: 'total', m: 'Written ' + fmt(written) + ', quantity times price is ' + fmt(computed) + '. Difference ' + fmt(Math.abs(written - computed)) + '.' });
      } else { total = computed; flags.push({ f: 'total', m: 'No total was written, so it was worked out from quantity and price. Check it.' }); }
      if (status === 'owed' && !customer) flags.push({ f: 'customer', m: 'Owed, but no customer name. It cannot go on Owes You.' });
      if (struck) { status = 'paid'; flags.push({ f: 'status', m: 'Struck through, so marked paid. Confirm it.' }); }
      rows.push({ raw: raw, item: item || '', qty: qty, price: price, total: total, customer: customer, status: status, flags: flags, struck: struck, statusEdited: false, ui: null });
    });
  }

  function recheck(r) {
    r.flags = [];
    var c = r.qty * r.price;
    if (!isNaN(c) && !isNaN(r.total) && Math.abs(c - r.total) > 0.5) r.flags.push({ f: 'total', m: 'Written ' + fmt(r.total) + ', quantity times price is ' + fmt(c) + '. Difference ' + fmt(Math.abs(r.total - c)) + '.' });
    if (r.status === 'owed' && !r.customer.trim()) r.flags.push({ f: 'customer', m: 'Owed, but no customer name. It cannot go on Owes You.' });
    if (r.struck && !r.statusEdited) r.flags.push({ f: 'status', m: 'Struck through, so marked paid. Confirm it.' });
  }

  function field(r, key, labelText, kind) {
    var wrap = el('div', 'ea-f k-' + key), id = 'f-' + Math.random().toString(36).slice(2, 8);
    var lab = el('label', '', labelText); lab.setAttribute('for', id);
    var inp;
    if (kind === 'select') {
      inp = el('select');
      [['paid', 'Paid'], ['owed', 'Owes You'], ['unmarked', 'Not marked']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; inp.appendChild(op); });
      inp.value = r.status;
    } else {
      inp = el('input'); inp.type = 'text';
      if (kind === 'num') { inp.className = 'n'; inp.inputMode = 'decimal'; }
    }
    inp.id = id; wrap.appendChild(lab); wrap.appendChild(inp);
    return { wrap: wrap, inp: inp };
  }

  function paint(r) {
    var u = r.ui, fl = {};
    r.flags.forEach(function (x) { fl[x.f] = true; });
    ['item', 'qty', 'price', 'total', 'customer', 'status'].forEach(function (k) { u.f[k].wrap.classList.toggle('flag', !!fl[k]); });
    u.why.textContent = '';
    if (r.flags.length) {
      r.flags.forEach(function (x) { u.why.appendChild(el('p', '', x.m)); });
      u.why.appendChild(el('i', '', 'Line as read: ' + r.raw));
      u.why.hidden = false;
    } else { u.why.hidden = true; }
    u.pill.className = 'ea-pill ' + (r.status === 'paid' ? 'ok' : r.status === 'owed' ? 'owes' : '');
    u.pill.textContent = r.status === 'paid' ? 'Paid' : r.status === 'owed' ? 'Owes You' : 'Not marked';
  }

  function pageCheck() {
    var sum = 0, flagged = 0;
    rows.forEach(function (r) { if (!isNaN(r.total)) sum += r.total; if (r.flags.length) flagged++; });
    checkEl.textContent = '';
    var l1 = el('span', '', rows.length ? 'Rows add to ' + naira(sum) + (pageTotal !== null && !isNaN(pageTotal) ? '. The page says ' + naira(pageTotal) + '.' : '. No page total was written.') : 'Add some lines to check.');
    checkEl.appendChild(l1);
    if (rows.length && pageTotal !== null && !isNaN(pageTotal)) {
      var ok = Math.abs(sum - pageTotal) < 0.5;
      checkEl.appendChild(el('span', ok ? 'good' : 'bad', ok ? 'Page check passed.' : 'Page check failed. Difference ' + naira(Math.abs(sum - pageTotal)) + '. A person should look.'));
    }
    if (flagged) checkEl.appendChild(el('span', '', flagged + (flagged === 1 ? ' row still needs a look.' : ' rows still need a look.')));
  }

  function renderOwes() {
    owesEl.textContent = '';
    owesEl.className = 'ea-owes' + (checked ? ' on' : '');
    owesEl.appendChild(el('small', '', 'Owes You'));
    if (!checked) {
      owesEl.appendChild(el('strong', '', naira(0)));
      owesEl.appendChild(el('span', '', 'Nothing counts until you mark the page as checked.'));
      return;
    }
    var by = {}, total = 0;
    rows.forEach(function (r) { if (r.status === 'owed' && r.customer.trim() && !isNaN(r.total)) { by[r.customer.trim()] = (by[r.customer.trim()] || 0) + r.total; total += r.total; } });
    var n = Object.keys(by).length;
    owesEl.appendChild(el('strong', '', naira(total)));
    owesEl.appendChild(el('span', '', n + (n === 1 ? ' customer owes' : ' customers owe') + ' you money, from pages you have checked.'));
  }

  function setChecked(v) { checked = v; markBtn.textContent = v ? 'Marked as checked' : 'Mark page as checked'; markBtn.classList.toggle('secondary', v); renderOwes(); }

  function build() {
    parse(); entriesEl.textContent = '';
    rows.forEach(function (r) {
      var card = el('div', 'ea-entry'), grid = el('div', 'ea-fields');
      var f = { item: field(r, 'item', 'Item'), qty: field(r, 'qty', 'Qty', 'num'), price: field(r, 'price', 'Price', 'num'), total: field(r, 'total', 'Total', 'num'), customer: field(r, 'customer', 'Customer'), status: field(r, 'status', 'Status', 'select') };
      f.item.inp.value = r.item; f.qty.inp.value = isNaN(r.qty) ? '' : r.qty; f.price.inp.value = isNaN(r.price) ? '' : r.price; f.total.inp.value = isNaN(r.total) ? '' : r.total; f.customer.inp.value = r.customer;
      ['item', 'qty', 'price', 'total', 'customer', 'status'].forEach(function (k) { grid.appendChild(f[k].wrap); });
      var why = el('div', 'ea-why'), foot = el('div', 'ea-foot'), pill = el('span', 'ea-pill');
      foot.appendChild(pill); card.appendChild(grid); card.appendChild(why); card.appendChild(foot);
      entriesEl.appendChild(card);
      r.ui = { f: f, why: why, pill: pill };
      function onEdit() {
        r.item = f.item.inp.value; r.customer = f.customer.inp.value;
        r.qty = amount(f.qty.inp.value || 'x').v; r.price = amount(f.price.inp.value || 'x').v; r.total = amount(f.total.inp.value || 'x').v;
        recheck(r); paint(r); pageCheck(); setChecked(false);
      }
      ['item', 'qty', 'price', 'total', 'customer'].forEach(function (k) { f[k].inp.addEventListener('input', onEdit); });
      f.status.inp.addEventListener('change', function () { r.status = f.status.inp.value; r.statusEdited = true; recheck(r); paint(r); pageCheck(); setChecked(false); });
      paint(r);
    });
    pageCheck(); setChecked(false);
  }

  function pick(name) {
    ta.value = SAMPLES[name];
    sampleBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-sample') === name); });
    build();
  }
  sampleBtns.forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-sample')); }); });
  ta.addEventListener('input', function () { sampleBtns.forEach(function (b) { b.classList.remove('on'); }); build(); });
  markBtn.addEventListener('click', function () { setChecked(true); });
  pick('messy');
})();
