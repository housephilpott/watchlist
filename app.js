// ====== CONFIG ======
const API_BASE = "https://script.google.com/macros/s/AKfycbymzwZPQOCat8KEukI_G0Pg5-SpIXdfzuE_m5_YH50871phWX98YbzFY3dmonD41omz2Q/exec";

// ====== STATE ======
let LOG = [];
let WATCHLIST = [];
let chart;

// ====== HELPERS ======
const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $("error");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function norm(s) { return String(s || "").trim().toLowerCase(); }

function inferType(season, episode) {
  const s = norm(season), e = norm(episode);
  if (s === "movie" || e === "movie") return "movie";
  if (s === "special" || e === "special") return "special";
  return "episode";
}

function parseDate(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "Unknown";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function stars(n) {
  const x = Number(n || 0);
  return x ? "★".repeat(x) : "—";
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ path, ...body })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ====== RENDER: TABS ======
function showTab(name) {
  ["log", "watchlist", "stats"].forEach(t => {
    const el = $(`tab-${t}`);
    el.classList.toggle("hidden", t !== name);
  });
}

// ====== FILTER + LOG TABLE ======
function getFilteredLog() {
  const s = norm($("fSearch").value);
  const type = $("fType").value;
  const rep = $("fRepeat").value;
  const minR = Number($("fMinRating").value || 0);
  const from = $("fFrom").value ? parseDate($("fFrom").value) : null;
  const to = $("fTo").value ? parseDate($("fTo").value) : null;

  return [...LOG]
    .filter(r => {
      const t = inferType(r.season, r.episode);
      if (type !== "all" && t !== type) return false;

      const isRepeat = !!r.repeat;
      if (rep === "repeat" && !isRepeat) return false;
      if (rep === "first" && isRepeat) return false;

      if (Number(r.rating || 0) < minR) return false;

      const dv = parseDate(r.dateViewed);
      if (from && dv && dv < from) return false;
      if (to && dv && dv > to) return false;

      if (!s) return true;
      const hay = `${r.title} ${r.notes || ""}`.toLowerCase();
      return hay.includes(s);
    })
    .sort((a, b) => String(b.dateViewed).localeCompare(String(a.dateViewed)));
}

function renderLog() {
  const rows = $("logRows");
  rows.innerHTML = "";

  const data = getFilteredLog();
  $("count").textContent = `(${data.length})`;

  if (!data.length) {
    rows.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500">No matches. Try clearing filters.</td></tr>`;
    return;
  }

  for (const r of data) {
    const t = inferType(r.season, r.episode);
    const typePill =
      t === "movie" ? `<span class="px-2 py-1 rounded-full text-xs bg-indigo-600 text-white">Movie</span>` :
      t === "special" ? `<span class="px-2 py-1 rounded-full text-xs bg-fuchsia-600 text-white">Special</span>` :
      `<span class="px-2 py-1 rounded-full text-xs bg-slate-200 text-slate-800">Episode</span>`;

    rows.insertAdjacentHTML("beforeend", `
      <tr class="border-t hover:bg-slate-50">
        <td class="p-3 whitespace-nowrap">${r.dateViewed || ""}</td>
        <td class="p-3 font-medium">${r.title || ""}</td>
        <td class="p-3 whitespace-nowrap">${r.season || ""}</td>
        <td class="p-3 whitespace-nowrap">${r.episode || ""}</td>
        <td class="p-3">${typePill}</td>
        <td class="p-3">${r.repeat ? `<span class="px-2 py-1 rounded-full text-xs bg-slate-200">[r]</span>` : ""}</td>
        <td class="p-3 whitespace-nowrap">${stars(r.rating)}</td>
        <td class="p-3 min-w-[320px]">${r.notes || ""}</td>
      </tr>
    `);
  }
}

// ====== WATCHLIST ======
function computeWatchlistProgress() {
  const episodeSets = new Map();
  const movieTitles = new Set();

  for (const r of LOG) {
    const t = inferType(r.season, r.episode);
    if (t === "movie") movieTitles.add(norm(r.title));
    if (t !== "episode") continue;
    const key = `${norm(r.title)}|${String(r.season || "").trim()}`;
    if (!episodeSets.has(key)) episodeSets.set(key, new Set());
    episodeSets.get(key).add(String(r.episode || "").trim());
  }

  return WATCHLIST.map(w => {
    const kind = norm(w.kind) || "season";
    if (kind === "film") {
      const autoDone = movieTitles.has(norm(w.title));
      const done = autoDone || !!w.manualDone;
      return { ...w, watched: done, watchedEpisodes: done ? 1 : 0, totalEpisodes: 1 };
    } else {
      const key = `${norm(w.title)}|${String(w.season || "").trim()}`;
      const watchedEpisodes = episodeSets.get(key)?.size || 0;
      const total = Number(w.totalEpisodes || 0);
      const watched = total ? watchedEpisodes >= total : watchedEpisodes > 0;
      return { ...w, watched, watchedEpisodes, totalEpisodes: total };
    }
  }).sort((a, b) => {
    const pr = { high: 0, medium: 1, low: 2 };
    const pa = pr[norm(a.priority)] ?? 9;
    const pb = pr[norm(b.priority)] ?? 9;
    if (pa !== pb) return pa - pb;
    return String(a.title).localeCompare(String(b.title));
  });
}

function renderWatchlist() {
  const host = $("watchlistCards");
  host.innerHTML = "";
  const list = computeWatchlistProgress();

  for (const w of list) {
    const total = Number(w.totalEpisodes || 0);
    const done = Number(w.watchedEpisodes || 0);
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : (w.watched ? 100 : 0);

    const badge =
      norm(w.kind) === "film"
        ? `<span class="px-2 py-1 rounded-full text-xs bg-indigo-600 text-white">Film</span>`
        : `<span class="px-2 py-1 rounded-full text-xs bg-emerald-600 text-white">Season ${w.season}</span>`;

    const doneBadge = w.watched
      ? `<span class="px-2 py-1 rounded-full text-xs bg-green-600 text-white">Done</span>`
      : "";

    const toggleButton = norm(w.kind) === "film"
      ? `<button data-toggle="${w.id}" class="mt-2 w-full px-3 py-2 rounded-2xl border bg-white">Toggle done</button>`
      : "";

    host.insertAdjacentHTML("beforeend", `
      <div class="bg-white rounded-2xl border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
