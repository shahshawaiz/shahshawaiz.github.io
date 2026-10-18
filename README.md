# shawaiz.de: portfolio and side projects

Source of **[shawaiz.de](https://shawaiz.de)**, the bilingual (German/English) portfolio of Shawaiz Shah, Senior Data Scientist and AI/ML engineer in Berlin. It also hosts the side-project hub, where every live demo runs **AI on your own device**: no cloud LLMs, no API keys, and nothing gets uploaded.

## Who it's for

- **Recruiters and clients** who want an overview of my experience, projects and contact details.
- **Anyone who wants to try the demos**, such as the FSP exam trainer for doctors preparing for the German medical language exam, or the CV, image and DeFi tools.

## Built with

- Static HTML, CSS and vanilla JavaScript. There is no build step and no framework. The site is hosted on GitHub Pages with a custom domain (`CNAME`).
- On-device AI in the demos:
  - [Chrome built-in AI / Prompt API](https://developer.chrome.com/docs/ai/built-in) (Gemini Nano)
  - [WebLLM](https://github.com/mlc-ai/web-llm) on WebGPU (open-weight models such as Qwen 2.5 and Llama 3)
  - [transformers.js](https://github.com/huggingface/transformers.js) (Whisper speech-to-text and other models)
  - [Piper](https://github.com/rhasspy/piper) neural text-to-speech

## Structure

```
index.html               Main portfolio (DE/EN via a `translations` object)
projects/index.html      Side-projects page (cards + detail dialogs, DE/EN)
fsp/index.html           FSP Simulator Berlin: medical-language exam trainer (single file)
static/                  Images (portrait, project thumbnails)
static/js/ondevice-llm.js  Shared on-device LLM helper (window.OnDeviceLLM: Chrome AI / WebLLM)
avatar/index.html        On-device realtime voice avatar (Whisper → local LLM → Kokoro/Piper)
demos/                   Copies of the project demos (synced from each repo's docs/)
scripts/sync-demos.sh    Refreshes demos/ from the sibling repos
sitemap.xml, CNAME, LICENSE
```

## Project demos

The FSP simulator lives only in this repo. Each of the other demos is developed in its own repository's `docs/` folder, and a copy is kept here under `demos/` so it works on shawaiz.de without extra setup:

| Project | Demo on this site | Source |
|---|---|---|
| FSP Simulator Berlin | https://shawaiz.de/fsp/ | this repo |
| Talk to Shawaiz (voice avatar) | https://shawaiz.de/avatar/ | this repo |
| Resume AI | https://shawaiz.de/demos/resume-ai/ | [shahshawaiz/resume-ai](https://github.com/shahshawaiz/resume-ai) `docs/` |
| Spardose Analytics | https://shawaiz.de/demos/spardose/ | [shahshawaiz/spardose-analysis](https://github.com/shahshawaiz/spardose-analysis) `docs/` |
| PixelMorph | https://shawaiz.de/demos/pixelmorph/ | [shahshawaiz/pixelmorph](https://github.com/shahshawaiz/pixelmorph) `docs/` |

To refresh the copies after changing a demo in its own repo (with the repos checked out side by side):

```bash
scripts/sync-demos.sh
```

If GitHub Pages is also enabled on a project repo, its demo is additionally served at `https://shawaiz.de/<repo-name>/`, so don't create top-level folders here with those repo names.

## Run locally

```bash
python3 -m http.server 8080   # from the repo root
```

Then open http://localhost:8080. Most pages also work when opened directly via `file://`. The on-device models need a local server and a recent Chrome or Edge with WebGPU, so use the server for the FSP simulator.

## Privacy

- There are no API keys, no cloud LLM providers and no backend in this repo. Demo inputs (audio, text, files) are processed in the browser.
- Model weights are downloaded from public CDNs and Hugging Face on first use, then cached by the browser.
- The main page and the projects page use **Google Analytics** (gtag) for basic visitor statistics, and they load Google Fonts.
- The "speak to my avatar" button opens `avatar/`: a realtime voice conversation where speech recognition (Whisper), the language model (Gemini Nano or WebLLM) and the voice (Kokoro on GPU for English, Piper/Thorsten for German) all run in the browser. No audio leaves the device.

## License

[MIT](LICENSE) © Shawaiz Shah
