// On-device LLM for the side-project demos on shawaiz.de.
// Providers: Chrome built-in AI (Gemini Nano) or WebLLM (open-weight models on WebGPU).
// There is deliberately no cloud / paid provider and no API key anywhere.
// Classic script (not a module) so it also works when the demos are opened from disk.
// Models are cached by the browser per origin, so a model loaded in one demo is reused by the others.

(() => {
"use strict";
const KEY = "odl-settings";
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.81";
const MODELS = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 1.5B · fastest" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 3B · balanced (recommended)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 · 3B" },
  { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 7B · best quality, needs ~6 GB GPU" },
];
const DEFAULT_MODEL = MODELS[1].id;

const hasChromeAI = () => typeof self.LanguageModel !== "undefined";
const hasWebGPU = () => !!navigator.gpu;
const chromeOpts = (lang = "en") => ({
  expectedInputs: [{ type: "text", languages: ["en", lang].filter((v, i, a) => a.indexOf(v) === i) }],
  expectedOutputs: [{ type: "text", languages: [lang] }],
});

let S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const state = { provider: null, status: "checking", message: "Checking on-device AI…", progress: 0, chrome: "unknown", model: "" };
const subs = new Set();
const emit = () => subs.forEach(fn => { try { fn(state); } catch {} });
const set = patch => { Object.assign(state, patch); emit(); };

let webllm = null, engine = null, initP = null;

async function init() {
  if (initP) return initP;
  initP = (async () => {
    if (hasChromeAI()) {
      // availability() can hang (e.g. headless or policy-disabled Chrome), so don't wait forever.
      const timeout = new Promise(res => setTimeout(() => res("unavailable"), 4000));
      try { state.chrome = await Promise.race([LanguageModel.availability(chromeOpts()), timeout]); } catch { state.chrome = "unavailable"; }
    } else state.chrome = "unavailable";
    let pick = S.provider;
    if (pick === "chrome" && state.chrome === "unavailable") pick = null;
    if (pick === "webllm" && !hasWebGPU()) pick = null;
    if (!pick) pick = state.chrome === "available" ? "chrome" : hasWebGPU() ? "webllm" : state.chrome !== "unavailable" ? "chrome" : null;
    await choose(pick, { auto: true });
  })();
  return initP;
}

async function choose(provider, { auto = false } = {}) {
  state.provider = provider;
  if (!auto) { S.provider = provider; persist(); }
  if (provider === "chrome") {
    if (state.chrome === "available") return set({ status: "ready", message: "Gemini Nano (Chrome) · on-device" });
    return set({ status: "setup", message: "Chrome's built-in model must be downloaded once." });
  }
  if (provider === "webllm") {
    if (engine) return set({ status: "ready" });
    if (S.webllmLoaded && S.model) return loadModel(S.model);
    return set({ status: "setup", message: "Pick an open-weight model to download (cached afterwards)." });
  }
  set({ status: "unavailable", message: "This browser has no on-device AI. Use Chrome or Edge on a desktop/laptop (WebGPU)." });
}

async function downloadChrome() {
  set({ status: "loading", message: "Downloading Gemini Nano…", progress: 0 });
  try {
    const s = await LanguageModel.create({ ...chromeOpts(), monitor(m) { m.addEventListener("downloadprogress", e => set({ progress: e.loaded, message: `Downloading Gemini Nano ${Math.round(e.loaded * 100)} %` })); } });
    s.destroy();
    state.chrome = "available";
    S.provider = "chrome"; persist();
    set({ status: "ready", message: "Gemini Nano (Chrome) · on-device", progress: 1 });
  } catch (e) { set({ status: "error", message: "Chrome AI download failed: " + (e && e.message || e) }); }
}

async function loadModel(id) {
  if (!hasWebGPU()) return set({ status: "unavailable", message: "WebGPU is not available in this browser." });
  set({ status: "loading", message: "Loading model…", progress: 0 });
  try {
    webllm = webllm || await import(WEBLLM_URL);
    if (engine) { try { await engine.unload(); } catch {} engine = null; }
    engine = await webllm.CreateMLCEngine(id, {
      initProgressCallback: p => set({ progress: p.progress || 0, message: `Loading ${shortName(id)} · ${Math.round((p.progress || 0) * 100)} %` }),
    });
    S.provider = "webllm"; S.model = id; S.webllmLoaded = true; persist();
    set({ status: "ready", model: id, progress: 1, message: shortName(id) + " · on-device (WebGPU)" });
  } catch (e) {
    engine = null; S.webllmLoaded = false; persist();
    set({ status: "error", message: "Model failed to load: " + (e && e.message || e) });
  }
}

const shortName = id => id.replace(/-q4f.*$/, "").replace(/-Instruct/, "");
const stripThink = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");

// Roughly how many characters of input a prompt may carry (small context windows on-device).
function charBudget() { return state.provider === "chrome" ? 7000 : /7B|8B/.test(state.model) ? 9000 : 7000; }

/**
 * ask({system, prompt, onText, signal, maxTokens, temperature, schema, lang}) -> string (or parsed object when schema given)
 * history: optional [{role:'user'|'assistant', content}] for chat.
 */
async function ask({ system = "", prompt, history = [], onText, signal, maxTokens = 600, temperature = 0.4, schema = null, lang = "en" }) {
  if (state.status !== "ready") throw new Error("On-device AI is not ready yet.");
  let text = "";
  if (state.provider === "chrome") {
    const initial = (system ? [{ role: "system", content: system }] : []).concat(history);
    let session;
    try { session = await LanguageModel.create({ ...chromeOpts(lang), initialPrompts: initial, signal }); }
    catch (e) { if (lang !== "en") session = await LanguageModel.create({ ...chromeOpts("en"), initialPrompts: initial, signal }); else throw e; }
    try {
      if (schema) text = await session.prompt(prompt, { signal, responseConstraint: schema });
      else for await (const ch of session.promptStreaming(prompt, { signal })) {
        text = text && ch.startsWith(text) ? ch : text + ch;
        onText && onText(text);
      }
    } finally { try { session.destroy(); } catch {} }
  } else if (state.provider === "webllm" && engine) {
    const messages = (system ? [{ role: "system", content: system }] : []).concat(history, [{ role: "user", content: prompt }]);
    const onAbort = () => { try { engine.interruptGenerate(); } catch {} };
    signal && signal.addEventListener("abort", onAbort, { once: true });
    try {
      const req = { messages, stream: true, max_tokens: maxTokens, temperature };
      if (schema) req.response_format = { type: "json_object", schema: JSON.stringify(schema) };
      let chunks;
      try { chunks = await engine.chat.completions.create(req); }
      catch (e) { if (!schema) throw e; delete req.response_format; chunks = await engine.chat.completions.create(req); }
      for await (const c of chunks) {
        text += c.choices[0]?.delta?.content || "";
        onText && onText(stripThink(text));
      }
    } finally { signal && signal.removeEventListener("abort", onAbort); }
    if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    text = stripThink(text);
  } else throw new Error("No on-device model loaded.");
  text = String(text || "").trim();
  return schema ? parseJSON(text) : text;
}

function parseJSON(text) {
  const tries = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch {} }
  throw new Error("The model returned malformed JSON. Please try again.");
}

