# NEVO-HACKATHON

A single hub that brings Golazo, LogSight, SIWES LogChain, AGBE,
CircuitCoach and natlas-kit together as one static deploy. Each project is a
real, working copy served from its own subpath, not just a link out to
somewhere else, so the hub keeps working even if the original standalone
deployments are taken down (AGBE, CircuitCoach and natlas-kit are kept as
deliberate mirrors instead, see below).

## Projects

- **Golazo** (`/golazo/`): agent-payable World Cup 2026 data API, x402
  micropayments on Injective. This is the landing page; the live agent-payment
  API/MCP server itself is a separate backend (see
  [github.com/nevodesigns/golazo](https://github.com/nevodesigns/golazo)) and
  is unaffected either way.
- **LogSight** (`/logsight/`): offline SIWES logbook assistant on a local
  Gemma 4 model. This is the landing/demo page; the real tool runs locally on
  a student's own machine via Ollama, by design (it has to work with no
  internet), so it was never a hosted web app to begin with. Split into
  `index.html`, `css/style.css`, `js/script.js` and `assets/favicon.png`
  (the original copy was a single self-contained HTML file).
- **SIWES LogChain** (`/siwes/`): a real, fully functional copy of the onchain
  SIWES logbook app. It talks directly to the deployed `SIWESLog` contract on
  Monad Testnet from the browser (via `ethers.js`), so it keeps working
  regardless of where it's hosted. Built from the `frontend/` source with
  `base: '/siwes/'`, a `/siwes` router basename, and `APP_URL` overridden to
  `window.location.origin + '/siwes'` so shareable verify links/QR
  codes/PDFs generated from the hub point back at the hub, not the original
  deployment.
- **AGBE** (`/agbe/`): offline 1B agronomy model, ADTC 2026 Finalist. This is
  a static **mirror**, deliberately kept as a copy: the canonical,
  competition-submitted deployment at https://agbe-site.pxxlspace.cv/ must
  stay untouched, since that exact URL was already submitted to ADTC
  organisers. Do not delete or modify that one.
- **CircuitCoach** (`/circuitcoach/`): a browser breadboard simulator built
  for the 2026 IEEE Metaverse Grand Challenge. Also a static **mirror**; the
  canonical deployment is untouched and, per request, is not linked from the
  hub card or the mirror page itself (unlike AGBE and natlas-kit, which both
  link back to their canonical sites). The simulator itself
  (`/circuitcoach/app/`) works fully in this mirror; the optional AI tutor
  needs a serverless Gemini-backed endpoint (`circuitcoach-site`'s `api/`
  folder) that is not deployed here, so it degrades to its documented
  offline state rather than failing.
- **natlas-kit** (`/natlas/`): developer toolkit for NCAIR's N-ATLaS models,
  built for NAIC 2026. Also a static **mirror** of the GitHub Pages site; the
  canonical, NAIC-submitted deployment at
  https://nevodesigns.github.io/natlas-kit/ stays untouched.

## Structure

```
public/
  index.html     Hub landing page
  assets/        Icons/logos used on the hub cards
  golazo/        Static copy of golazo-site's public/ folder
  logsight/      Static copy of logsight's landing page, split into html/css/js
  siwes/         Built copy of siwes-logchain's frontend, base path /siwes/
  agbe/          Static mirror of the AGBE site (absolute paths rewritten to /agbe/*)
  circuitcoach/  Static mirror of circuitcoach-site (landing page + app/ simulator,
                 absolute paths rewritten to /circuitcoach/*; no api/ backend)
  natlas/        Static mirror of natlas-kit's GitHub Pages site (web/ folder)
```

## Running locally

```bash
npm install
PORT=3000 npm start
```

## Deploying

This is a static site, deployed the same way as the sibling Pxxl projects
(`golazo-site`): connect this repo in the Pxxl dashboard, or run `pxxl deploy`
from a CLI session with an active paid plan.

## Updating the SIWES LogChain copy

If `siwes-logchain/frontend` changes, rebuild the `/siwes/` copy rather than
hand-editing it:

```bash
cd siwes-logchain/frontend
# patch src/constants.js: APP_URL -> window.location.origin + '/siwes'
# patch vite.config.js: add base: '/siwes/', and prefix the PWA manifest's
#   start_url/scope/icon paths with /siwes/
# patch src/main.jsx: <BrowserRouter basename="/siwes">
# patch index.html: service worker register path/scope -> /siwes/sw.v2.js, /siwes/
# move the inline sw-registration script into register-sw.js, referenced via
#   <script src="/siwes/register-sw.js"> (CSP has no script-src exceptions)
npm run build
cp -r dist/* ../../nevo-hackathon/public/siwes/
```

None of these patches touch the original repo, only a scratch copy used to
produce the build.

## Security

A review pass checked for: hardcoded secrets (including git history), XSS
vectors (no `dangerouslySetInnerHTML`/`innerHTML` with untrusted data, the
SIWES `?address=` param is validated with `ethers.isAddress` before use),
reverse-tabnabbing (every `target="_blank"` link carries `rel="noopener"`),
inline `<script>`/event-handler injection points, and `eval`/`new Function`
usage in bundled dependencies. Nothing exploitable was found; two first-party
inline scripts (LogSight's FOUC class toggle, SIWES's service-worker
registration) were moved to external files so the site needs no `script-src`
exceptions at all.

`serve.json` now sends, on every route:

- `Content-Security-Policy`: `script-src 'self'` with no inline/eval
  exceptions; `style-src` allows `'unsafe-inline'` plus Google Fonts (several
  mirrored pages use inline `style="..."` attributes); `connect-src` is
  scoped to `'self'` and the Monad testnet RPC (`testnet-rpc.monad.xyz`) that
  SIWES LogChain calls directly from the browser; `frame-src` is scoped to
  the two embedded demo videos (`youtube-nocookie.com`, `drive.google.com`);
  `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`.
- `Permissions-Policy`: denies camera, microphone, geolocation, USB and
  payment APIs, none of which any project here needs.
- The existing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
  and `Referrer-Policy`.

Verified with a real headless-Chrome run (Playwright) against every route,
including the SIWES SPA's client-side routes and a live on-chain record
lookup via the seeded demo address: zero CSP violations, zero console
errors, zero failed requests.
