# Tavlin - on-device handwriting test (htr-test)

Separate phone test page for Hebrew handwriting recognition. It runs fully in the browser (ONNX Runtime Web + opencv.js). No image leaves the device. It is not part of the main Tavlin app and is deployed as its own Worker (`tavlin-htr-test`).

Live test URL (unlisted, noindex): https://tavlin-htr-test.p0583212053.workers.dev

## Model license
Handwriting model: Mishkefet-v1 by itayinbar - https://huggingface.co/itayinbar/Mishkefet-v1
License: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/). Non-commercial use only. See LICENSE-MODEL.txt.
Changes: exported to ONNX, static QDQ int8 quantization (calib.py / sq.py), char LM pruned and re-encoded as a binary table (buildlm.py).

## Files
- index.html, app.js - test page (device info, 3 sample pages, timings, CER, WebGPU probe, own-photo draft)
- mk.js - line preprocessing; mkbeam.js - CTC beam search + char LM; seg.js - page line segmentation (MKSEG_FAST mode)
- _headers - COOP/COEP (WASM threads) and noindex
- wrangler.toml - separate Worker config, assets from ./dist
- devtest.js - puppeteer runner that clicks the test button and prints results

## Build dist/ (large binaries are not stored in git)
1. model-qdq-all.onnx (built from Mishkefet-v1 with calib.py/sq.py), split: `split -b 18000000 -d -a 2 model-qdq-all.onnx dist/model.part`
2. lm-mc10.bin from buildlm.py
3. opencv.js (4.x) and onnxruntime-web: ort.all.min.js, ort-wasm-simd-threaded.jsep.mjs/.wasm in dist/ort/
4. testpages.json - 3 sample pages from the HTR evaluation set (not redistributed here)
5. Copy the files above into dist/ and run `npx wrangler deploy --config wrangler.toml`
All files must stay under the 25 MiB Cloudflare per-file limit.