// ---------- Panel UI ----------
const CSS = `
.odl{border:1px solid var(--line,#26324a);border-radius:12px;padding:12px 14px;background:var(--panel,#0f172a);color:var(--ink,inherit);font-size:13.5px;display:grid;gap:10px}
.odl-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.odl-h b{font-size:13.5px}
.odl-dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;flex:none}
.odl-dot.ready{background:#22c55e}.odl-dot.loading,.odl-dot.checking{background:#f59e0b}.odl-dot.error,.odl-dot.unavailable{background:#ef4444}.odl-dot.setup{background:#38bdf8}
.odl-msg{color:var(--muted,#94a3b8);flex:1;min-width:0}
.odl-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.odl select{flex:1;min-width:0;padding:7px 9px;border-radius:8px;border:1px solid var(--line,#26324a);background:var(--panel-2,#111b2e);color:inherit;font:inherit}
.odl button{padding:7px 12px;border-radius:8px;border:1px solid var(--accent,#0ea5e9);background:transparent;color:var(--accent,#0ea5e9);cursor:pointer;font:inherit;font-weight:600}
.odl button.primary{background:var(--accent,#0ea5e9);color:var(--accent-ink,#fff)}
.odl button:disabled{opacity:.5;cursor:default}
.odl-bar{height:5px;border-radius:3px;background:var(--panel-2,#1e293b);overflow:hidden}
.odl-bar i{display:block;height:100%;background:var(--accent,#0ea5e9);transition:width .2s}
.odl-tabs{display:flex;gap:6px;flex-wrap:wrap}
.odl-tabs button{font-weight:500;padding:5px 10px;border-radius:999px;font-size:12.5px;border-color:var(--line,#26324a);color:inherit}
.odl-tabs button[aria-pressed=true]{border-color:var(--accent,#0ea5e9);color:var(--accent,#0ea5e9);background:color-mix(in srgb,var(--accent,#0ea5e9) 12%,transparent)}
.odl-note{color:var(--muted,#94a3b8);font-size:12px;margin:0}
`;

