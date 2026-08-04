# Brand Guidelines — Cassiodorus

This document captures the brand direction for the app formerly known as
`am-whisper-stt`, now **Cassiodorus**. It's a starting point, not a final
spec — treat the palette/typography values below as a first pass to
refine once real visual design work begins, not settled production
values.

## 1. Identity

**Name:** Cassiodorus
**Tagline:** *Ancient diligence. Modern intelligence.*
**Positioning statement:**
> Secure, on-device multi-speaker transcription paired with specialized
> AI editing personas — turning messy raw audio into polished,
> intentional copy without sacrificing privacy.

**Why the name works:** the historical Cassiodorus (c. 485–585 AD) founded
the Vivarium monastery and its scriptorium, where monks meticulously
hand-copied and preserved classical texts through the fall of Rome. That's
not a loose metaphor for a transcription tool — it's close to literal. The
tagline plays the two eras directly against each other: "ancient
diligence" is the scribe's fidelity to the source; "modern intelligence"
is the same job done by faster-whisper/Parakeet + Gemini today.

**Note on the positioning statement:** "specialized AI editing personas"
describes a feature that doesn't fully exist yet — today there's one
Gemini formatting pass with adjustable creativity levels, not multiple
named personas. Treat that phrase as a design target for where the
"Format with AI" feature could grow, not a claim to put in user-facing
docs until it's real. (See `PLAN.md`/`DEVLOG.md` for what's actually
shipped.)

## 2. Logo reference (`casiodorus-logo.jpg`, since removed from the repo)

*This file was a mood-board reference only and has since been deleted
from the repo (it was never meant to ship) — description kept here from
when it was reviewed, since the visual direction it confirmed still
matters even though the file itself is gone.*

The reference image is an illuminated-manuscript-style **historiated
initial "C"**: a golden fish curled into the letter's shape, a small
jeweled crown at the top, set on aged parchment/vellum, inside an ornate
gold filigree border (acanthus leaves, berries, gemstone medallions, a
bee and a dragonfly tucked into the corners).

**What this confirms as direction:** illuminated manuscript aesthetic,
gold leaf on parchment, deep jewel-tone accents, ornamental border
language, historiated (image-bearing) initial letters as a device.

**What it is NOT:** a ready-to-ship logo asset.

- It's raster AI-generated illustration, not vector — it can't be cleanly
  recolored, scaled down, or reproduced as consistent variants (favicon,
  dark-mode header, monochrome print) without being redrawn.
- It's far too detailed to survive shrinking to favicon/app-icon size
  (16–32px) — all of the filigree, gems, and crown detail will turn to
  mud at that scale. Any production mark needs to be legible as a single
  bold silhouette first, with detail only at larger sizes.
- **Open question — the fish:** it's a striking, memorable device, but it
  has no obvious semantic tie to transcription/scriptoria the way a
  quill, ink drop, unfurling scroll, or pen nib would. Three ways to
  resolve this, worth a real decision rather than defaulting silently:
  1. Keep the fish — plenty of strong logos are non-literal/abstract, and
     it's genuinely distinctive.
  2. Replace it with a scriptorium-coded motif (quill, scroll, ink drop)
     rendered in the same illuminated-initial style.
  3. Keep both — the plain illuminated "C" as the primary mark, the fish
     as a secondary/easter-egg device (e.g. a loading-state animation,
     an about-page flourish) rather than the everyday logo.

## 3. Color palette — **implemented** (2026-08-04)

Superseded the original eyeballed-from-the-logo table below it. Instead
of inventing values from the illustration, we adopted the palette from
[vates.standout.jp](https://vates.standout.jp/) directly (the user's
reference for "this site's palette is already perfect") — a real,
already-designed day/night system rather than a guess, and one that
happens to land on almost exactly the gold/sapphire/parchment language
this doc already wanted. Implemented as CSS custom properties in
`frontend/static/style.css`, with a manual light/dark toggle button
(`frontend/index.html` + `app.js`) layered on top of
`prefers-color-scheme`.

| Variable | Light (day) | Dark (night) | Role |
|---|---|---|---|
| `--bg` | `#f5f5f0` | `#0a0f1e` | Page background |
| `--ink` | `#1c2a4d` | `#f4e9d4` | Body text |
| `--accent` | `#1c2a4d` | `#e8a872` | Buttons, links, wordmark, interactive accents |
| `--accent-contrast` | `#f5f5f0` | `#1c2a4d` | Text/icons painted on top of an `--accent` fill |
| `--muted` | `#5c6a86` | `#d4ddeb` | Secondary text, hints, the tagline |
| `--border` | `#d8d4c8` | `#2a3654` | Card/input borders |
| `--danger` | `#cc3a3a` | `#cc3a3a` (unchanged) | Errors — deliberately does not shift with theme |

**Key design decision carried over from the reference site: day mode is
near-monochrome (ink + cream only), gold is a night-only accent.** We
deliberately did *not* invent a "light-mode gold" — the wordmark and all
interactive elements are plain deep indigo (`--accent`) by day, and only
become warm bonfire-gold at night. This matches vates's own restraint
(confirmed by reading their actual CSS: gold only appears inside their
`[data-mode="samhain"]` dark-mode rules, never in day mode) and reads as
more intentional than gold-everywhere would.

