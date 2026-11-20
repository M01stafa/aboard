"""Render a three.js page frame by frame (window.renderFrame(t) -> PNG data URL) and build an animated WebP.

usage: python3 render.py <page.html> <out.webp> <frames> <frame_ms> [still.png] [out_w]
"""
import asyncio, base64, io, sys, http.server, threading, functools
from PIL import Image
from playwright.async_api import async_playwright

page_name, out_path, frames, frame_ms = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
still = sys.argv[5] if len(sys.argv) > 5 else None
out_w = int(sys.argv[6]) if len(sys.argv) > 6 else 1280

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="/home/claude/aboard-art")
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                    args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1400, "height": 900})
        pg.on("console", lambda m: print("console:", m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: print("pageerror:", e))
        await pg.goto(f"http://127.0.0.1:8765/{page_name}")
        await pg.wait_for_function("window.ready === true", timeout=60000)
        imgs = []
        for i in range(frames):

            url = await pg.evaluate(f"window.renderFrame({i / frames})")
            im = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")
            im = im.resize((out_w, round(im.height * out_w / im.width)), Image.LANCZOS)
            imgs.append(im)
        await b.close()
    if still:
        imgs[0].save(still, optimize=True)
    imgs[0].save(out_path, save_all=True, append_images=imgs[1:], duration=frame_ms, loop=0, quality=78, method=5)
    print(out_path, len(imgs), "frames")


asyncio.run(main())
srv.shutdown()
