---
name: design-review
description: Keep Vong's three shells looking like one product — check design token parity between web and mobile, review screenshots in .shots/, and specify the visual treatment for a new surface. Use when building or changing UI, when web and mobile styling drift, when reviewing how a screen looks, or before shipping a visual change.
---

# Design review

Direction: **immersive, dark-first, artwork-forward**. Big cover art, gradients derived
from artwork, bold type, dense lush cards, on all three shells.

## Token parity is the first check

Two files, no shared layer:

- Web: `src/app/globals.css` — role-named CSS variables under `@theme inline`
- Mobile: `mobile/src/theme.ts` — `colors`, `font`, `spacing`, `radius`

These have drifted before — web on indigo/zinc while mobile ran rose/black — and **no
automated check in this repo can see it**. Any change to one is a change to both. Compare
role by role (background, surface, border, accent, muted) and report mismatches as
concrete pairs, not as "colours differ".

Windows inherits the web tokens: the Tauri shell loads the remote origin, so a web token
change ships to desktop with the next web deploy and no installer.

## Review the pixels, not the classes

`.shots/` holds real screenshots — read the images. A class list can be perfect while the
screen is unusable. If a shot for the affected screen does not exist, capture one (the
`verify-android` skill drives the Android UI over adb; `run` launches the web app).

Check, in this order:

1. **Hierarchy** — what does the eye land on first? On a surface with cover art, the art
   should win and the chrome should recede.
2. **Contrast** — artwork-derived gradients are the direction and also the most common way
   to get unreadable text over a bright album cover. Every gradient proposal needs a
   stated fallback.
3. **Vietnamese string length** — the product language is Vietnamese and its strings run
   longer than English. Test wrapping with real labels ("Cài đặt · Kết nối", "Tự phát
   tiếp", "Gửi số liệu ẩn danh"), never with placeholder text.
4. **Empty and missing states** — no artwork, no results, no connection. These are where
   an artwork-forward design falls apart.
5. **Reachability on Android** — it leads the platform order; primary actions belong in
   the lower half of a phone screen.

## Specifying a new surface

Before it is built, write: layout and hierarchy, what the artwork does, type scale and
weights, which existing tokens are used (adding a token is a decision, not a detail), the
long-Vietnamese-title case, the no-artwork case, and the loading state.

Loading matters more here than in most apps: audio takes seconds to start (Drive TTFB,
googlevideo resolution), and `isBuffering` exists in the store precisely so the UI is not
silent during it. Say what the surface shows while buffering.

## Reporting

Before/after with screenshot paths. When you change a token file, state exactly which
shells must be re-checked visually — a token edit is never a single-shell change.
