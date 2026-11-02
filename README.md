# SAM WANTS YOUR RAM  (RAM RUN)

A satirical, shareable 3D lane-runner. **Sam Altman** (an affectionate-but-pointed cartoon caricature, riding *The Utilizer*, a giant server-vacuum mech) wants the RAM in your computer for "maximum utilization in the cloud". You are **KILO**, a scrappy little bot running off with as much RAM as you can carry. Score = **GB of RAM saved**.

> Parody. Not affiliated with or endorsed by Sam Altman or OpenAI. Quotes as reported by Tom's Hardware from the Cheeky Pint podcast (Oct 29, 2026). The only quoted sentences attributed to him are the three verbatim ones in `src/jokes.ts` (`QUOTES`); every other line is an invented cartoon speech bubble about RAM. Everything is procedural (models, textures, music, SFX): no downloaded assets, no photos, no voice imitation, no logos.

Press RUN and you are playing in about a second (endless mode, zones cycle as you go). **Escape** mode is the 5-stage story. At game over you get a 1200x630 share card, Share / Post on X / Copy link / Challenge a friend buttons, a nickname + today's global leaderboard, and a global "Humanity has saved X TB of RAM from Sam" counter (all hidden if the API is unreachable). Challenge links look like `?beat=48&from=akshat`.

## How to play

* You have exactly **3 lives**, shown as three RAM-stick icons in the HUD and as the stack on Kilo's back. Each hit empties one (with a strong flash); the **3rd hit means Sam catches you** and the run ends. There are **no refills**: collecting RAM only adds to your score, and no shop upgrade, mission reward, skin or power-up changes the number of lives. The ECC Shield power-up (and the optional starting-shield upgrade) blocks one hit while active; it is not a life.
* **Escape mode** – 5 stages (Cold Aisle → Hot Aisle → GPU Hall → Cooling Towers → Rooftop Exit). Reach the checkpoint door at the end of each stage; losing a life restarts the current stage. Finish stage 5 to jump off the roof with a RAM parachute. This unlocks **Endless mode**.
* **Missions** – 3 active goals; completing them raises your permanent score multiplier.
* **Shop** – spend RAM on longer power-ups, a starting ECC Shield, a head start and Kilo skins (Retro Beige PC, RGB Gamer, Raspberry).

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | ← → / A D | swipe left / right |
| Jump | ↑ / W / Space | swipe up |
| Slide | ↓ / S | swipe down |
| Pause | P / Esc | pause button |

### Obstacles
Server racks (switch lane) · cable bundles (jump) · overhead cable trays and laser rate limiters (slide) · rolling carts · sliding blast doors · sweeping security drones · Letters of Intent (non-binding, they dissolve as you approach) · ramps up onto rack tops for a high route.

### Power-ups
**DDR** 2× score · **DMA Magnet** pulls in RAM from every lane · **ECC Shield** absorbs one hit · **Liquid Cooling Slide** rides a pipe rail above the lanes · **Overclock** invincible speed burst that smashes obstacles.

## Build and run

```bash
npm install
npm run dev          # dev server on http://127.0.0.1:5173
npm run build        # type-checks, then writes ONE self-contained dist/index.html
```

`dist/index.html` works opened straight from disk (`file://`) or served statically.

URL parameters (debug / test hooks): `?stage=N` (start Escape at stage N), `?god=1` (invincible), `?skipcutscenes=1`, `?quality=low|medium|high`, `?seed=N`, `?endless=1`, `?fps=1`, `?manual=1` (the test harness drives frames via `window.__game.advance(seconds)`). `window.__game` exposes the game object for tests.

## Server (static site + API)

