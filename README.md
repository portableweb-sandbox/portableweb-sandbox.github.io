# portableweb-sandbox

**Experimental** isolated bundle execution origin for [portableweb-studio](https://github.com/portableweb-studio/portableweb-studio.github.io).

> **Official live site:** [portableweb.org](https://portableweb.org) / [portableweb.github.io](https://github.com/portableweb/portableweb.github.io)
>
> This org is for experimental security work. Do not rely on it for production use.

---

## What this is

`.pweb` bundles are user-supplied HTML/CSS/JS. To prevent a bundle from accessing the viewer's storage, DOM, or APIs, bundles must run on a **different origin** from the viewer app.

`portableweb-sandbox.github.io` is that origin. The viewer app (`portableweb-studio.github.io`) opens bundles here in a popup. Because the two origins are different, the browser enforces a hard security boundary between them:

- Bundle JS cannot read or write the studio's localStorage, IndexedDB, or cookies
- Bundle JS cannot access the studio's `window` object or DOM
- The studio's postMessage interface is the only communication channel

## How it works

```
portableweb-studio.github.io/app/         portableweb-sandbox.github.io/
───────────────────────────────────       ────────────────────────────────
User opens .pweb file                     popup: /portal.html?s=<sessionId>
  ↓                                         ↓
Studio unzips file into memory            SW registers (if first visit)
  ↓                                         ↓
Studio waits for "portal-ready"  ←───── portal sends "portal-ready"
  ↓
Studio sends files via postMessage ─────→ portal stores in per-session IDB
                                          ↓
                                        Navigate to /bundle/<id>/<entry>
                                          ↓
                                        SW intercepts, serves from IDB
                                        with guard injected + CSP headers
```

## Files

| File | Purpose |
|---|---|
| `sw.js` | Service worker — caches shell, serves `/bundle/<id>/*` from per-session IDB, injects security guard into HTML, sets CSP headers |
| `portal.html` | Popup landing page — registers SW, signals ready, receives files, stores in IDB, navigates to bundle entry |
| `install.html` | SW pre-installer — loaded in hidden iframe by studio to install sandbox SW before first bundle open |

## Security controls applied to bundles

| Threat | Control |
|---|---|
| Bundle reading studio's storage | Cross-origin — browser blocks entirely |
| Bundle accessing studio's `window` | Cross-origin — browser blocks entirely |
| Bundle reading another session's IDB | Per-session databases with UUID names unknown to bundles |
| Bundle accessing IDB directly | SW injects `window.indexedDB = undefined` |
| Bundle registering a rogue service worker | SW injects `navigator.serviceWorker = undefined` |
| Bundle spawning workers to bypass injection | CSP `worker-src 'none'` |
| Bundle exfiltrating data externally | CSP `connect-src /bundle/<sessionId>/` |

## Deployment

GitHub Pages — serve from `main` branch root. No build step required.

Enable Pages in repo settings: **Source → Deploy from branch → main → / (root)**.

## Related

- [portableweb-studio](https://github.com/portableweb-studio/portableweb-studio.github.io) — experimental viewer app that uses this sandbox origin
- [portableweb/portableweb.github.io](https://github.com/portableweb/portableweb.github.io) — official live site
- [portableweb.org](https://portableweb.org) — official domain
