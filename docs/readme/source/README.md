# README figure sources

The animated header (`../hero.webp`) and Figure 3 (`../alpha-file.webp`) are three.js 0.187 scenes rendered frame by frame in headless Chrome and encoded as animated WebP.

- `hero.html`: three tool panels, cross-tool transfers and the `.alpha` container.
- `alpha-file.html`: exploded view of the `.alpha` ZIP layout (spec §12.2).
- `render.py`: calls `window.renderFrame(t)` for `t` in `[0, 1)` and writes the WebP.

To re-render, place these files in a folder with `three@0.187` installed (`npm i three`), a copy of `apps/web/src/theme/fonts/geist/geist-latin-wght-normal.woff2` and a 512 px `logo.png`, then run `python3 render.py hero.html hero.webp 72 70 hero.png 1200` (Playwright and Pillow required). The render script expects its working folder at `/home/claude/aboard-art`; change the `directory=` path in `render.py` for your machine.

Figures 1 and 2 (`architecture*.svg`, `write-path*.svg`) are static SVG files with CSS/SMIL animation, one variant per colour scheme. Colours come from `docs/DESIGN.md` §9.