```bash
~/.bun/bin/bun server/index.ts          # PORT=8088 by default, binds 127.0.0.1 only
PORT=8099 DB=/tmp/test.sqlite ~/.bun/bin/bun server/index.ts && PORT=8099 scripts/api-test.sh
```
Bun + `bun:sqlite`, no other deps. `/` serves `dist/index.html` (with `%ORIGIN%` in the Open Graph tags rewritten from `X-Forwarded-Host` / `Host`), `/og.png` the share card (`public/og.png`, regenerate with `scripts/make-og.mjs` after a build), and:
`POST /api/score {nickname?, gb, duration}` (16-char profanity-filtered nickname, plausibility check on GB per second of play, per-IP rate limit via `CF-Connecting-IP`, 2 KB body cap, parameterized SQL), `GET /api/stats`, `GET /api/leaderboard` (today's top 50). The API logic lives in `server/core.ts` behind a `Storage` interface (SQLite adapter in `server/sqlite.ts`) so it can be ported to a Cloudflare Worker + D1. The game works fully without the server (file:// or API down).

## Performance and safety (read this before changing graphics)

A browser game must never be able to take a machine down, so the renderer is budgeted by design:

* **Every session starts at Low** (desktop included). Medium is reached only after ~8 s of steady 60 fps *during a run*, and **High is manual-only** (Settings or the GRAPHICS chip on the title). Falling below ~40 fps on Medium drops back to Low and locks the ramp.
* **Pixel budget** regardless of DPR / window size / external 5K display: Low ≈ 1.0 MP, Medium ≈ 1.6 MP, High ≈ 2.4 MP backbuffer.
* **Frame cap**: ≤ 60 fps in play (skips rAF callbacks on 120 Hz ProMotion screens), 30 fps for title / pause / cutscenes / game over; the animated Sam canvases are ≤ 30 fps at DPR ≤ 1.5.
* **Dynamic resolution** has hysteresis: at most one change per 3 s, no upscale for 20 s after a downscale, render targets are never reallocated on a timer.
* **Low** = no shadows, no mirror floor, 4 chunks, 3 bloom levels, no SMAA. **Medium** = PCF shadows 1024, SMAA, 5 bloom levels, no mirror floor. **High** = mirror floor (second draw of walls/obstacles), PCFSoft 2048, 7 bloom levels.
* `webglcontextlost` stops rendering; on restore the game drops to Low and shows "Graphics reset: continuing in Low quality".

Measured with `scripts/smoke.mjs` / `scripts/soak.mjs` at a MacBook-like viewport (1728x1117 @2x, SwiftShader, bot run in stage 3):

| preset | backbuffer | draw calls | triangles | programs | textures | geometries |
| --- | --- | --- | --- | --- | --- | --- |
| low | 1243x803 (1.0 MP) | ~145-155 | ~155k | 41 | ~50 | ~125 |
| medium | 1573x1016 (1.6 MP) | ~235-265 | ~265k | 53 | ~60 | ~150 |
| high | 1926x1245 (2.4 MP) | ~290-315 | ~285k | 53 | ~65 | ~150 |

3-minute soak per preset (`node scripts/soak.mjs <preset> 180`, GPU-process RSS under SwiftShader): low 323 -> 387 MB, medium 434 -> 489 MB, high 514 -> 587 MB. The small climb is first-use uploads (each new obstacle type / zone material uploads once; geometries and textures plateau) and flattens out; programs stay at 41-54, renderer RSS and JS heap are flat. Quality cycling and world rebuilds dispose their buffers (the smoke test fails if they leak).

> Tip for test scripts: never wrap the test scripts in `timeout` (it can kill the wrapper and leave the browser running); use script-internal timeouts. Under SwiftShader the first render of a new scene can take minutes of shader compilation, which is not an issue on real GPUs.

## Performance diagnostics and robustness
* **`?perf=1`** shows an overlay: fps, a frame-time graph, quality / resolution scale / backbuffer size, draw calls, and a **hitch log** (time, ms, step/render ms, shader-program / texture / geometry deltas, state, distance, zone). **Copy report** puts a JSON report on the clipboard (ask players to send it).
* **Frame cap**: every state where anything moves (title attract, cutscenes, game over, countdown, run) runs at up to 60 fps (12 ms threshold, so 120 Hz displays stay at 60); only the static `paused` scene may drop to 30. Sam Cam and title portrait canvases redraw at up to 60 fps too. The flow test asserts this with synthetic rAF ticks.
* **Honest hitch log**: a hitch is any interval above 1.5x the state's target interval (a single dropped 60 Hz vsync is recorded). The copied report adds `perState` frame counts / p50 / p95 / dropped, with `GROUP_play(countdown+run)` separate from `GROUP_menus(...)`. A WebGL context loss note records visibility, seconds since the tab became visible, ms since the last frame, `statusMessage`, JS heap and state. The game itself does nothing on tab return that touches GPU resources (the visibility handler only pauses and sets warm-up windows), so the loss is the browser/GPU reclaiming the context; the veil + warm-up recovery stays.
* **Boot settle**: after shader warm-up the boot screen keeps running real title frames until 8 consecutive steady ones (first-frame work: portrait draws, DOM, uploads) before it fades, so the title appears without a hitch.
* **Adaptive resolution** judges the measured frame interval relative to the 60 fps cap (not raw "under 14 ms"), plus CPU frame cost and long-frame counts. Warm-up windows (first 5 s, after a world rebuild, after a zone change, after returning to the tab, at run start) are ignored. Resolution recovers to 1.0 once frames are healthy; the Low -> Medium ramp fires after ~8 s of healthy frames and only ever applies **between runs** (immediately on the title, otherwise at the next run start). Quality / world rebuilds never happen mid-run.
* **Warm-up**: behind the title/loading screen every pooled obstacle, collectible, FX and zone material is forced into view and `renderer.compileAsync` + one render uploads every shader, geometry and texture, so nothing compiles during play. A warm-up also runs after each between-run quality change.
* **Watchdogs**: countdown/intro > 5 s forces GO; a run whose distance does not advance for 3 s is logged (see `?perf=1` notes) and recovered; a frame that throws never freezes the loop.
* **`scripts/flow.mjs`** drives every state transition with real clicks and key presses (title, intro, pause/resume/restart/quit, hidden tab during intro and run, the 3-lives rule, game over -> retry/menu, failed leaderboard submit, menus and BACK buttons, Escape stage clear -> cutscene -> next stage, finale, challenge link, no-audio) and asserts the game reaches `run` and distance increases each time. Run it with `node scripts/flow.mjs`.

### Shader warm-up guarantee (`scripts/programs.mjs`)
Cold first-use shader compiles were the source of the multi-hundred-ms freezes on Mac (three.js `onFirstUse` blocks until a program links). So:
* Warm-up forces every pooled/hidden object into view (obstacle kinds, collectibles, gold kit, power-up coins, Letters of Intent, FX, rain, sticks, Sam and the Utilizer in every expression/catch state, all four Kilo skins and animation states, the finale city + parachute) and awaits `renderer.compileAsync` (KHR_parallel_shader_compile, so the title stays responsive). The RUN button shows "Warming up the GPU…" meanwhile; pressing RUN early just waits for it.
* `renderer.debug.checkShaderErrors` is off in production builds (on in dev, and in tests via `?checkshaders=1`), so a draw never synchronously waits for a link.
* Quality changes only happen between runs behind a brief "Switching graphics…" veil, after the new preset's variants are compiled.
* The programs test plays the bot through all 5 zones with all 5 power-ups, all skins, all Sam expressions and the finale, and **fails if `renderer.info.programs.length` ever grows**. `--strict-render` also fails if any `render()` call exceeds 50 ms (only meaningful on a real GPU; SwiftShader renders synchronously).

| preset | programs at start (cold, no warm-up) | compiled during play without warm-up | programs after warm-up | compiled during play with warm-up |
|---|---|---|---|---|
| low | 4 | +45 | 90 | **+0** |
| medium | 4 | +56 | 97 | **+0** |
| high | - | - | 97 | **+0** |

(Blast-door and checkpoint-gate panels no longer cast shadows: that removed a rarely used shadow-depth shader variant.)

### Loading screens (you are never stuck)
* `index.html` contains an **inline boot screen** (logo, CSS-only spinner and bar animated with transform/opacity so they keep moving if the main thread hiccups, rotating satirical tips) that is visible before the JS bundle parses. `Game.init()` is async and reports real progress per step: save, graphics, textures, world, Kilo/Sam, portraits/UI, shader compile (`programs ready/total` from `renderer.info`), warm-up frames. It fades out only when warm-up is done, so RUN cannot be pressed early.
* The same overlay is a lighter **veil** for quality switches, the Escape stage transition into a new zone, WebGL context loss/restore and "getting ready" waits. It is shown synchronously (within 100 ms), painted before heavy work starts, and work is split into chunks that yield so the bar advances. Input is ignored while it is up (it covers the UI).
* Failure handling: no progress for 15 s shows "Still working... your GPU is compiling shaders" with **Continue in Low quality** and **Reload**; `window.onerror` / `unhandledrejection` during any loading state show an error panel with **Reload** and **Copy error details**. `?failload=1` is a test hook that throws during load.
* `scripts/loading.mjs` screenshots the boot screen, a quality switch, a stage transition and the error panel, and asserts: overlay up within 100 ms of each action, progress strictly advances, it hides when ready, the forced failure shows a working Reload, and the 15 s panel appears.

### Freeze root cause (round 4) and the research checklist
**Root cause:** the Sam Cam (and title bust) painted Sam's face every frame into a normal **GPU-accelerated 2D canvas** (Skia GPU raster). Under the capped SwiftShader reproduction, within ~4 s of pressing RUN the GPU process stopped delivering frames (rAF stopped while the main thread stayed alive and music kept playing), and on a real Mac Chrome's GPU watchdog eventually dropped the WebGL context. Bisect (`scripts/freeze.mjs --flags ...`, dbg switches): no WebGL render -> still froze; no render of the cam -> fine; cam drawing a plain rect -> fine; any expression, any redraw rate (2 fps too) -> froze; **the same drawing on a CPU-backed canvas (`willReadFrequently: true`) -> never froze**. All portrait / face / ticker canvases are now CPU-backed; the GPU only ever sees a small texture upload. `scripts/freeze.mjs` (3 fresh pages x 30 s of real-time play from title -> RUN, fails if frame delivery stops for >1 s) is green; before the fix it failed every time.

**Always-on safety net:** a heartbeat detects "page visible but no rAF for >1 s while the main thread is alive": audio is hard-suspended, the quality is locked to Low for the session and the auto ramp is disabled (recorded in the save as `gpuTrouble`), a report with the last 80 game events is saved to localStorage (`ramrun.freeze.v1`, "Copy last freeze report" in the `?perf=1` overlay), and when frames return the game shows the pause screen with RESUME and a "the graphics froze, sorry" line (no life is lost). A late heartbeat (main thread blocked) is logged differently. Context loss follows the same path (veil, Low, report).

| # | lead | what we checked | changed |
|---|---|---|---|
| 1 | ANGLE-Metal index-buffer updates | no `setIndex` / `index.needsUpdate` / geometry creation during play: chunk layers, pooled drones/carts/doors/fans/letters/signs, particles and collectibles are all fixed `InstancedMesh`es built at load; `world.destroy` only hides objects / zeroes a matrix; geometries are created/disposed only on world rebuild (between runs) | nothing needed |
| 2 | bufferSubData / buffer resizing | per-frame instance updates uploaded the whole capacity | particles, sticks, rain and collectibles now use `addUpdateRange` for just the live instances; buffers are never resized mid-run |
| 3 | big texture re-uploads | only the price-ticker (1024x256, was every 0.9 s) and the Kilo eye texture (256x128, on mode change) update during play; face textures are pre-made | ticker now every 1.6 s on a CPU canvas; everything is `initTexture`d by the warm-up |
| 4 | one giant GPU workload / watchdog | pixel budget per preset, no runaway instance counts (counts are capped), no big drawImage/texImage; the actual hang was #root cause above | portraits moved to CPU canvases |
| 5 | backdrop-filter over the canvas | no `backdrop-filter` anywhere; one `filter` animation existed on the full-screen threat vignette during play | replaced by a transform-only pulse |
| 6 | runner budgets | low ~150 draw calls, medium ~250, 3 lights, bloom 3/5/7 levels at 0.35/0.5/0.7 res, no MSAA with post, no per-frame allocations (checked) | not changed (presets are out of scope this round). Note: medium still uses a PCF shadow map where the checklist suggests a blob shadow |
| 7 | chrome://gpucrash | recovery path covered by `scripts/loading.mjs`: `WEBGL_lose_context` loseContext/restoreContext in a real-time page -> veil, Low quality, report saved, veil hides; plus the rAF-stall freeze simulation | new tests |

## Smoke test

```bash
npm run build
npx playwright install chromium   # first time (add --with-deps if you have sudo)
npm run smoke                      # = node scripts/smoke.mjs (run only ONE headless browser at a time; SwiftShader can use several GB)
```

Runs headless Chromium with software WebGL (SwiftShader), screenshots the title, stage select, all 5 zones, each power-up, a phone-size viewport (with swipe tests), shop, missions, the catch / game-over screen, the stage transition and the finale and credits into `shots/`, drives all 5 stages to completion through the test hooks, plays a real cutscene, checks for memory leaks (renderer.info.memory, JS heap and DOM node counts while playing and while cycling quality presets), and fails on any console error or uncaught exception.

## Tech

Vite + strict TypeScript, three.js 0.170 (ACES filmic tone mapping, PMREM environment, PBR materials, PCF soft shadows, instanced chunked track with pooling, mirrored-geometry floor reflections) and pmndrs `postprocessing` (bloom, SMAA, vignette, tone mapping, a custom speed-line / chromatic-aberration / heat-shimmer pass). Audio is a procedural WebAudio sequencer plus synthesized SFX. Low / Medium / High quality presets are auto-picked and adapt render resolution at runtime.

## Hosting on Cloudflare

Live at **https://sameatsram.akshatsethi.com**, served by a Cloudflare Worker (`worker/index.ts`, config in `wrangler.jsonc`):

* **Static assets:** `dist/` (the single-file game plus `og.png`). The Worker serves `/` itself so it can fill in `%ORIGIN%` in the share-card meta tags.
* **Score API:** `/api/stats`, `/api/leaderboard` and `/api/score` reuse `server/core.ts` on **D1** (`migrations/`).
* **Rate limit:** score submits are limited to 1 per 8 s and 40 per hour per client. This uses a salted IP hash kept for 1 hour; the salt is the `IP_SALT` secret.

```bash
npm run deploy                                                  # build + wrangler deploy
npx wrangler d1 migrations apply sam-wants-your-ram --remote    # after adding a migration
```

The Bun server (`server/index.ts`) still works for self-hosting.
