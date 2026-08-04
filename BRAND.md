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

## 2. Logo reference (`casiodorus-logo.jpg`)

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

## 3. Color palette (eyeballed from the reference — validate before locking in)

| Role | Approx. hex | Where it comes from in the image |
|---|---|---|
| Parchment / vellum | `#EFE3C4` | Background |
| Illuminated gold — core | `#C9992E` | The fish's base scale color |
| Illuminated gold — highlight | `#E8C158` | Fin/highlight areas |
| Illuminated gold — shadow | `#8A661E` | Scale shading, filigree shadow |
| Manuscript sapphire | `#1B3A6B` | The letterform's blue body |
| Ink / near-black | `#2A1F14` | Line work, outlines |
| Jewel ruby (decorative only) | `#A6273D` | Border gem accents |
| Jewel emerald (decorative only) | `#2F6B3D` | Border leaf/gem accents |
| Jewel amethyst (decorative only) | `#5B3B7A` | Border gem accents |
| Pearl | `#F5EEDD` | Crown pearls |

**Application guidance:**

- **Gold and sapphire are the two working brand colors** — gold as
  primary (replacing the current flat `--accent: #3a5ccc` blue),
  sapphire as a secondary accent (e.g. could drive part of the
  speaker-overlay palette, or link/secondary-button color).
- **The jewel tones (ruby/emerald/amethyst/pearl) are decorative
  accents, not functional UI colors** — keep them out of buttons, form
  controls, and status colors. Don't let ruby collide with the app's
  existing functional `--danger` red (errors) — those need to stay
  visually distinct so a decorative flourish is never mistaken for an
  error state.
- **Contrast/accessibility flag:** gold-on-parchment (or gold-on-dark)
  text can fail WCAG contrast at normal text sizes. Use gold for
  accents, icons, borders, and large display type (the wordmark, h1) —
  not for body copy or small UI labels. Ink/near-black (light mode) or
  a warm off-white (dark mode) should still carry actual reading text.
- **Dark mode:** don't force literal parchment cream into a dark
  surface — it doesn't work as a dark background. Use a warm near-black
  "ink" surface (not a generic flat gray) so dark mode reads as the same
  material family (ink on vellum, inverted) rather than a bolted-on
  scheme. Gold and sapphire should both hold up against that ink surface
  without adjustment.

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
  functional reading text.
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

## 6. Applying this to the current app (not yet done)

The app today is a clean, functional, dark-mode-aware UI with flat CSS
custom properties (`--accent`, `--border`, `--muted`, `--danger` in
`frontend/static/style.css`). Recommended shape for the actual
implementation pass, once the open questions above are resolved:

- Keep functional chrome (buttons, dropdowns, the waveform, progress
  bars, form controls) clean and modern — illuminated-manuscript
  ornamentation belongs at the *frame* (header/wordmark, favicon, maybe
  a restrained corner flourish), not smeared across every control. A
  fully "illuminated" UI would hurt usability for a tool people use to
  get work done.
- Swap `--accent` from the current flat blue to the illuminated gold;
  add an `--accent-secondary` (sapphire) custom property for secondary
  emphasis.
- Define explicit light **and** dark values for every brand color before
  writing them into CSS — several of the hex values above were read off
  a light-parchment image and need a real dark-mode counterpart, not a
  blind reuse.
- Decide, and document here once decided: how much (if any) of the gold
  filigree/border language shows up anywhere in the live app versus
  staying confined to the logo and marketing surfaces only.

## 7. Open decisions (revisit before implementation)

1. Fish or no fish in the primary mark? (§2)
2. Which serif carries the "ancient" display typography? (§4)
3. Exact light/dark hex values for gold + sapphire as CSS custom
   properties — the table in §3 is a reading of the reference image, not
   color-picked/finalized values.
4. How far the illuminated-manuscript styling extends into the actual UI
   chrome vs. staying a "brand frame" around a clean functional app.
