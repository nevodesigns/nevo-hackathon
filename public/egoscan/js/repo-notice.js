(function () {
  'use strict';
  var links = document.querySelectorAll('a[data-private-repo]');
  if (!links.length || typeof HTMLDialogElement === 'undefined') return;

  var dlg = document.createElement('dialog');
  dlg.className = 'repo-notice';
  dlg.setAttribute('aria-labelledby', 'repo-notice-title');
  dlg.innerHTML =
    '<h2 id="repo-notice-title">This repository is private for now</h2>' +
    '<p>The EgoScan repository was made private due to some unfortunate issues.</p>' +
    '<p><strong>Please expect the launch of EgoScan as a full product.</strong></p>' +
    '<p>You can still continue to the repository, but you will only see it if you have been given access.</p>' +
    '<div class="repo-actions"><button type="button" class="go">Continue to the repository</button><button type="button" class="close">Close</button></div>';
  document.body.appendChild(dlg);

  var target = '';
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      target = a.href;
      dlg.showModal();
      dlg.querySelector('.go').focus();
    });
  });
  dlg.querySelector('.go').addEventListener('click', function () {
    dlg.close();
    window.open(target, '_blank', 'noopener');
  });
  dlg.querySelector('.close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
})();