function mount(el, { title = "On-device AI" } = {}) {
  if (!document.getElementById("odl-css")) { const st = document.createElement("style"); st.id = "odl-css"; st.textContent = CSS; document.head.append(st); }
  el.classList.add("odl");
  const paint = () => {
    const chromeOk = state.chrome !== "unavailable";
    const gpuOk = hasWebGPU();
    const tab = (id, label, ok) => `<button type="button" data-p="${id}" aria-pressed="${state.provider === id}" ${ok ? "" : "disabled"}>${label}</button>`;
    let body = "";
    if (state.provider === "chrome" && state.status !== "ready" && state.status !== "loading") {
      body = `<div class="odl-row"><button class="primary" type="button" data-act="chrome-dl">Download Gemini Nano</button></div>
        <p class="odl-note">Built into Chrome. Free, runs locally, roughly 2–4 GB once.</p>`;
    }
    if (state.provider === "webllm" && state.status !== "loading") {
      const cur = state.model || S.model || DEFAULT_MODEL;
      body = `<div class="odl-row"><select aria-label="Model">${MODELS.map(m => `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${m.label}</option>`).join("")}</select>
        <button class="${state.status === "ready" ? "" : "primary"}" type="button" data-act="load">${state.status === "ready" ? "Switch" : "Download & load"}</button></div>
        <p class="odl-note">Open-weight model running on your GPU via WebGPU. The first download is 1–5 GB; after that it loads from the browser cache.</p>`;
    }
    el.innerHTML = `<div class="odl-h"><span class="odl-dot ${state.status}"></span><b>${title}</b><span class="odl-msg">${esc(state.message)}</span></div>
      ${state.status === "loading" ? `<div class="odl-bar"><i style="width:${Math.round(state.progress * 100)}%"></i></div>` : ""}
      <div class="odl-tabs">${tab("chrome", "Chrome AI · Gemini Nano", chromeOk)}${tab("webllm", "Open-weight · WebLLM", gpuOk)}</div>
      ${body}
      <p class="odl-note">Everything runs in your browser. No cloud LLM, no API key, nothing you enter is uploaded.</p>`;
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.p) choose(b.dataset.p);
    else if (b.dataset.act === "chrome-dl") downloadChrome();
    else if (b.dataset.act === "load") loadModel(el.querySelector("select").value);
  });
  subs.add(paint); paint();
  return () => subs.delete(paint);
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const llm = {
  init, ask, mount, charBudget,
  get ready() { return state.status === "ready"; },
  get state() { return state; },
  subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
};
window.OnDeviceLLM = llm;
})();
