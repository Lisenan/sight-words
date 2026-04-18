# Sight Words

A sight words practice app for young readers. Built as a Progressive Web App (PWA) — installs to the home screen on iOS and Android, runs full-screen and offline after first load, no App Store required.

## Features

- **Practice Words** — four mini-games (Listen & Tap, Read It Out Loud, Flashcards, Spell It) with adaptive word selection that surfaces tricky words more often
- **Story Time** — a short story using all 50 sight words; tap any word to hear it spoken, sight words highlight and earn a star on first read
- **Spelling Test** — add this week's list, take the test with spoken prompts
- **Progress** — color-coded mastery view, session streak, total stars
- Stars/streaks persist across sessions via `localStorage`
- Haptic feedback on correct/wrong
- Semester 1 / 2 / All 50 toggle

---

## Local development

**Requirements:** Node 18+ and npm.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

To test the production build locally:

```bash
npm run build
npm run preview
```

---

## Deploying

Pick one. Vercel is the simplest path. GitHub Pages works with what you already have at `lisenan.github.io`.

### Option A — Vercel (simplest, recommended)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Vercel auto-detects Vite and does the rest. You get a URL like `sight-words.vercel.app`. Every `git push` redeploys.

### Option B — GitHub Pages

Two flavors depending on where you want it to live:

**B1. As its own repo at `username.github.io/sight-words`:**

1. Create a new repo on GitHub called `sight-words`.
2. Push this project to it.
3. Build with the base path set to the repo name:

   ```bash
   VITE_BASE=/sight-words/ npm run build
   ```

4. Publish `dist/` to the `gh-pages` branch (easiest with the `gh-pages` npm package):

   ```bash
   npm install --save-dev gh-pages
   npx gh-pages -d dist
   ```

5. In the repo's Settings → Pages, set Source to the `gh-pages` branch, `/ (root)` folder.

**B2. At the root of `username.github.io` (your current GitHub Pages site):**

Only do this if you want to replace whatever's currently there. Build with `VITE_BASE=/`, then push `dist/` contents to the root of the `username.github.io` repo.

### Option C — Any static host

`npm run build`, then upload the contents of `dist/` anywhere that serves static files (Netlify, Cloudflare Pages, S3+CloudFront, your own server). Make sure the host serves `/manifest.webmanifest` and the service worker file with the correct MIME types — all three named hosts above handle this automatically.

---

## Installing to the home screen

Once the app is live at a URL:

**iPhone / iPad:**
1. Open the URL in Safari (must be Safari, not Chrome, for iOS install).
2. Tap the Share button.
3. Scroll down and tap "Add to Home Screen".
4. The app now appears with its own icon, launches full-screen, and works offline.

**Android:**
1. Open in Chrome.
2. Chrome usually prompts "Add to Home Screen" automatically.
3. If not: menu → "Install app" or "Add to Home Screen".

---

## Project structure

```
sight-words-app/
├── index.html                 # Vite entry + meta tags
├── package.json
├── vite.config.js             # PWA config, service worker, manifest
├── public/
│   ├── icon-192.png           # Home screen icon (Android)
│   ├── icon-512.png           # Splash / large icon
│   ├── icon-maskable-512.png  # Android adaptive icon
│   ├── apple-touch-icon.png   # iOS home screen icon
│   └── favicon.ico            # Browser tab icon
└── src/
    ├── main.jsx               # React entry
    ├── App.jsx                # All app code (games, story, progress)
    └── index.css              # Global reset, safe-area padding
```

All app logic lives in one file (`src/App.jsx`) to keep it easy to modify.

---

## Customizing

### Change the word lists

Top of `src/App.jsx`:

```js
const SEMESTER_1 = [ "a", "I", "can", ... ];
const SEMESTER_2 = [ "big", "come", "down", ... ];
```

Edit these arrays. Also update `SENTENCES` if you want example sentences for new words (falls back to `"I can say <word>."` otherwise).

### Change the story

In `src/App.jsx`, find `STORY_TITLE` and `STORY_PARAGRAPHS`. Each string is one paragraph. Words matching `SIGHT_WORD_SET` will be highlighted automatically.

### Change colors / theme

Search for hex codes in `App.jsx`. The main theme color (`#FF8A65` coral) also appears in `vite.config.js` and `index.html` — update all three if you change it.

### Re-generate icons

The icons in `public/` are pre-built. To regenerate with a different design, modify `make_icons.py` (not shipped here — was used during scaffold) or edit them in any image editor. Required sizes: 192, 512, 512 (maskable), 180 (apple-touch).

---

## Optional: add photo-scan back for spelling words

The original version of this app had a "photograph the teacher's spelling list" feature using the Claude API. It was removed from the PWA version because shipping an API key in static files isn't safe. Two ways to add it back:

**1. Client-side OCR with Tesseract.js** (free, works offline after initial load):

```bash
npm install tesseract.js
```

Then in the spelling add-words screen, read the file, pass through `Tesseract.recognize(file, 'eng')`, and stuff the result into the `newWords` textarea. Accuracy is decent on printed lists, iffy on handwriting.

**2. Serverless proxy to Claude API** (more accurate, requires backend):

Stand up a tiny Vercel/Cloudflare function that takes a base64 image, calls Claude with your API key server-side, and returns the extracted words. Front-end hits your function instead of api.anthropic.com directly. Keeps the key secret and works with your existing Vooma/KG infrastructure if you want.

---

## Tech notes

- **Speech**: uses the browser's built-in `SpeechSynthesis`. Voice quality varies by device — iOS has the best (Samantha/Karen); Android uses Google TTS.
- **Storage**: `localStorage` under key `sightwords-v2`. To reset, clear site data in browser settings or use the Reset button on the Progress screen.
- **Offline**: after first load, the service worker caches everything. Works on airplanes.
- **No tracking, no accounts, no network calls** after install. Fully self-contained.