**Contrast fix baked into the model, not bolted on after:** `--accent`
itself flips from dark (indigo, day) to light (gold, night) — text drawn
on top of an `--accent`-filled button needs to flip the *other* way, or
white-on-gold at night is unreadable. Hence `--accent-contrast` as its
own variable rather than a hardcoded `#fff` on every filled button.

**What's now out of scope / not carried over from the original
eyeballed table:** the jewel tones (ruby/emerald/amethyst/pearl) and the
separate near-black "ink" outline color aren't part of the implemented
system — they were read off the (now-deleted) illustration, not the
vates reference, and weren't needed once the real palette landed. Revisit
only if a specific decorative use case comes up (e.g. an actual
illuminated-initial-style logo mark eventually gets designed).

## 4. Typography

- **Body copy / transcript text stays a clean, highly-legible sans**
  (the current `system-ui, sans-serif` is a reasonable baseline, or a
  well-hinted humanist sans like Inter/Source Sans if a webfont is worth
  the load cost later). This is a tool people read dense transcript text
  in for minutes at a stretch — legibility wins over theming here, no
  exceptions.
- **Reserve a serif with historical character** (something in the
  Garamond/Spectral/Cormorant family — elegant old-style serif, not
  blackletter/gothic) **for the wordmark, `<h1>`, and section headers
  only.** This is where "ancient" shows up without ever touching
  functional reading text. (Validated independently: the vates.standout.jp
  reference — see §3 — also runs on EB Garamond for exactly this role,
  confirming the direction rather than changing it.)
- **Implemented today**: a system serif stack (`Palatino, "Palatino
  Linotype", "Book Antiqua", Georgia, serif`) on the `h1`/`.tagline`
  lockup — not a webfont. Deliberate: the app ships zero external/CDN
  assets (see `PLAN.md`), and self-hosting an actual EB Garamond `.woff2`
  (as vates does) is a reasonable future upgrade, not done yet — would
  need adding a real font file under `frontend/static/`, not a Google
  Fonts/CDN link.
- **Never** render transcript preview text, form labels, or button text
  in a decorative/blackletter face — that belongs strictly to brand
  moments (logo, marketing headers), never to working UI.

## 5. Voice & tone

- Precise, unhurried, quietly confident — like a careful scribe, not a
  hype-driven SaaS landing page. Avoid exclamation points and growth-hack
  urgency language ("Don't miss out!", "Supercharge your...").
- Scriptorium vocabulary (*transcript, copy, manuscript*) is fair game in
  small, deliberate doses — the tagline is the model for this: one sharp
  literary touch lands harder than theming every button label. Don't
  force "ye olde" pastiche into everyday microcopy (error messages,
  button labels, form hints should stay plain and clear).
- **Privacy/on-device framing is core voice, not just marketing flavor**
  — this is the app's actual functional differentiator versus cloud STT
  SaaS tools. Keep leaning on concrete, verifiable language ("runs on
  your machine," "audio never leaves it") rather than vague trust
  claims.

## 6. Applying this to the current app — **partially done**

Implemented (2026-08-04): the palette in §3 is live in
`frontend/static/style.css` as CSS custom properties, applied across
every existing button/border/text usage (nothing hardcoded a color
literal that skipped the variable system — the one exception found and
fixed was a hardcoded `rgba()` tint of the *old* blue accent on the
dropzone hover state, now `color-mix(in srgb, var(--accent) 8%,
transparent)` so it always tracks whatever `--accent` currently is). A
manual toggle button (top-right, sun/moon icon, `#theme-toggle-btn`)
lets a user override `prefers-color-scheme` in either direction,
persisted in `localStorage` under the `theme` key — absence of a stored
value means "follow the OS," which is still respected by default.

Still true and still the operating principle: functional chrome
(buttons, dropdowns, the waveform, progress bars, form controls) stays
clean and modern — no illuminated-manuscript ornamentation (filigree,
gems, historiated initials) has been added anywhere in the live UI, only
the color system and the serif wordmark/tagline treatment from the
earlier pass. That's still a deliberate, open decision (§7.4), not
something this pass resolved by default.

## 7. Open decisions (revisit before further implementation)

1. Fish or no fish in the primary mark? (§2) — moot until an actual logo
   mark gets designed; not blocking anything today.
2. Which serif carries the "ancient" display typography, and whether to
   self-host a real webfont (EB Garamond, matching the vates reference)
   instead of the current system-font stack? (§4)
3. ~~Exact light/dark hex values for the palette~~ — resolved, see §3.
4. How far the color/typography system extends into actual UI chrome vs.
   staying a light restyle — so far it's been a faithful but restrained
   application (recolor + retype existing elements, no new ornamental
   elements added). Worth a real decision if/when illuminated-manuscript
   motifs (borders, historiated initials, filigree) are ever wanted
   beyond the wordmark.
