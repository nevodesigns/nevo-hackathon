# NEVO-HACKATHON

A single hub that brings Golazo, LogSight, SIWES LogChain, AGBE and
CircuitCoach together as one static deploy. Each project is a real, working
copy served from its own subpath, not just a link out to somewhere else, so
the hub keeps working even if the original standalone deployments are taken
down (AGBE and CircuitCoach are the exceptions, see below).

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
  canonical deployment at https://circuitcoach.vercel.app/ stays untouched.
  The simulator itself (`/circuitcoach/app/`) works fully in this mirror; the
  optional AI tutor needs a serverless Gemini-backed endpoint
  (`circuitcoach-site`'s `api/` folder) that is not deployed here, so it
  degrades to its documented offline state rather than failing.

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
npm run build
cp -r dist/* ../../nevo-hackathon/public/siwes/
```

None of these patches touch the original repo, only a scratch copy used to
produce the build.
