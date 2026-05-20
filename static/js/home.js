/* ═══════════════════════════════════════════════════════
   Magazzino Scolastico — home.js
   ═══════════════════════════════════════════════════════ */

let currentUser = null;
let allTags = [];
let allComponenti = [];
let allMagazzini = [];
let currentMagazzinoId = null;
let editingId = null;

// ── Qualitative quantity levels ──
const QUAL_LEVELS = [
  { label: "Abbondante", value: 100 },
  { label: "Molto",      value:  50 },
  { label: "Sufficiente",value:  20 },
  { label: "Poco",       value:  10 },
  { label: "Scarso",     value:   5 },
  { label: "Esaurito",   value:   0 }
];
function isQual(unit) { return unit === 'stima'; }
function qualLabel(n) {
  n = parseInt(n) || 0;
  for (const lv of QUAL_LEVELS) { if (n >= lv.value) return lv.label; }
  return 'Esaurito';
}
function nearestQualVal(n) {
  n = parseInt(n) || 0;
  for (const lv of QUAL_LEVELS) { if (n >= lv.value) return lv.value; }
  return 0;
}
function qualOptHTML(currentVal = 20) {
  const v = nearestQualVal(currentVal);
  return QUAL_LEVELS.map(lv =>
    `<option value="${lv.value}"${v === lv.value ? ' selected' : ''}>${lv.label}</option>`
  ).join('');
}
function qualSelectInline(id, currentVal, onchangeAttr) {
  return `<select id="${id}" style="padding:4px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);background:var(--surface-alt)" ${onchangeAttr}>${qualOptHTML(currentVal)}</select>`;
}
// Min-quantity select: excludes Esaurito (0) so component can always go under threshold
function qualMinOptHTML(currentVal = 20) {
  const v = nearestQualVal(parseInt(currentVal) || 5) || 5;
  return QUAL_LEVELS.filter(lv => lv.value > 0).map(lv =>
    `<option value="${lv.value}"${v === lv.value ? ' selected' : ''}>${lv.label}</option>`
  ).join('');
}
function qualMinSelectInline(id, currentVal, onchangeAttr = '') {
  return `<select id="${id}" style="padding:4px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);background:var(--surface-alt)" ${onchangeAttr}>${qualMinOptHTML(currentVal)}</select>`;
}
function applyQualToModal(unit, qtyInputId, qtyQualId, minGroupId = null) {
  const q = isQual(unit);
  const inp = document.getElementById(qtyInputId);
  const sel = document.getElementById(qtyQualId);
  if (inp) inp.style.display = q ? 'none' : '';
  if (sel) sel.style.display = q ? '' : 'none';
  if (minGroupId) {
    const minInpId = minGroupId.replace(/-group$/, '');
    const minSelId = minGroupId.replace(/-group$/, '-qual');
    const minInp = document.getElementById(minInpId);
    const minSel = document.getElementById(minSelId);
    if (minInp) minInp.style.display = q ? 'none' : '';
    if (minSel) minSel.style.display = q ? '' : 'none';
  }
}
function setQualSelect(selectId, val) {
  const sel = document.getElementById(selectId);
  if (sel) sel.value = nearestQualVal(val);
}

// ── Experience modal ──
let espModalPendingComps = [];
let espModalRemovedIds = new Set();
let espModalEspId = null;

// ── Component detail / stock modal ──
let detailCompId = null;
let currentCompStockId = null;

// ── Component creation stock ──
let compModalPendingStock = [];

// ── Svolgi modal ──
let svolgiEspId = null;
let svolgiData = [];

// ─── INIT ─────────────────────────────────────────────

async function init() {
  const res = await fetch("/api/me");
  if (res.status !== 200) { location.href = "/static/login.html"; return; }
  currentUser = await res.json();

  document.getElementById("user-email").textContent = currentUser.email;
  document.getElementById("user-ruolo").textContent = currentUser.ruolo;
  document.getElementById("user-avatar").textContent = currentUser.email[0].toUpperCase();

  const ruolo = currentUser.ruolo;

  if (ruolo === "ADMIN") {
    // Admin: tutto visibile
    document.getElementById("nav-admin-section").style.display = "";
    document.getElementById("nav-utenti").style.display = "";
    document.getElementById("nav-logs").style.display = "";
    document.getElementById("nav-import").style.display = "";
  } else if (ruolo === "TECNICO") {
    // Tecnico: gestione utenti (solo docenti), niente log/import
    document.getElementById("nav-admin-section").style.display = "";
    document.getElementById("nav-utenti").style.display = "";
  } else if (ruolo === "DOCENTE") {
    // Docente: solo componenti (lettura), magazzini (lettura), esperienze
    // nasconde tutta la sezione Strumenti (header + voci)
    document.getElementById("nav-strumenti-section").style.display = "none";
    document.getElementById("nav-tags").style.display = "none";
    document.getElementById("nav-acquisti").style.display = "none";
  }

  // Pulsanti aggiunta componenti e magazzini: solo ADMIN e TECNICO
  if (["ADMIN","TECNICO"].includes(ruolo)) {
    ["btn-add-comp","btn-add-mag"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "";
    });
  }
  // Pulsante nuova esperienza: ADMIN, TECNICO e DOCENTE
  if (["ADMIN","TECNICO","DOCENTE"].includes(ruolo)) {
    const el = document.getElementById("btn-add-esp");
    if (el) el.style.display = "";
  }

  document.getElementById("user-avatar").style.cursor = "pointer";
  document.getElementById("user-avatar").title = "Cambia password";
  document.getElementById("user-avatar").onclick = () => openModal("modal-profilo");

  // Pre-load reference data so all sections work immediately
  await Promise.all([loadTags(), loadComponentiSilent(), loadMagazziniSilent()]);
  showSection("dashboard");
}

async function loadComponentiSilent() {
  const res = await fetch("/api/componenti");
  if (!res.ok) return;
  const data = await res.json();
  allComponenti = data.componenti || [];
}

async function loadMagazziniSilent() {
  const res = await fetch("/api/magazzini");
  if (!res.ok) return;
  const data = await res.json();
  allMagazzini = data.magazzini || [];
}

// ─── NAVIGAZIONE ──────────────────────────────────────

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  document.getElementById("section-" + name).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => {
    if (n.getAttribute("onclick") === `showSection('${name}')`) n.classList.add("active");
  });

  const titles = {
    dashboard: "Dashboard", componenti: "Componenti", magazzini: "Magazzini",
    esperienze: "Esperienze", tags: "Etichette", "lista-acquisti": "Lista Acquisti",
    utenti: "Gestione Utenti", logs: "Log Attività"
  };
  document.getElementById("page-title").textContent = titles[name] || name;

  if (name === "dashboard") loadDashboard();
  else if (name === "componenti") { loadComponenti(); populateTagSelect("search-tag"); }
  else if (name === "magazzini") loadMagazzini();
  else if (name === "esperienze") loadEsperienze();
  else if (name === "tags") loadTagsSection();
  else if (name === "lista-acquisti") loadListaAcquisti();
  else if (name === "utenti") loadUtenti();
  else if (name === "logs") loadLogs();
}

// ─── MODALE HELPERS ───────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function showAlert(msg, type = "success") {
  const d = document.createElement("div");
  d.className = `alert alert-${type}`;
  d.textContent = msg;
  document.getElementById("content").prepend(d);
  setTimeout(() => d.remove(), 4000);
}

// ─── AUTH ─────────────────────────────────────────────

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/static/login.html";
}

async function changePassword() {
  const old_password = document.getElementById("old-password").value;
  const new_password = document.getElementById("new-password").value;
  const res = await fetch("/api/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_password, new_password })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert(data.message, "success");
    closeModal("modal-profilo");
    document.getElementById("old-password").value = "";
    document.getElementById("new-password").value = "";
  } else {
    showAlert(data.error, "error");
  }
}

// ─── DASHBOARD ────────────────────────────────────────

async function loadDashboard() {
  const [rC, rM, rE, rA] = await Promise.all([
    fetch("/api/componenti"), fetch("/api/magazzini"),
    fetch("/api/esperienze"), fetch("/api/lista-acquisti")
  ]);
  const [dC, dM, dE, dA] = await Promise.all([rC.json(), rM.json(), rE.json(), rA.json()]);

  const grid = document.getElementById("stats-grid");
  const ruolo = currentUser?.ruolo;
  const isAdmin = ruolo === "ADMIN";
  const isTecnico = ruolo === "TECNICO";
  const isDocente = ruolo === "DOCENTE";

  // Card sempre visibili a tutti
  let cards = `
    <div class="stat-card" onclick="showSection('componenti')"><div class="stat-value">${dC.componenti?.length ?? 0}</div><div class="stat-label">Componenti nel catalogo</div></div>
    <div class="stat-card" onclick="showSection('magazzini')"><div class="stat-value">${dM.magazzini?.length ?? 0}</div><div class="stat-label">Magazzini</div></div>
    <div class="stat-card" onclick="showSection('esperienze')"><div class="stat-value">${dE.esperienze?.length ?? 0}</div><div class="stat-label">Esperienze di laboratorio</div></div>
  `;
  // Card visibili solo a ADMIN e TECNICO
  if (isAdmin || isTecnico) {
    cards += `
    <div class="stat-card ${dA.totale > 0 ? 'danger' : ''}" onclick="showSection('lista-acquisti')"><div class="stat-value">${dA.totale ?? 0}</div><div class="stat-label">Voci sotto scorta minima</div></div>
    <div class="stat-card" onclick="showSection('tags')"><div class="stat-value">${allTags.length}</div><div class="stat-label">Etichette create</div></div>
    `;
  }
  grid.innerHTML = cards;

  const alerts = document.getElementById("dashboard-alerts");
  if ((isAdmin || isTecnico) && dA.totale > 0) {
    alerts.innerHTML = `<div class="alert alert-warning">Attenzione: ci sono <strong>${dA.totale}</strong> componenti sotto la scorta minima. <a href="#" onclick="showSection('lista-acquisti');return false">Vedi lista acquisti &rarr;</a></div>`;
  } else {
    alerts.innerHTML = `<div class="alert alert-success">Tutti i componenti sono sopra la scorta minima.</div>`;
  }
}

// ─── COMPONENTI ───────────────────────────────────────

async function loadComponenti() {
  const res = await fetch("/api/componenti");
  const data = await res.json();
  allComponenti = data.componenti || [];
  renderComponenti(allComponenti);
}

function renderComponenti(list) {
  document.getElementById("comp-count").textContent = list.length;
  const tbody = document.getElementById("comp-tbody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">Nessun componente trovato.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${esc(c.nome)}</strong>${c.descrizione ? `<br><small style="color:#94a3b8">${esc(c.descrizione.substring(0,60))}${c.descrizione.length>60?'&hellip;':''}</small>` : ''}</td>
      <td>${esc(c.famiglia||'—')}</td>
      <td>${esc(c.tipo||'—')}</td>
      <td>${esc(c.ambito||'—')}</td>
      <td>${esc(c.sottotipo||'—')}</td>
      <td>${esc(c.unita_misura||'pz')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          ${renderTagChips(c.tags||[], false)}
          ${canEdit() ? `<button onclick="openAssignTag(${c.id})" title="Gestisci etichette"
            style="width:20px;height:20px;border-radius:50%;border:1.5px dashed #94a3b8;background:none;cursor:pointer;font-size:14px;line-height:1;color:#94a3b8;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s,color .15s;padding:0"
            onmouseover="this.style.borderColor='#3b82f6';this.style.color='#3b82f6'"
            onmouseout="this.style.borderColor='#94a3b8';this.style.color='#94a3b8'">+</button>` : ''}
        </div>
      </td>
      <td>${c.datasheet_url ? `<a href="${esc(c.datasheet_url)}" target="_blank" style="color:#3b82f6;font-size:12px">Datasheet</a>` : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openComponentDetail(${c.id})">Dettaglio</button>
        ${canEdit() ? `<button class="btn btn-secondary btn-sm" onclick="editComponente(${c.id})">Modifica</button>` : ''}
        ${canEdit() ? `<button class="btn btn-danger btn-sm" onclick="deleteComponente(${c.id})">Canc.</button>` : ''}
      </td>
    </tr>
  `).join('');
}

let searchTimeout = null;
function searchComponenti() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const q = document.getElementById("search-q").value.trim();
    const famiglia = document.getElementById("search-famiglia").value.trim();
    const tipo = document.getElementById("search-tipo").value.trim();
    const ambito = document.getElementById("search-ambito").value.trim();
    const tag_id = document.getElementById("search-tag").value;

    const params = new URLSearchParams({ q, famiglia, tipo, ambito });
    if (tag_id) params.set("tag_id", tag_id);

    const res = await fetch("/api/search/componenti?" + params);
    const data = await res.json();
    renderComponenti(data.componenti || []);
  }, 300);
}

function openModalComponente(id = null) {
  editingId = id;
  compModalPendingStock = [];
  document.getElementById("modal-comp-title").textContent = id ? "Modifica componente" : "Nuovo componente";
  ["comp-nome","comp-descrizione","comp-famiglia","comp-tipo","comp-ambito","comp-sottotipo","comp-datasheet"].forEach(f => document.getElementById(f).value = "");
  document.getElementById("comp-unita").value = "pz";

  // Populate warehouse select for stock section
  const magSel = document.getElementById("comp-modal-mag-sel");
  magSel.innerHTML = allMagazzini.length
    ? allMagazzini.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')
    : '<option value="">Nessun magazzino disponibile</option>';
  document.getElementById("comp-modal-stock-qty").value = 0;
  document.getElementById("comp-modal-stock-min").value = 0;
  document.getElementById("comp-modal-stock-scorta").value = "false";
  const unitaSel = document.getElementById("comp-unita");
  const _applyQualCompModal = () => applyQualToModal(unitaSel.value, 'comp-modal-stock-qty', 'comp-modal-stock-qty-qual', 'comp-modal-stock-min-group');
  unitaSel.onchange = _applyQualCompModal;
  _applyQualCompModal();
  renderCompModalStock();

  if (id) {
    const c = allComponenti.find(x => x.id === id);
    if (c) {
      document.getElementById("comp-nome").value = c.nome || "";
      document.getElementById("comp-descrizione").value = c.descrizione || "";
      document.getElementById("comp-famiglia").value = c.famiglia || "";
      document.getElementById("comp-tipo").value = c.tipo || "";
      document.getElementById("comp-ambito").value = c.ambito || "";
      document.getElementById("comp-sottotipo").value = c.sottotipo || "";
      document.getElementById("comp-unita").value = c.unita_misura || "pz";
      document.getElementById("comp-datasheet").value = c.datasheet_url || "";
    }
  }
  openModal("modal-componente");
}

async function editComponente(id) {
  await loadComponenti();
  openModalComponente(id);
}

// ── Component creation stock list ──

function compModalAddStock() {
  const sel = document.getElementById("comp-modal-mag-sel");
  const magId = parseInt(sel.value);
  if (!magId) { showAlert("Seleziona un magazzino", "error"); return; }
  const magNome = sel.options[sel.selectedIndex]?.text || `#${magId}`;
  const unit = document.getElementById("comp-unita").value;
  const q = isQual(unit);
  const qty = q
    ? parseInt(document.getElementById("comp-modal-stock-qty-qual").value) || 0
    : parseInt(document.getElementById("comp-modal-stock-qty").value) || 0;
  const min = q
    ? parseInt(document.getElementById("comp-modal-stock-min-qual").value) || 0
    : parseInt(document.getElementById("comp-modal-stock-min").value) || 0;
  const scorta = document.getElementById("comp-modal-stock-scorta").value === "true";

  const existing = compModalPendingStock.findIndex(s => s.magazzino_id === magId);
  const entry = { magazzino_id: magId, magNome, quantita: qty, quantita_minima: min, is_scorta: scorta, unita_misura: unit };
  if (existing >= 0) { compModalPendingStock[existing] = entry; }
  else { compModalPendingStock.push(entry); }
  renderCompModalStock();
}

function compModalRemoveStock(idx) {
  compModalPendingStock.splice(idx, 1);
  renderCompModalStock();
}

function renderCompModalStock() {
  const el = document.getElementById("comp-modal-stock-list");
  if (!compModalPendingStock.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-faint);padding:4px 0">Nessuna assegnazione di stock aggiunta.</div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table style="font-size:12.5px">
    <thead><tr><th>Magazzino</th><th>Quantità</th><th>Minimo</th><th>Scorta</th><th></th></tr></thead>
    <tbody>` +
    compModalPendingStock.map((s, idx) => {
      const qLabel = isQual(s.unita_misura) ? qualLabel(s.quantita) : s.quantita;
      const minCell = isQual(s.unita_misura) ? qualLabel(s.quantita_minima) : s.quantita_minima;
      return `
      <tr>
        <td>${esc(s.magNome)}</td>
        <td>${qLabel}</td>
        <td>${minCell}</td>
        <td>${s.is_scorta ? 'Sì' : 'No'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="compModalRemoveStock(${idx})">—</button></td>
      </tr>`;
    }).join('') +
    `</tbody></table></div>`;
}

async function saveComponente() {
  const body = {
    nome: document.getElementById("comp-nome").value.trim(),
    descrizione: document.getElementById("comp-descrizione").value.trim(),
    famiglia: document.getElementById("comp-famiglia").value.trim(),
    tipo: document.getElementById("comp-tipo").value.trim(),
    ambito: document.getElementById("comp-ambito").value.trim(),
    sottotipo: document.getElementById("comp-sottotipo").value.trim(),
    unita_misura: document.getElementById("comp-unita").value,
    datasheet_url: document.getElementById("comp-datasheet").value.trim(),
  };
  if (!body.nome) { showAlert("Il nome è obbligatorio", "error"); return; }

  const url = editingId ? `/api/componenti/${editingId}` : "/api/componenti";
  const method = editingId ? "PUT" : "POST";
  const res = await fetch(url, { method, headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) { showAlert(data.error, "error"); return; }

  const compId = editingId || data.id;

  // Post any pending stock assignments
  for (const s of compModalPendingStock) {
    await fetch(`/api/magazzini/${s.magazzino_id}/componenti`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ componente_id: compId, quantita: s.quantita, quantita_minima: s.quantita_minima, is_scorta: s.is_scorta })
    });
  }

  showAlert(editingId ? "Componente aggiornato" : "Componente creato", "success");
  closeModal("modal-componente");
  loadComponenti();
}

async function deleteComponente(id) {
  if (!confirm("Eliminare questo componente?")) return;
  const res = await fetch(`/api/componenti/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (res.ok) { showAlert("Componente eliminato"); loadComponenti(); }
  else showAlert(data.error, "error");
}

// ─── DETTAGLIO COMPONENTE ─────────────────────────────

async function openComponentDetail(compId) {
  detailCompId = compId;
  const res = await fetch(`/api/componenti/${compId}`);
  if (!res.ok) { showAlert("Errore caricamento componente", "error"); return; }
  const c = await res.json();

  document.getElementById("detail-comp-title").textContent = c.nome;

  const campi = [
    ["Famiglia", c.famiglia], ["Tipo", c.tipo], ["Ambito", c.ambito],
    ["Sottotipo", c.sottotipo], ["Unità di misura", c.unita_misura || "pz"],
  ];

  let html = '';
  if (c.descrizione) {
    html += `<div style="margin-bottom:14px;padding:12px;background:var(--surface-alt);border-radius:var(--radius-sm);font-size:13.5px;color:var(--text-soft);line-height:1.6">${esc(c.descrizione)}</div>`;
  }

  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:14px">` +
    campi.map(([label, val]) => `
      <div>
        <div style="font-size:10.5px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">${label}</div>
        <div style="font-size:13px;color:var(--text)">${val ? esc(String(val)) : '—'}</div>
      </div>
    `).join('') +
  `</div>`;

  if (c.datasheet_url) {
    html += `<div style="margin-bottom:14px"><a href="${esc(c.datasheet_url)}" target="_blank" style="color:var(--primary);font-size:13px;font-weight:500">Apri datasheet &rarr;</a></div>`;
  }
  if (c.tags && c.tags.length) {
    html += `<div style="margin-bottom:14px">${renderTagChips(c.tags, false)}</div>`;
  }

  html += `<div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em">Stock per magazzino</div>
      ${canEdit() ? `<button class="btn btn-primary btn-sm" onclick="openAddStockForComp(${compId})">+ Magazzino</button>` : ''}
    </div>
    <div id="detail-stock-list">${renderDetailStock(c.magazzini || [], compId, c.unita_misura || 'pz')}</div>
  </div>`;

  document.getElementById("detail-comp-body").innerHTML = html;
  openModal("modal-comp-detail");
}

function renderDetailStock(magazzini, compId, unitaMisura) {
  if (!magazzini.length) {
    return `<div style="text-align:center;padding:16px;color:var(--text-faint);font-size:13px">Nessun magazzino associato.</div>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Magazzino</th><th>Posizione</th><th>Quantità</th><th>Minimo</th>
      ${canEdit() ? '<th></th>' : ''}
    </tr></thead>
    <tbody>` +
    magazzini.map(m => {
      const sotto = m.quantita < m.quantita_minima;
      const inputId = `detail-stock-${m.id}-${compId}`;
      const minCellId = `min-cell-detail-${m.id}-${compId}`;
      const s = m.is_scorta ? 'true' : 'false';
      return `<tr>
        <td><strong>${esc(m.nome)}</strong></td>
        <td style="font-size:12px;color:var(--text-soft)">${[m.ambiente,m.sezione,m.cassetto].filter(Boolean).join(' / ')||'—'}</td>
        <td>
          ${canEdit() ? `
            <div style="display:flex;align-items:center;gap:4px">
              ${isQual(unitaMisura) ? `
                ${qualSelectInline(inputId, m.quantita, `onchange="setDetailStockQty(${m.id},${compId},${m.quantita_minima},${s})"`)}
              ` : `
                <button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:15px;line-height:1;min-width:28px"
                  onclick="adjustDetailStock(${m.id},${compId},-1,${m.quantita_minima},${s})">−</button>
                <input type="number" id="${inputId}" value="${m.quantita}" min="0"
                  style="width:64px;padding:4px 6px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);text-align:center;outline:none"
                  onchange="setDetailStockQty(${m.id},${compId},${m.quantita_minima},${s})"
                  onkeydown="if(event.key==='Enter'){this.blur();setDetailStockQty(${m.id},${compId},${m.quantita_minima},${s})}">
                <button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:15px;line-height:1;min-width:28px"
                  onclick="adjustDetailStock(${m.id},${compId},1,${m.quantita_minima},${s})">+</button>
                ${sotto ? '<span style="color:#ef4444;font-size:11px;white-space:nowrap">&nbsp;sotto min.</span>' : ''}
              `}
            </div>` : `<span${sotto?' style="color:#ef4444;font-weight:700"':''}>${isQual(unitaMisura) ? qualLabel(m.quantita) : m.quantita + ' ' + esc(unitaMisura)}${sotto?' (!)':''}</span>`}
        </td>
        <td id="${minCellId}">${minCellDisplayHTML(minCellId,'detail',m.id,compId,m.quantita,s,m.quantita_minima)}</td>
        ${canEdit() ? `<td><button class="btn btn-danger btn-sm" onclick="removeCompFromMag(${m.id},${compId})">Rimuovi</button></td>` : ''}
      </tr>`;
    }).join('') +
    `</tbody></table></div>`;
}

async function adjustDetailStock(magId, compId, delta, minQty, scorta) {
  const inp = document.getElementById(`detail-stock-${magId}-${compId}`);
  if (!inp) return;
  const newQty = Math.max(0, (parseInt(inp.value) || 0) + delta);
  inp.value = newQty;
  await putStock(magId, compId, newQty, minQty, scorta === 'true' || scorta === true);
}

async function setDetailStockQty(magId, compId, minQty, scorta) {
  const inp = document.getElementById(`detail-stock-${magId}-${compId}`);
  if (!inp) return;
  const newQty = Math.max(0, parseInt(inp.value) || 0);
  inp.value = newQty;
  await putStock(magId, compId, newQty, minQty, scorta === 'true' || scorta === true);
}

async function removeCompFromMag(magId, compId) {
  if (!confirm("Rimuovere questo componente dal magazzino?")) return;
  const res = await fetch(`/api/magazzini/${magId}/componenti/${compId}`, { method: "DELETE" });
  if (res.ok) { await openComponentDetail(compId); }
  else { const d = await res.json(); showAlert(d.error || "Errore", "error"); }
}

function openAddStockForComp(compId) {
  currentCompStockId = compId;
  const comp = allComponenti.find(c => c.id === compId);
  document.getElementById("comp-stock-nome").textContent = comp ? comp.nome : `#${compId}`;

  const sel = document.getElementById("comp-stock-mag-id");
  sel.innerHTML = allMagazzini.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  document.getElementById("comp-stock-qty").value = 0;
  document.getElementById("comp-stock-min").value = 0;
  document.getElementById("comp-stock-scorta").value = "false";
  applyQualToModal(comp?.unita_misura, 'comp-stock-qty', 'comp-stock-qty-qual', 'comp-stock-min-group');
  openModal("modal-comp-stock");
}

async function saveCompStock() {
  const magId = parseInt(document.getElementById("comp-stock-mag-id").value);
  const comp = allComponenti.find(c => c.id === currentCompStockId);
  const q = isQual(comp?.unita_misura);
  const qty = q
    ? parseInt(document.getElementById("comp-stock-qty-qual").value)
    : parseInt(document.getElementById("comp-stock-qty").value) || 0;
  const min = q
    ? parseInt(document.getElementById("comp-stock-min-qual").value) || 0
    : parseInt(document.getElementById("comp-stock-min").value) || 0;
  const scorta = document.getElementById("comp-stock-scorta").value === "true";

  const res = await fetch(`/api/magazzini/${magId}/componenti`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ componente_id: currentCompStockId, quantita: qty, quantita_minima: min, is_scorta: scorta })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert("Stock aggiornato", "success");
    closeModal("modal-comp-stock");
    if (detailCompId === currentCompStockId) await openComponentDetail(currentCompStockId);
  } else {
    showAlert(data.error || "Errore", "error");
  }
}

// ─── STOCK HELPERS ────────────────────────────────────

async function putStock(magId, compId, qty, minQty, scorta) {
  const res = await fetch(`/api/magazzini/${magId}/componenti/${compId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantita: qty, quantita_minima: minQty, is_scorta: !!scorta })
  });
  if (!res.ok) {
    const d = await res.json();
    showAlert(d.error || "Errore aggiornamento stock", "error");
    return false;
  }
  return true;
}

// ─── EDIT MINIMUM QUANTITY ────────────────────────────

function minCellDisplayHTML(cellId, context, magId, compId, currentQty, scorta, minVal) {
  const comp = allComponenti.find(c => c.id === compId);
  const q = isQual(comp?.unita_misura);
  const s = (scorta === 'true' || scorta === true) ? 'true' : 'false';
  const displayMin = q ? qualLabel(minVal) : minVal;
  return `${displayMin}${canEdit()
    ? `&nbsp;<button class="btn btn-secondary btn-sm" style="padding:2px 5px;font-size:11px"
        onclick="enterEditMin('${cellId}','${context}',${magId},${compId},${currentQty},'${s}',${minVal})">Modifica</button>`
    : ''}`;
}

function enterEditMin(cellId, context, magId, compId, currentQty, scorta, currentMin) {
  const cell = document.getElementById(cellId);
  if (!cell) return;
  const comp = allComponenti.find(c => c.id === compId);
  const q = isQual(comp?.unita_misura);
  const s = (scorta === 'true' || scorta === true) ? 'true' : 'false';
  const inpId = `min-edit-inp-${magId}-${compId}`;
  const saveBtn = `<button class="btn btn-primary btn-sm" style="padding:2px 6px;font-size:11px"
      onclick="saveEditMin('${cellId}','${context}',${magId},${compId},${currentQty},'${s}')">&#10003;</button>`;
  const cancelBtn = `<button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:11px"
      onclick="cancelEditMin('${cellId}','${context}',${magId},${compId},${currentQty},'${s}',${currentMin})">&#10007;</button>`;
  if (q) {
    cell.innerHTML = `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap">
      ${qualMinSelectInline(inpId, currentMin)}
      ${saveBtn}${cancelBtn}
    </div>`;
  } else {
    cell.innerHTML = `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap">
      <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:13px;line-height:1"
        onclick="adjustEditMin('${inpId}',-1)">−</button>
      <input type="number" id="${inpId}" value="${currentMin}" min="0"
        style="width:54px;padding:3px 4px;border:1px solid var(--primary);border-radius:5px;font-size:12px;text-align:center;outline:none"
        onkeydown="if(event.key==='Enter')saveEditMin('${cellId}','${context}',${magId},${compId},${currentQty},'${s}')">
      <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:13px;line-height:1"
        onclick="adjustEditMin('${inpId}',1)">+</button>
      ${saveBtn}${cancelBtn}
    </div>`;
  }
}

function adjustEditMin(inpId, delta) {
  const inp = document.getElementById(inpId);
  if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
}

async function saveEditMin(cellId, context, magId, compId, currentQty, scorta) {
  const inp = document.getElementById(`min-edit-inp-${magId}-${compId}`);
  if (!inp) return;
  const newMin = Math.max(0, parseInt(inp.value) || 0);
  const ok = await putStock(magId, compId, currentQty, newMin, scorta === 'true' || scorta === true);
  if (ok !== false) {
    if (context === 'detail') {
      await openComponentDetail(compId);
    } else {
      await loadStock(magId);
    }
  }
}

function cancelEditMin(cellId, context, magId, compId, currentQty, scorta, originalMin) {
  const cell = document.getElementById(cellId);
  if (cell) cell.innerHTML = minCellDisplayHTML(cellId, context, magId, compId, currentQty, scorta, originalMin);
}

// ─── TAGS ─────────────────────────────────────────────

async function loadTags() {
  const res = await fetch("/api/tags");
  if (!res.ok) return;
  const data = await res.json();
  allTags = data.tags || [];
}

function renderTagChips(tags, removable = false, compId = null) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `
    <span class="tag-chip" style="background:${t.colore};color:${contrastColor(t.colore)}">
      ${esc(t.nome)}
      ${removable ? `<span class="remove-tag" onclick="removeTagFromComp(${compId},${t.id})">&times;</span>` : ''}
    </span>
  `).join('');
}

function populateTagSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  const isFilter = selectId === "search-tag";
  sel.innerHTML = (isFilter ? '<option value="">Tutte le etichette</option>' : '<option value="">— Seleziona etichetta —</option>') +
    allTags.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  if (current) sel.value = current;
}

async function loadTagsSection() {
  await loadTags();
  const grid = document.getElementById("tags-grid");
  const empty = document.getElementById("tags-empty");
  if (!allTags.length) {
    grid.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  grid.innerHTML = allTags.map(t => `
    <div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px">
      <span class="tag-chip" style="background:${t.colore};color:${contrastColor(t.colore)};font-size:14px">${esc(t.nome)}</span>
      <span style="font-size:11px;color:#94a3b8">di ${esc(t.created_by_email||'sistema')}</span>
      <button class="btn btn-secondary btn-sm" onclick="openEditTag(${t.id})">Modifica</button>
      ${currentUser.ruolo !== 'DOCENTE' ? `<button class="btn btn-danger btn-sm" onclick="deleteTag(${t.id})">Canc.</button>` : ''}
    </div>
  `).join('');
}

function openModalTag() {
  editingId = null;
  document.getElementById("modal-tag-title").textContent = "Nuova etichetta";
  document.getElementById("tag-nome").value = "";
  document.getElementById("tag-colore").value = "#3b82f6";
  const _prev = document.getElementById("tag-preview");
  _prev.style.background = "#3b82f6";
  _prev.style.color = contrastColor("#3b82f6");
  _prev.textContent = "Anteprima";
  document.getElementById("tag-colore").oninput = function() {
    const prev = document.getElementById("tag-preview");
    prev.style.background = this.value;
    prev.style.color = contrastColor(this.value);
    prev.textContent = document.getElementById("tag-nome").value || "Anteprima";
  };
  document.getElementById("tag-nome").oninput = function() {
    document.getElementById("tag-preview").textContent = this.value || "Anteprima";
  };
  openModal("modal-tag");
}

function openEditTag(id) {
  const t = allTags.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById("modal-tag-title").textContent = "Modifica etichetta";
  document.getElementById("tag-nome").value = t.nome;
  document.getElementById("tag-colore").value = t.colore;
  document.getElementById("tag-preview").style.background = t.colore;
  document.getElementById("tag-preview").style.color = contrastColor(t.colore);
  document.getElementById("tag-preview").textContent = t.nome;
  document.getElementById("tag-colore").oninput = function() {
    const prev = document.getElementById("tag-preview");
    prev.style.background = this.value;
    prev.style.color = contrastColor(this.value);
  };
  document.getElementById("tag-nome").oninput = function() { document.getElementById("tag-preview").textContent = this.value || "Anteprima"; };
  openModal("modal-tag");
}

async function saveTag() {
  const nome = document.getElementById("tag-nome").value.trim();
  const colore = document.getElementById("tag-colore").value;
  if (!nome) { showAlert("Il nome è obbligatorio", "error"); return; }

  const url = editingId ? `/api/tags/${editingId}` : "/api/tags";
  const method = editingId ? "PUT" : "POST";
  const res = await fetch(url, { method, headers: {"Content-Type":"application/json"}, body: JSON.stringify({nome,colore}) });
  const data = await res.json();
  if (res.ok) {
    showAlert(editingId ? "Etichetta aggiornata" : "Etichetta creata", "success");
    closeModal("modal-tag");
    await loadTags();
    loadTagsSection();
  } else showAlert(data.error, "error");
}

async function deleteTag(id) {
  if (!confirm("Eliminare questa etichetta?")) return;
  const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (res.ok) { showAlert("Etichetta eliminata"); await loadTags(); loadTagsSection(); }
  else showAlert(data.error, "error");
}

// ─── ASSEGNA TAG ──────────────────────────────────────

let assignTagCompId = null;

async function openAssignTag(compId) {
  assignTagCompId = compId;
  const comp = allComponenti.find(c => c.id === compId);
  document.getElementById("assign-tag-comp-nome").textContent = comp ? comp.nome : `#${compId}`;
  await refreshAssignTagModal();
  populateTagSelect("assign-tag-select");
  openModal("modal-assign-tag");
}

async function refreshAssignTagModal() {
  const res = await fetch(`/api/componenti/${assignTagCompId}/tags`);
  const data = await res.json();
  const tags = data.tags || [];
  document.getElementById("assign-tag-current").innerHTML =
    tags.length
      ? tags.map(t => `<span class="tag-chip" style="background:${t.colore};color:${contrastColor(t.colore)}">${esc(t.nome)} <span class="remove-tag" onclick="removeTagFromComp(${assignTagCompId},${t.id})">&times;</span></span>`).join('')
      : '<span style="color:#94a3b8;font-size:13px">Nessuna etichetta assegnata</span>';
}

async function addTagToComp() {
  const tag_id = document.getElementById("assign-tag-select").value;
  if (!tag_id) { showAlert("Seleziona un'etichetta", "error"); return; }
  const res = await fetch(`/api/componenti/${assignTagCompId}/tags`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ tag_id: parseInt(tag_id) })
  });
  const data = await res.json();
  if (res.ok) { await refreshAssignTagModal(); loadComponenti(); }
  else showAlert(data.error, "error");
}

async function removeTagFromComp(compId, tagId) {
  const res = await fetch(`/api/componenti/${compId}/tags/${tagId}`, { method: "DELETE" });
  if (res.ok) { await refreshAssignTagModal(); loadComponenti(); }
}

// ─── MAGAZZINI ────────────────────────────────────────

async function loadMagazzini() {
  const res = await fetch("/api/magazzini");
  const data = await res.json();
  allMagazzini = data.magazzini || [];
  const tbody = document.getElementById("mag-tbody");
  if (!allMagazzini.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">Nessun magazzino.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = allMagazzini.map(m => `
    <tr>
      <td><strong>${esc(m.nome)}</strong></td>
      <td>${esc(m.ambiente||'—')}</td>
      <td>${esc(m.sezione||'—')}</td>
      <td>${esc(m.cassetto||'—')}</td>
      <td style="color:#64748b;font-size:12px">${esc(m.descrizione||'')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openStockDetail(${m.id})">Stock</button>
        ${canEdit() ? `<button class="btn btn-secondary btn-sm" onclick="openModalMagazzino(${m.id})">Modifica</button>` : ''}
        ${currentUser.ruolo==='ADMIN' ? `<button class="btn btn-danger btn-sm" onclick="deleteMagazzino(${m.id})">Canc.</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function openModalMagazzino(id = null) {
  editingId = id;
  document.getElementById("modal-mag-title").textContent = id ? "Modifica magazzino" : "Nuovo magazzino";
  ["mag-nome","mag-descrizione","mag-ambiente","mag-sezione","mag-cassetto"].forEach(f => document.getElementById(f).value = "");
  if (id) {
    const m = allMagazzini.find(x => x.id === id);
    if (m) {
      document.getElementById("mag-nome").value = m.nome || "";
      document.getElementById("mag-descrizione").value = m.descrizione || "";
      document.getElementById("mag-ambiente").value = m.ambiente || "";
      document.getElementById("mag-sezione").value = m.sezione || "";
      document.getElementById("mag-cassetto").value = m.cassetto || "";
    }
  }
  openModal("modal-magazzino");
}

async function saveMagazzino() {
  const body = {
    nome: document.getElementById("mag-nome").value.trim(),
    descrizione: document.getElementById("mag-descrizione").value.trim(),
    ambiente: document.getElementById("mag-ambiente").value.trim(),
    sezione: document.getElementById("mag-sezione").value.trim(),
    cassetto: document.getElementById("mag-cassetto").value.trim(),
  };
  if (!body.nome) { showAlert("Il nome è obbligatorio", "error"); return; }

  const url = editingId ? `/api/magazzini/${editingId}` : "/api/magazzini";
  const method = editingId ? "PUT" : "POST";
  const res = await fetch(url, { method, headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();
  if (res.ok) {
    showAlert(editingId ? "Magazzino aggiornato" : "Magazzino creato", "success");
    closeModal("modal-magazzino");
    loadMagazzini();
  } else showAlert(data.error, "error");
}

async function deleteMagazzino(id) {
  if (!confirm("Eliminare questo magazzino?")) return;
  const res = await fetch(`/api/magazzini/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (res.ok) { showAlert("Magazzino eliminato"); loadMagazzini(); closeStockDetail(); }
  else showAlert(data.error, "error");
}

// ─── STOCK ────────────────────────────────────────────

async function openStockDetail(magId) {
  currentMagazzinoId = magId;
  const mag = allMagazzini.find(m => m.id === magId);
  document.getElementById("stock-mag-nome").textContent = mag ? mag.nome : `#${magId}`;
  document.getElementById("btn-add-stock").style.display = canEdit() ? "" : "none";
  await loadStock(magId);
  openModal("modal-stock-detail");
}

function closeStockDetail() {
  closeModal("modal-stock-detail");
  currentMagazzinoId = null;
}

async function loadStock(magId) {
  const res = await fetch(`/api/magazzini/${magId}/componenti`);
  const data = await res.json();
  const list = data.componenti || [];
  const tbody = document.getElementById("stock-tbody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">Nessun componente nel magazzino.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const sotto = c.quantita < c.quantita_minima;
    const inputId = `stock-mag-${c.id}`;
    const minCellId = `min-cell-mag-${magId}-${c.id}`;
    const s = c.is_scorta ? 'true' : 'false';
    return `
    <tr>
      <td><strong>${esc(c.nome)}</strong></td>
      <td style="color:#64748b;font-size:12px">${esc(c.famiglia||'—')}</td>
      <td>
        ${canEdit() ? `
          <div style="display:flex;align-items:center;gap:4px">
            ${isQual(c.unita_misura) ? `
              ${qualSelectInline(inputId, c.quantita, `onchange="setStockInMag(${magId},${c.id},${c.quantita_minima},${s})"`)}
            ` : `
              <button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:15px;line-height:1;min-width:28px"
                onclick="adjustStockInMag(${magId},${c.id},-1,${c.quantita_minima},${s})">−</button>
              <input type="number" id="${inputId}" value="${c.quantita}" min="0"
                style="width:64px;padding:4px 6px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);text-align:center;outline:none"
                onchange="setStockInMag(${magId},${c.id},${c.quantita_minima},${s})"
                onkeydown="if(event.key==='Enter'){this.blur();setStockInMag(${magId},${c.id},${c.quantita_minima},${s})}">
              <button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:15px;line-height:1;min-width:28px"
                onclick="adjustStockInMag(${magId},${c.id},1,${c.quantita_minima},${s})">+</button>
              ${sotto ? '<span style="color:#ef4444;font-size:11px;white-space:nowrap">&nbsp;(!)</span>' : ''}
            `}
          </div>
        ` : `<span${sotto?' style="color:#ef4444;font-weight:700"':''}>${isQual(c.unita_misura) ? qualLabel(c.quantita) : c.quantita + ' ' + esc(c.unita_misura||'pz')}${sotto?' (!)':''}</span>`}
      </td>
      <td id="${minCellId}">${minCellDisplayHTML(minCellId,'mag',magId,c.id,c.quantita,s,c.quantita_minima)}</td>
      <td>${c.is_scorta ? '<span class="badge" style="background:#fef3c7;color:#92400e">Scorta</span>' : '—'}</td>
      <td style="white-space:nowrap">
        ${canEdit() ? `<button class="btn btn-danger btn-sm" onclick="removeStock(${currentMagazzinoId},${c.id})">Canc.</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function adjustStockInMag(magId, compId, delta, minQty, scorta) {
  const inp = document.getElementById(`stock-mag-${compId}`);
  if (!inp) return;
  const newQty = Math.max(0, (parseInt(inp.value) || 0) + delta);
  inp.value = newQty;
  await putStock(magId, compId, newQty, minQty, scorta === 'true' || scorta === true);
}

async function setStockInMag(magId, compId, minQty, scorta) {
  const inp = document.getElementById(`stock-mag-${compId}`);
  if (!inp) return;
  const newQty = Math.max(0, parseInt(inp.value) || 0);
  inp.value = newQty;
  await putStock(magId, compId, newQty, minQty, scorta === 'true' || scorta === true);
}

function _stockModalApplyQual(compId) {
  const c = allComponenti.find(x => x.id === parseInt(compId));
  applyQualToModal(c?.unita_misura, 'stock-quantita', 'stock-quantita-qual', 'stock-minima-group');
}

function openModalStock() {
  const sel = document.getElementById("stock-componente-id");
  sel.innerHTML = allComponenti.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  document.getElementById("stock-quantita").value = 0;
  document.getElementById("stock-minima").value = 0;
  document.getElementById("stock-scorta").value = "false";
  editingId = null;
  sel.onchange = () => _stockModalApplyQual(sel.value);
  _stockModalApplyQual(sel.value);
  openModal("modal-stock");
}

function openEditStock(compId, qty, min, scorta) {
  const sel = document.getElementById("stock-componente-id");
  sel.innerHTML = allComponenti.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  sel.value = compId;
  sel.disabled = true;
  sel.onchange = () => _stockModalApplyQual(sel.value);
  _stockModalApplyQual(compId);
  const comp = allComponenti.find(c => c.id === compId);
  if (isQual(comp?.unita_misura)) {
    setQualSelect('stock-quantita-qual', qty);
    setQualSelect('stock-minima-qual', min);
  } else {
    document.getElementById("stock-quantita").value = qty;
    document.getElementById("stock-minima").value = min;
  }
  document.getElementById("stock-scorta").value = scorta ? "true" : "false";
  editingId = compId;
  openModal("modal-stock");
}

async function saveStock() {
  const componente_id = parseInt(document.getElementById("stock-componente-id").value);
  const comp = allComponenti.find(c => c.id === componente_id);
  const q = isQual(comp?.unita_misura);
  const quantita = q
    ? parseInt(document.getElementById("stock-quantita-qual").value)
    : parseInt(document.getElementById("stock-quantita").value);
  const quantita_minima = q
    ? parseInt(document.getElementById("stock-minima-qual").value) || 0
    : parseInt(document.getElementById("stock-minima").value) || 0;
  const is_scorta = document.getElementById("stock-scorta").value === "true";
  document.getElementById("stock-componente-id").disabled = false;

  const res = await fetch(`/api/magazzini/${currentMagazzinoId}/componenti`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ componente_id, quantita, quantita_minima, is_scorta })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert("Stock aggiornato", "success");
    closeModal("modal-stock");
    loadStock(currentMagazzinoId);
  } else showAlert(data.error, "error");
}

async function removeStock(magId, compId) {
  if (!confirm("Rimuovere questo componente dal magazzino?")) return;
  const res = await fetch(`/api/magazzini/${magId}/componenti/${compId}`, { method: "DELETE" });
  if (res.ok) { showAlert("Rimosso"); loadStock(magId); }
}

// ─── ESPERIENZE ───────────────────────────────────────

async function loadEsperienze() {
  if (!allComponenti.length) await loadComponentiSilent();

  const res = await fetch("/api/esperienze");
  const data = await res.json();
  const list = data.esperienze || [];
  const tbody = document.getElementById("esp-tbody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">Nessuna esperienza.</div></td></tr>`;
    return;
  }

  // Fetch availability for all experiences in parallel
  const dispResults = await Promise.all(
    list.map(e => fetch(`/api/esperienze/${e.id}/disponibilita`).then(r => r.ok ? r.json() : null).catch(() => null))
  );
  const dispMap = {};
  list.forEach((e, i) => { dispMap[e.id] = dispResults[i]; });

  tbody.innerHTML = list.map(e => {
    const disp = dispMap[e.id];
    let badge;
    if (!disp) {
      badge = '<span class="badge" style="background:#f1f5f9;color:#94a3b8">—</span>';
    } else if (!disp.componenti || disp.componenti.length === 0) {
      badge = '<span class="badge" style="background:#f1f5f9;color:#94a3b8">Nessun comp.</span>';
    } else if (disp.tutto_disponibile) {
      badge = '<span class="badge" style="background:#d1fae5;color:#065f46">&#10003; Disponibile</span>';
    } else {
      badge = '<span class="badge" style="background:#fee2e2;color:#991b1b">&#10007; Mancante</span>';
    }

    return `
    <tr>
      <td><strong>${esc(e.nome)}</strong>${e.descrizione?`<br><small style="color:#94a3b8">${esc(e.descrizione.substring(0,60))}</small>`:''}</td>
      <td style="font-size:12px">${esc(e.docente_email||'—')}</td>
      <td style="font-size:12px;color:#64748b">${esc(e.data_creazione||'')}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openEspDetail(${e.id})">Dettaglio</button>
        ${canEditEsp(e) ? `<button class="btn btn-secondary btn-sm" onclick="openModalEsperienza(${e.id})">Modifica</button>` : ''}
        ${canEditEsp(e) ? `<button class="btn btn-danger btn-sm" onclick="deleteEsperienza(${e.id})">Canc.</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function canEditEsp(e) {
  if (currentUser.ruolo === 'ADMIN') return true;
  if (currentUser.ruolo === 'TECNICO') return true;
  if (currentUser.ruolo === 'DOCENTE' && String(e.docente_id) === String(currentUser.id)) return true;
  return false;
}

// ─── EXPERIENCE MODAL WITH COMPONENTS ─────────────────

function renderEspModalCompList() {
  const el = document.getElementById("esp-modal-comp-list");
  if (!espModalPendingComps.length) {
    el.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-faint);font-size:13px">Nessun componente aggiunto.</div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table style="font-size:12.5px">
    <thead><tr><th>Componente</th><th>Quantità</th><th>Consumabile</th><th></th></tr></thead>
    <tbody>` +
    espModalPendingComps.map((c, idx) => {
      const comp = allComponenti.find(x => x.id === c.componente_id);
      const unit = comp?.unita_misura || c.unita_misura || 'pz';
      const qNec = c.quantita_necessaria;
      const qtyCtrl = isQual(unit)
        ? `<select onchange="espModalPendingComps[${idx}].quantita_necessaria=parseInt(this.value)"
            style="padding:4px 7px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;font-family:var(--font)">
            <option value="100" ${qNec>=100?'selected':''}>Abbondante</option>
            <option value="50"  ${qNec>=50&&qNec<100?'selected':''}>Molto</option>
            <option value="20"  ${qNec>=20&&qNec<50?'selected':''}>Sufficiente</option>
            <option value="10"  ${qNec>=10&&qNec<20?'selected':''}>Poco</option>
            <option value="5"   ${qNec<10?'selected':''}>Scarso</option>
          </select>`
        : `<div style="display:flex;align-items:center;gap:3px">
            <button class="btn btn-secondary btn-sm" style="padding:1px 7px;font-size:14px;line-height:1"
              onclick="var i=this.nextElementSibling;i.value=Math.max(1,parseInt(i.value)-1);espModalPendingComps[${idx}].quantita_necessaria=parseInt(i.value)">−</button>
            <input type="number" value="${qNec}" min="1"
              style="width:54px;padding:3px 5px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;text-align:center"
              onchange="espModalPendingComps[${idx}].quantita_necessaria=Math.max(1,parseInt(this.value)||1);if(parseInt(this.value)<1)this.value=1">
            <button class="btn btn-secondary btn-sm" style="padding:1px 7px;font-size:14px;line-height:1"
              onclick="var i=this.previousElementSibling;i.value=parseInt(i.value)+1;espModalPendingComps[${idx}].quantita_necessaria=parseInt(i.value)">+</button>
            <span style="font-size:11px;color:#64748b;margin-left:2px">${esc(unit)}</span>
          </div>`;
      return `
      <tr>
        <td>${esc(c.nome)}</td>
        <td>${qtyCtrl}</td>
        <td>${c.consumabile ? 'Sì' : 'No'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="espModalRemoveComp(${idx})">—</button></td>
      </tr>`;
    }).join('') +
    `</tbody></table></div>`;
}

function _espModalQtyToggle() {
  const sel = document.getElementById("esp-modal-comp-sel");
  const comp = allComponenti.find(c => c.id === parseInt(sel?.value));
  const q = isQual(comp?.unita_misura);
  const inp = document.getElementById("esp-modal-qty");
  const qSel = document.getElementById("esp-modal-qty-qual");
  if (inp) inp.style.display = q ? 'none' : '';
  if (qSel) qSel.style.display = q ? '' : 'none';
}

function espModalAddComp() {
  const sel = document.getElementById("esp-modal-comp-sel");
  const compId = parseInt(sel.value);
  if (!compId) { showAlert("Seleziona un componente", "error"); return; }
  const comp = allComponenti.find(c => c.id === compId);
  const q = isQual(comp?.unita_misura);
  const qty = q
    ? parseInt(document.getElementById("esp-modal-qty-qual").value) || 20
    : Math.max(1, parseInt(document.getElementById("esp-modal-qty").value) || 1);
  const consumabile = document.getElementById("esp-modal-consumabile").checked;
  const nome = comp ? comp.nome : `#${compId}`;

  const existing = espModalPendingComps.findIndex(c => c.componente_id === compId);
  if (existing >= 0) {
    espModalPendingComps[existing].quantita_necessaria = qty;
    espModalPendingComps[existing].consumabile = consumabile;
  } else {
    espModalPendingComps.push({ componente_id: compId, nome, quantita_necessaria: qty, consumabile, unita_misura: comp?.unita_misura });
  }
  espModalRemovedIds.delete(compId);
  renderEspModalCompList();
}

function espModalRemoveComp(idx) {
  const comp = espModalPendingComps[idx];
  if (comp && espModalEspId) espModalRemovedIds.add(comp.componente_id);
  espModalPendingComps.splice(idx, 1);
  renderEspModalCompList();
}

async function openModalEsperienza(id = null) {
  editingId = id;
  espModalEspId = id;
  espModalPendingComps = [];
  espModalRemovedIds = new Set();

  document.getElementById("modal-esp-title").textContent = id ? "Modifica esperienza" : "Nuova esperienza";
  document.getElementById("esp-nome").value = "";
  document.getElementById("esp-descrizione").value = "";

  const sel = document.getElementById("esp-modal-comp-sel");
  sel.innerHTML = allComponenti.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  document.getElementById("esp-modal-qty").value = 1;
  document.getElementById("esp-modal-consumabile").checked = false;
  _espModalQtyToggle();

  if (id) {
    const res = await fetch(`/api/esperienze/${id}`);
    if (res.ok) {
      const e = await res.json();
      document.getElementById("esp-nome").value = e.nome || "";
      document.getElementById("esp-descrizione").value = e.descrizione || "";
      espModalPendingComps = (e.componenti || []).map(c => ({
        componente_id: c.id,
        nome: c.nome,
        quantita_necessaria: c.quantita_necessaria,
        consumabile: !!c.consumabile
      }));
    }
  }

  renderEspModalCompList();
  openModal("modal-esperienza");
}

async function saveEsperienza() {
  const body = {
    nome: document.getElementById("esp-nome").value.trim(),
    descrizione: document.getElementById("esp-descrizione").value.trim(),
  };
  if (!body.nome) { showAlert("Il nome è obbligatorio", "error"); return; }

  const url = editingId ? `/api/esperienze/${editingId}` : "/api/esperienze";
  const method = editingId ? "PUT" : "POST";
  const res = await fetch(url, { method, headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) { showAlert(data.error || "Errore salvataggio", "error"); return; }

  const espId = editingId || data.id;

  for (const compId of espModalRemovedIds) {
    await fetch(`/api/esperienze/${espId}/componenti/${compId}`, { method: "DELETE" });
  }
  for (const c of espModalPendingComps) {
    await fetch(`/api/esperienze/${espId}/componenti`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ componente_id: c.componente_id, quantita_necessaria: c.quantita_necessaria, consumabile: c.consumabile })
    });
  }

  showAlert(editingId ? "Esperienza aggiornata" : "Esperienza creata", "success");
  closeModal("modal-esperienza");
  loadEsperienze();
}

async function deleteEsperienza(id) {
  if (!confirm("Eliminare questa esperienza?")) return;
  const res = await fetch(`/api/esperienze/${id}`, { method: "DELETE" });
  if (res.ok) { showAlert("Esperienza eliminata"); loadEsperienze(); closeEspDetail(); }
}

// ─── EXPERIENCE DETAIL ────────────────────────────────

async function openEspDetail(id) {
  // Fetch in parallel
  const [rEsp, rAvail] = await Promise.all([
    fetch(`/api/esperienze/${id}`),
    fetch(`/api/esperienze/${id}/disponibilita`)
  ]);

  if (!rEsp.ok) { showAlert("Errore caricamento esperienza", "error"); return; }

  const [espData, dAvail] = await Promise.all([rEsp.json(), rAvail.ok ? rAvail.json() : {tutto_disponibile: true, componenti: []}]);
  const componenti = espData.componenti || [];

  document.getElementById("esp-detail-nome").textContent = espData.nome || `Esperienza #${id}`;

  const userCanEdit = currentUser.ruolo === 'ADMIN' ||
    (currentUser.ruolo === 'DOCENTE' && String(espData.docente_id) === String(currentUser.id));

  const hasConsumabili = componenti.some(c => c.consumabile);

  // Update actions
  const actionsEl = document.getElementById("esp-detail-actions");
  actionsEl.innerHTML = `
    ${hasConsumabili ? `<button class="btn btn-success btn-sm" onclick="openSvolgiModal(${id})">Dichiara svolta</button>` : ''}
    <button class="btn btn-secondary btn-sm" onclick="closeEspDetail()">Chiudi</button>
  `;

  const avMap = {};
  (dAvail.componenti || []).forEach(c => { avMap[c.id] = c; });

  // Metadati esperienza (descrizione, docente, data)
  let html = '';
  if (espData.descrizione || espData.docente_email || espData.data_creazione) {
    html += `<div style="margin-bottom:14px;padding:12px 14px;background:var(--bg);border-radius:var(--radius);border:1px solid var(--border);font-size:13px;line-height:1.7">`;
    if (espData.descrizione) html += `<div style="color:var(--text);margin-bottom:6px">${esc(espData.descrizione)}</div>`;
    const meta = [];
    if (espData.docente_email) meta.push(`<span><strong>Docente:</strong> ${esc(espData.docente_email)}</span>`);
    if (espData.data_creazione) meta.push(`<span><strong>Creata il:</strong> ${esc(espData.data_creazione)}</span>`);
    if (meta.length) html += `<div style="color:var(--text-faint);display:flex;gap:20px;flex-wrap:wrap">${meta.join('')}</div>`;
    html += `</div>`;
  }

  html += `<div class="alert ${dAvail.tutto_disponibile?'alert-success':'alert-warning'}">
    ${dAvail.tutto_disponibile ? 'Tutti i componenti sono disponibili.' : 'Alcuni componenti non sono disponibili.'}
  </div>`;

  if (componenti.length) {
    html += `<div class="table-wrap"><table>
      <thead><tr>
        <th>Componente</th><th>Famiglia</th><th>Quantità</th><th>Disponibile</th><th>Consumabile</th><th>Stato</th>
        ${userCanEdit ? '<th></th>' : ''}
      </tr></thead><tbody>` +
      componenti.map(c => {
        const av = avMap[c.id] || {};
        const consumabile = !!c.consumabile;
        const dispRaw = av.quantita_disponibile ?? null;
        const dispDisplay = dispRaw === null ? '—'
          : isQual(c.unita_misura) ? qualLabel(dispRaw)
          : `${dispRaw} ${esc(c.unita_misura||'pz')}`;
        return `
          <tr>
            <td>${esc(c.nome)}</td>
            <td style="font-size:12px;color:#64748b">${esc(c.famiglia||'—')}</td>
            <td>${isQual(c.unita_misura) ? qualLabel(c.quantita_necessaria) : `${c.quantita_necessaria} ${esc(c.unita_misura||'pz')}`}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <span>${dispDisplay}</span>
                <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;white-space:nowrap"
                  onclick="showCompMagazzini(${c.id},this)">Dove</button>
              </div>
            </td>
            <td style="text-align:center">
              ${userCanEdit
                ? `<input type="checkbox" ${consumabile ? 'checked' : ''}
                     onchange="toggleConsumabile(${id},${c.id},${c.quantita_necessaria},this)"
                     style="width:15px;height:15px;cursor:pointer" title="Consumabile">`
                : (consumabile ? 'Sì' : 'No')}
            </td>
            <td class="${av.disponibile?'avail-ok':'avail-no'}">${av.disponibile !== undefined ? (av.disponibile?'&#10003; Ok':'&#10007; Mancante') : '—'}</td>
            ${userCanEdit ? `<td><button class="btn btn-danger btn-sm" onclick="removeCompEsp(${id},${c.id})">—</button></td>` : ''}
          </tr>
        `;
      }).join('') +
      `</tbody></table></div>`;
  } else {
    html += `<div class="empty">Nessun componente aggiunto a questa esperienza.</div>`;
  }

  if (userCanEdit) {
    html += `<div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="esp-add-comp" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;font-family:var(--font)" onchange="_espAddQtyToggle(${id})">
        ${allComponenti.length
          ? allComponenti.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('')
          : '<option value="">Nessun componente disponibile</option>'}
      </select>
      <input type="number" id="esp-add-qty" value="1" min="1" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:7px;font-size:13px">
      <select id="esp-add-qty-qual" style="display:none;padding:8px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;font-family:var(--font)">
        <option value="100">Abbondante</option><option value="50">Molto</option>
        <option value="20" selected>Sufficiente</option><option value="10">Poco</option>
        <option value="5">Scarso</option>
      </select>
      <button class="btn btn-primary" onclick="addCompEsp(${id})">+ Aggiungi</button>
    </div>`;
  }

  document.getElementById("esp-detail-body").innerHTML = html;
  openModal("modal-esp-detail");
}

function closeEspDetail() {
  closeModal("modal-esp-detail");
}

function _espAddQtyToggle() {
  const sel = document.getElementById("esp-add-comp");
  const comp = allComponenti.find(c => c.id === parseInt(sel?.value));
  const q = isQual(comp?.unita_misura);
  const inp = document.getElementById("esp-add-qty");
  const qSel = document.getElementById("esp-add-qty-qual");
  if (inp) inp.style.display = q ? 'none' : '';
  if (qSel) qSel.style.display = q ? '' : 'none';
}

async function addCompEsp(espId) {
  const sel = document.getElementById("esp-add-comp");
  const componente_id = parseInt(sel.value);
  if (!componente_id) { showAlert("Seleziona un componente", "error"); return; }
  const comp = allComponenti.find(c => c.id === componente_id);
  const q = isQual(comp?.unita_misura);
  const quantita_necessaria = q
    ? parseInt(document.getElementById("esp-add-qty-qual").value) || 20
    : parseInt(document.getElementById("esp-add-qty").value) || 1;
  const res = await fetch(`/api/esperienze/${espId}/componenti`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ componente_id, quantita_necessaria })
  });
  if (res.ok) {
    openEspDetail(espId);
  } else {
    const d = await res.json();
    showAlert(d.error || "Errore aggiunta componente", "error");
  }
}

async function removeCompEsp(espId, compId) {
  const res = await fetch(`/api/esperienze/${espId}/componenti/${compId}`, { method: "DELETE" });
  if (res.ok) openEspDetail(espId);
}

async function showCompMagazzini(compId, btn) {
  // Toggle: close if already open for this component
  const existing = document.getElementById("dove-popover");
  if (existing) {
    const wasThisComp = existing.dataset.forComp == compId;
    existing.remove();
    if (wasThisComp) return;
  }

  const comp = allComponenti.find(c => c.id === compId);
  const unit = comp?.unita_misura || 'pz';

  const res = await fetch(`/api/componenti/${compId}`);
  if (!res.ok) return;
  const data = await res.json();
  const magazzini = (data.magazzini || []).filter(m => m.quantita > 0);

  const rows = magazzini.map(m => {
    const qtyDisplay = isQual(unit) ? qualLabel(m.quantita) : `${m.quantita} ${esc(unit)}`;
    return `<tr><td style="padding:2px 8px;font-weight:500">${esc(m.nome)}</td><td style="padding:2px 8px;text-align:right;color:#374151">${qtyDisplay}</td></tr>`;
  });

  const popover = document.createElement("div");
  popover.id = "dove-popover";
  popover.dataset.forComp = compId;
  popover.style.cssText = "position:absolute;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px 0;min-width:200px;font-size:13px";

  popover.innerHTML = rows.length
    ? `<div style="padding:4px 12px 6px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;margin-bottom:4px">Presente in:</div><table style="width:100%">${rows.join("")}</table>`
    : `<div style="padding:6px 12px;color:#6b7280;font-style:italic">Nessun magazzino con scorte</div>`;

  document.body.appendChild(popover);

  const rect = btn.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
  popover.style.left = `${rect.left + window.scrollX}px`;

  setTimeout(() => {
    document.addEventListener("click", function handler(e) {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.remove();
        document.removeEventListener("click", handler);
      }
    });
  }, 0);
}

async function toggleConsumabile(espId, compId, qty, checkbox) {
  const consumabile = checkbox.checked;
  const res = await fetch(`/api/esperienze/${espId}/componenti`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ componente_id: compId, quantita_necessaria: qty, consumabile })
  });
  if (!res.ok) {
    checkbox.checked = !consumabile;
    const d = await res.json();
    showAlert(d.error || "Errore", "error");
  } else {
    openEspDetail(espId);
  }
}

async function checkDisponibilita(espId) {
  const res = await fetch(`/api/esperienze/${espId}/disponibilita`);
  if (!res.ok) { showAlert("Errore verifica disponibilità", "error"); return; }
  const data = await res.json();
  const ok = data.tutto_disponibile;
  showAlert(ok ? "Tutti i componenti sono disponibili." : "Alcuni componenti mancanti — vedi il dettaglio.", ok ? "success" : "warning");
}

// ─── DICHIARA SVOLTA ──────────────────────────────────

async function openSvolgiModal(espId) {
  svolgiEspId = espId;
  svolgiData = [];

  const res = await fetch(`/api/esperienze/${espId}`);
  if (!res.ok) { showAlert("Errore caricamento esperienza", "error"); return; }
  const esp = await res.json();

  const consumabili = (esp.componenti || []).filter(c => c.consumabile);
  if (!consumabili.length) {
    showAlert("Nessun componente consumabile da scalare.", "warning");
    return;
  }

  // Default datetime: now
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById("svolgi-datetime").value = localNow;

  // Fetch stock locations for each consumable component
  for (const c of consumabili) {
    const rComp = await fetch(`/api/componenti/${c.id}`);
    if (!rComp.ok) continue;
    const compData = await rComp.json();
    svolgiData.push({
      compId: c.id,
      nome: c.nome,
      qty: c.quantita_necessaria,
      unitaMisura: c.unita_misura || 'pz',
      magazzini: (compData.magazzini || []).sort((a, b) => b.quantita - a.quantita)
    });
  }

  // Render modal body
  let html = svolgiData.map(item => {
    const hasMag = item.magazzini.length > 0;
    const opts = hasMag
      ? item.magazzini.map(m => `<option value="${m.id}">${esc(m.nome)} — disponibili: ${m.quantita} ${esc(item.unitaMisura)}</option>`).join('')
      : '<option value="">— Nessuno stock disponibile —</option>';
    return `
      <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;gap:8px;flex-wrap:wrap">
          <strong style="font-size:13px">${esc(item.nome)}</strong>
          <span style="font-size:12px;color:var(--text-soft);white-space:nowrap">da scalare: ${item.qty} ${esc(item.unitaMisura)}</span>
        </div>
        <div class="form-group">
          <label>Magazzino da cui prelevare</label>
          <select id="svolgi-mag-${item.compId}" ${!hasMag ? 'disabled' : ''}
            style="padding:8px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);background:${hasMag?'var(--surface-alt)':'#fee2e2'};width:100%">
            ${opts}
          </select>
          ${!hasMag ? '<div style="font-size:11px;color:#ef4444;margin-top:4px">Nessun magazzino con stock disponibile.</div>' : ''}
        </div>
      </div>`;
  }).join('');

  document.getElementById("svolgi-body").innerHTML = html || '<div class="empty">Nessun componente consumabile.</div>';
  openModal("modal-svolgi");
}

async function confirmSvolgi() {
  const dtVal = document.getElementById("svolgi-datetime").value;
  const dtFormatted = dtVal ? new Date(dtVal).toLocaleString('it-IT') : 'data non specificata';

  const avvisi = [];

  for (const item of svolgiData) {
    const sel = document.getElementById(`svolgi-mag-${item.compId}`);
    if (!sel || !sel.value) {
      avvisi.push(`${item.nome}: nessun magazzino selezionato`);
      continue;
    }
    const magId = parseInt(sel.value);
    const mag = item.magazzini.find(m => m.id === magId);
    if (!mag) { avvisi.push(`${item.nome}: magazzino non trovato`); continue; }

    if (mag.quantita < item.qty) {
      avvisi.push(`${item.nome}: stock insufficiente (disp. ${mag.quantita}, richiesti ${item.qty} ${item.unitaMisura})`);
    }
    const newQty = Math.max(0, mag.quantita - item.qty);
    await putStock(magId, item.compId, newQty, mag.quantita_minima, mag.is_scorta);
  }

  closeModal("modal-svolgi");

  if (avvisi.length) {
    showAlert(`Svolta registrata (${dtFormatted}) con avvisi: ${avvisi.join('; ')}`, "warning");
  } else {
    showAlert(`Esperienza dichiarata svolta il ${dtFormatted}. Stock aggiornato.`, "success");
  }

  openEspDetail(svolgiEspId);
}

// ─── LISTA ACQUISTI ───────────────────────────────────

async function loadListaAcquisti() {
  const res = await fetch("/api/lista-acquisti");
  const data = await res.json();
  const lista = data.lista || [];
  const tbody = document.getElementById("acquisti-tbody");
  const empty = document.getElementById("acquisti-empty");

  if (!lista.length) {
    tbody.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  tbody.innerHTML = lista.map(r => {
    const dataAttr = `data-comp-id="${r.componente_id}" data-comp-nome="${esc(r.nome)}" `
      + `data-mag-id="${r.magazzino_id}" data-mag-nome="${esc(r.magazzino_nome)}" `
      + `data-quantita="${r.quantita}" data-min="${r.quantita_minima}" `
      + `data-da-acq="${r.da_acquistare}" data-scorta="${r.is_scorta?'1':'0'}" `
      + `data-unita="${esc(r.unita_misura||'pz')}"`;
    return `
    <tr>
      <td><strong>${esc(r.nome)}</strong></td>
      <td>${esc(r.famiglia||'—')}</td>
      <td>${esc(r.magazzino_nome)}</td>
      <td style="font-size:12px;color:#64748b">${[r.ambiente,r.sezione,r.cassetto].filter(Boolean).join(' / ')||'—'}</td>
      <td style="color:#ef4444;font-weight:600">${isQual(r.unita_misura) ? qualLabel(r.quantita) : r.quantita}</td>
      <td>${isQual(r.unita_misura) ? qualLabel(r.quantita_minima) : r.quantita_minima}</td>
      <td style="color:#d97706;font-weight:700">${isQual(r.unita_misura) ? '→ ' + qualLabel(r.quantita_minima) : '+' + r.da_acquistare}</td>
      <td>${isQual(r.unita_misura) ? 'stima' : esc(r.unita_misura||'pz')}</td>
      <td><button class="btn btn-success btn-sm" ${dataAttr} onclick="openAcquistatoModal(this)">Acquistato</button></td>
    </tr>`;
  }).join('');
}

// stato corrente del modal acquistato
let _acqState = {};

function openAcquistatoModal(btn) {
  const d = btn.dataset;
  _acqState = {
    compId:    parseInt(d.compId),
    compNome:  d.compNome,
    magId:     parseInt(d.magId),
    quantita:  parseInt(d.quantita),
    min:       parseInt(d.min),
    daAcq:     parseInt(d.daAcq),
    scorta:    d.scorta === '1',
    unita:     d.unita
  };

  document.getElementById("acq-comp-nome").textContent = _acqState.compNome;
  const _acqQ = isQual(_acqState.unita);
  document.getElementById("acq-quantita").style.display = _acqQ ? 'none' : '';
  document.getElementById("acq-quantita-qual").style.display = _acqQ ? '' : 'none';
  if (_acqQ) { setQualSelect('acq-quantita-qual', _acqState.daAcq); }
  else { document.getElementById("acq-quantita").value = _acqState.daAcq; }
  document.getElementById("acq-unita").textContent = _acqQ ? '' : _acqState.unita;
  document.getElementById("acq-stock-info").style.display = "none";

  // popola select magazzini
  const sel = document.getElementById("acq-magazzino-select");
  sel.innerHTML = allMagazzini.map(m =>
    `<option value="${m.id}" ${m.id === _acqState.magId ? 'selected' : ''}>${esc(m.nome)}</option>`
  ).join('');

  // aggiorna info stock alla selezione magazzino
  sel.onchange = () => _acqUpdateStockInfo(parseInt(sel.value));
  _acqUpdateStockInfo(_acqState.magId);

  openModal("modal-acquistato");
}

async function _acqUpdateStockInfo(magId) {
  const info = document.getElementById("acq-stock-info");
  // cerca stock attuale per quel magazzino
  const res = await fetch(`/api/magazzini/${magId}/componenti`);
  if (!res.ok) { info.style.display = "none"; return; }
  const data = await res.json();
  const found = (data.componenti || []).find(c => c.id === _acqState.compId);
  if (found) {
    info.style.display = "";
    const _acqQ = isQual(_acqState.unita);
    const fmtQty = (n) => _acqQ ? qualLabel(n) : `${n} ${_acqState.unita}`;
    const getInputVal = () => _acqQ
      ? parseInt(document.getElementById("acq-quantita-qual").value || 0)
      : parseInt(document.getElementById("acq-quantita").value || 0);
    const updateInfo = () => {
      const v = getInputVal();
      const after = _acqQ ? v : found.quantita + v;
      info.textContent = `Stock attuale: ${fmtQty(found.quantita)}  →  dopo: ${fmtQty(after)}`;
    };
    updateInfo();
    document.getElementById(_acqQ ? "acq-quantita-qual" : "acq-quantita").oninput = updateInfo;
    document.getElementById(_acqQ ? "acq-quantita-qual" : "acq-quantita").onchange = updateInfo;
    _acqState._currentStockInMag = found.quantita;
    _acqState._currentMin = found.quantita_minima;
    _acqState._currentScorta = found.is_scorta;
  } else {
    info.style.display = "";
    info.textContent = `Componente non ancora presente in questo magazzino. Verrà creato con la quantità inserita.`;
    _acqState._currentStockInMag = 0;
    _acqState._currentMin = _acqState.min;
    _acqState._currentScorta = _acqState.scorta;
    document.getElementById("acq-quantita").oninput = null;
  }
}

async function confirmAcquistato() {
  const _acqQ = isQual(_acqState.unita);
  const qty = _acqQ
    ? parseInt(document.getElementById("acq-quantita-qual").value)
    : parseInt(document.getElementById("acq-quantita").value);
  if (qty == null || (!_acqQ && qty < 1)) { showAlert("Inserisci una quantità valida.", "warning"); return; }
  const magId = parseInt(document.getElementById("acq-magazzino-select").value);
  const newQty = _acqQ ? qty : ((_acqState._currentStockInMag || 0) + qty);
  const min    = _acqQ ? 0 : (_acqState._currentMin ?? _acqState.min);
  const scorta = _acqState._currentScorta ?? _acqState.scorta;

  const res = await fetch(`/api/magazzini/${magId}/componenti/${_acqState.compId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantita: newQty, quantita_minima: min, is_scorta: scorta })
  });
  if (!res.ok) { showAlert("Errore durante l'aggiornamento dello stock.", "danger"); return; }

  closeModal("modal-acquistato");
  const displayQty = _acqQ ? qualLabel(newQty) : `${newQty} ${_acqState.unita}`;
  showAlert(`Stock aggiornato: ${_acqState.compNome} → ${displayQty}`, "success");
  loadListaAcquisti();
}

function exportListaAcquisti() {
  const rows = document.querySelectorAll("#acquisti-tbody tr");
  if (!rows.length) { showAlert("Nessun dato da esportare", "warning"); return; }

  const headers = ["Componente","Famiglia","Magazzino","Posizione","Quantità attuale","Minimo","Da acquistare","Unità"];
  const lines = [headers.join(";")];
  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll("td")).slice(0, 8).map(td => `"${td.textContent.trim().replace(/"/g,'""')}"`);
    lines.push(cells.join(";"));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lista_acquisti_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UTENTI ───────────────────────────────────────────

async function loadUtenti() {
  // Pulsante "+ Nuovo utente": solo ADMIN (TECNICO gestisce utenti tramite approvazione)
  const btnNuovoUtente = document.querySelector('#section-utenti .btn-primary[onclick="openModalRegister()"]');
  if (btnNuovoUtente) btnNuovoUtente.style.display = currentUser?.ruolo === "ADMIN" ? "" : "none";

  const [rAll, rPend] = await Promise.all([fetch("/api/users"), fetch("/api/users/pending")]);

  if (rAll.ok) {
    const data = await rAll.json();
    _allUsers = data.users || [];
    document.getElementById("users-tbody").innerHTML = _allUsers.map(u => {
      const nomeCompleto = [u.nome, u.cognome].filter(Boolean).join(' ') || '—';
      const isSelf = String(u.id) === String(currentUser.id);
      const isAdmin = currentUser.ruolo === 'ADMIN';
      const isTecnico = currentUser.ruolo === 'TECNICO';
      // TECNICO può agire solo su DOCENTE; ADMIN su tutti tranne se stesso per delete
      const canActOn = isAdmin || (isTecnico && u.ruolo === 'DOCENTE');
      const ruoloCell = isAdmin && !isSelf
        ? `<select onchange="changeUserRuolo(${u.id}, this)"
            style="padding:4px 8px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;font-family:var(--font);background:var(--surface)">
            <option value="DOCENTE"  ${u.ruolo==='DOCENTE' ?'selected':''}>Docente</option>
            <option value="TECNICO"  ${u.ruolo==='TECNICO' ?'selected':''}>Tecnico</option>
            <option value="ADMIN"    ${u.ruolo==='ADMIN'   ?'selected':''}>Admin</option>
          </select>`
        : `<span class="badge ruolo-${u.ruolo.toLowerCase()}">${u.ruolo}</span>`;
      return `
      <tr>
        <td>${esc(nomeCompleto)}</td>
        <td>${esc(u.email)}</td>
        <td>${ruoloCell}</td>
        <td>${u.approvato ? '<span style="color:#10b981">&#10003; Attivo</span>' : '<span style="color:#f59e0b">In attesa</span>'}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          ${canActOn ? `<button class="btn btn-secondary btn-sm" onclick="sendResetLink(${u.id})">Reset password</button>` : ''}
          ${canActOn && !isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Elimina</button>` : ''}
        </td>
      </tr>`
    }).join('');
  }

  if (rPend.ok) {
    const data = await rPend.json();
    const pending = data.users || [];
    const card = document.getElementById("pending-card");
    if (pending.length) {
      card.style.display = "";
      document.getElementById("pending-tbody").innerHTML = pending.map(u => {
        const nomeCompleto = [u.nome, u.cognome].filter(Boolean).join(' ') || '—';
        const ruoloDefault = u.ruolo || 'DOCENTE';
        return `
        <tr>
          <td>${esc(nomeCompleto)}</td>
          <td>${esc(u.email)}</td>
          <td>
            <select id="pending-ruolo-${u.id}"
              style="padding:4px 8px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;font-family:var(--font);background:var(--surface)">
              <option value="DOCENTE" ${ruoloDefault==='DOCENTE'?'selected':''}>Docente</option>
              <option value="TECNICO" ${ruoloDefault==='TECNICO'?'selected':''}>Tecnico</option>
              <option value="ADMIN"   ${ruoloDefault==='ADMIN'  ?'selected':''}>Admin</option>
            </select>
          </td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-success btn-sm" onclick="approveUser(${u.id})">&#10003; Approva</button>
            <button class="btn btn-danger btn-sm" onclick="rejectUser(${u.id}, '${esc(u.email)}')">&#10007; Rifiuta</button>
          </td>
        </tr>`
      }).join('');
    } else {
      // Mostra sempre la card con messaggio vuoto (così non sembra che la pagina non abbia caricato)
      card.style.display = "";
      document.getElementById("pending-tbody").innerHTML = `
        <tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-faint);font-size:13px">
          ✓ Nessuna richiesta di registrazione in attesa di approvazione
        </td></tr>`;
    }
  }
}

async function approveUser(id) {
  const sel = document.getElementById(`pending-ruolo-${id}`);
  const ruolo = sel ? sel.value : null;
  const res = await fetch(`/api/users/${id}/approva`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ ruolo })
  });
  const data = await res.json();
  if (res.ok) { showAlert("Utente approvato", "success"); loadUtenti(); }
  else showAlert(data.error, "error");
}

async function changeUserRuolo(userId, sel) {
  const ruolo = sel.value;
  const res = await fetch(`/api/users/${userId}/ruolo`, {
    method: "PUT", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ ruolo })
  });
  const data = await res.json();
  if (res.ok) showAlert(`Ruolo aggiornato a ${ruolo}`, "success");
  else { showAlert(data.error || "Errore aggiornamento ruolo", "error"); loadUtenti(); }
}

async function rejectUser(id, email) {
  if (!confirm(`Rifiutare la richiesta di registrazione di ${email}?`)) return;
  const res = await fetch(`/api/users/${id}/rifiuta`, { method: "POST" });
  const data = await res.json();
  if (res.ok) { showAlert("Richiesta rifiutata", "success"); loadUtenti(); }
  else showAlert(data.error || "Errore", "error");
}

async function deleteUser(id) {
  if (!confirm("Eliminare questo utente?")) return;
  const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (res.ok) { showAlert("Utente eliminato"); loadUtenti(); }
  else showAlert(data.error, "error");
}

let _resetTargetId = null;
let _allUsers = [];

function sendResetLink(userId) {
  _resetTargetId = userId;
  const user = _allUsers.find(u => u.id === userId);
  const email = user ? user.email : `utente #${userId}`;
  document.getElementById("reset-confirm-email").textContent = email;
  openModal("modal-reset-confirm");
}

async function confirmSendReset() {
  if (!_resetTargetId) return;
  const btn = document.getElementById("reset-confirm-btn");
  btn.disabled = true;
  btn.textContent = "Invio…";
  const res = await fetch(`/api/users/${_resetTargetId}/reset-token`, { method: "POST" });
  const data = await res.json();
  btn.disabled = false;
  btn.textContent = "Invia mail";
  closeModal("modal-reset-confirm");
  if (res.ok) showAlert(data.message, "success");
  else showAlert(data.error || "Errore invio email", "error");
  _resetTargetId = null;
}

async function registerUser() {
  const nome    = document.getElementById("reg-nome").value.trim();
  const cognome = document.getElementById("reg-cognome").value.trim();
  const email   = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const ruolo   = document.getElementById("reg-ruolo").value;

  const res = await fetch("/api/register", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ nome, cognome, email, password, ruolo })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert(data.message, "success");
    closeModal("modal-register");
    loadUtenti();
  } else showAlert(data.error, "error");
}

function openModalRegister() {
  ["reg-nome","reg-cognome","reg-email","reg-password"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("reg-ruolo").value = "DOCENTE";
  openModal("modal-register");
}

// ─── LOGS ─────────────────────────────────────────────

let _allLogs = [];

// Mappa azione → etichetta italiana, categoria, colori badge
const ACTION_META = {
  // Accessi
  LOGIN:                  { label: "Accesso",               cat: "Auth",        bg: "#dbeafe", col: "#1d4ed8" },
  LOGOUT:                 { label: "Uscita",                cat: "Auth",        bg: "#f1f5f9", col: "#475569" },
  CHANGE_PASSWORD:        { label: "Cambio password",       cat: "Auth",        bg: "#ede9fe", col: "#6d28d9" },
  RESET_PASSWORD:         { label: "Reset password",        cat: "Auth",        bg: "#ede9fe", col: "#6d28d9" },
  RESET_TOKEN:            { label: "Link reset inviato",    cat: "Auth",        bg: "#fef3c7", col: "#92400e" },
  // Utenti
  CREATE_USER:            { label: "Utente creato",         cat: "Utenti",      bg: "#d1fae5", col: "#065f46" },
  DELETE_USER:            { label: "Utente eliminato",      cat: "Utenti",      bg: "#fee2e2", col: "#991b1b" },
  APPROVE_USER:           { label: "Utente approvato",      cat: "Utenti",      bg: "#d1fae5", col: "#065f46" },
  REJECT_USER:            { label: "Registrazione rifiutata", cat: "Utenti",    bg: "#fee2e2", col: "#991b1b" },
  CHANGE_ROLE:            { label: "Ruolo modificato",      cat: "Utenti",      bg: "#fef3c7", col: "#92400e" },
  // Componenti
  CREATE_COMPONENTE:      { label: "Componente creato",     cat: "Componenti",  bg: "#d1fae5", col: "#065f46" },
  UPDATE_COMPONENTE:      { label: "Componente modificato", cat: "Componenti",  bg: "#dbeafe", col: "#1d4ed8" },
  DELETE_COMPONENTE:      { label: "Componente eliminato",  cat: "Componenti",  bg: "#fee2e2", col: "#991b1b" },
  // Etichette
  CREATE_TAG:             { label: "Etichetta creata",      cat: "Etichette",   bg: "#d1fae5", col: "#065f46" },
  UPDATE_TAG:             { label: "Etichetta modificata",  cat: "Etichette",   bg: "#dbeafe", col: "#1d4ed8" },
  DELETE_TAG:             { label: "Etichetta eliminata",   cat: "Etichette",   bg: "#fee2e2", col: "#991b1b" },
  ADD_TAG_COMPONENTE:     { label: "Tag assegnato",         cat: "Etichette",   bg: "#dbeafe", col: "#1d4ed8" },
  REMOVE_TAG_COMPONENTE:  { label: "Tag rimosso",           cat: "Etichette",   bg: "#fef3c7", col: "#92400e" },
  // Magazzini
  CREATE_MAGAZZINO:       { label: "Magazzino creato",      cat: "Magazzini",   bg: "#d1fae5", col: "#065f46" },
  UPDATE_MAGAZZINO:       { label: "Magazzino modificato",  cat: "Magazzini",   bg: "#dbeafe", col: "#1d4ed8" },
  DELETE_MAGAZZINO:       { label: "Magazzino eliminato",   cat: "Magazzini",   bg: "#fee2e2", col: "#991b1b" },
  // Stock
  SET_STOCK:              { label: "Stock aggiunto",        cat: "Stock",       bg: "#d1fae5", col: "#065f46" },
  UPDATE_STOCK:           { label: "Stock modificato",      cat: "Stock",       bg: "#dbeafe", col: "#1d4ed8" },
  REMOVE_STOCK:           { label: "Stock rimosso",         cat: "Stock",       bg: "#fee2e2", col: "#991b1b" },
  // Esperienze
  CREATE_ESPERIENZA:      { label: "Esperienza creata",     cat: "Esperienze",  bg: "#d1fae5", col: "#065f46" },
  UPDATE_ESPERIENZA:      { label: "Esperienza modificata", cat: "Esperienze",  bg: "#dbeafe", col: "#1d4ed8" },
  DELETE_ESPERIENZA:      { label: "Esperienza eliminata",  cat: "Esperienze",  bg: "#fee2e2", col: "#991b1b" },
  ADD_COMP_ESPERIENZA:    { label: "Comp. aggiunto a esp.", cat: "Esperienze",  bg: "#dbeafe", col: "#1d4ed8" },
  REMOVE_COMP_ESPERIENZA: { label: "Comp. rimosso da esp.", cat: "Esperienze",  bg: "#fef3c7", col: "#92400e" },
};

function _logMeta(azione) {
  return ACTION_META[azione] || { label: azione, cat: "—", bg: "#f1f5f9", col: "#475569" };
}

async function loadLogs() {
  const res = await fetch("/api/logs?limit=2000");
  if (!res.ok) return;
  const data = await res.json();
  _allLogs = data.logs || [];
  renderLogs();
}

function clearLogFilters() {
  ["log-filter-email","log-filter-da","log-filter-a"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const cat = document.getElementById("log-filter-cat"); if (cat) cat.value = "";
  renderLogs();
}

function renderLogs() {
  const emailF = (document.getElementById("log-filter-email")?.value || "").trim().toLowerCase();
  const catF   =  document.getElementById("log-filter-cat")?.value   || "";
  const daF    =  document.getElementById("log-filter-da")?.value    || "";
  const aF     =  document.getElementById("log-filter-a")?.value     || "";

  let filtered = _allLogs;
  if (emailF) filtered = filtered.filter(l => (l.user_email||"").toLowerCase().includes(emailF));
  if (catF)   filtered = filtered.filter(l => _logMeta(l.azione).cat === catF);
  if (daF)    filtered = filtered.filter(l => l.timestamp && l.timestamp.slice(0,10) >= daF);
  if (aF)     filtered = filtered.filter(l => l.timestamp && l.timestamp.slice(0,10) <= aF);

  const countEl = document.getElementById("logs-count");
  if (countEl) {
    countEl.textContent = filtered.length === _allLogs.length
      ? `${_allLogs.length} eventi`
      : `${filtered.length} di ${_allLogs.length} eventi`;
  }

  const tbody = document.getElementById("logs-tbody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">Nessun risultato per i filtri applicati.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const meta = _logMeta(l.azione);
    const badge = `<span style="display:inline-block;padding:2px 10px;border-radius:100px;font-size:11px;font-weight:700;background:${meta.bg};color:${meta.col};white-space:nowrap">${esc(meta.label)}</span>`;
    const catBadge = `<span style="font-size:11px;color:var(--text-faint);white-space:nowrap">${esc(meta.cat)}</span>`;

    // Prova a interpretare i dettagli come JSON (log stock)
    let parsed = null;
    try { parsed = JSON.parse(l.dettagli || ""); } catch(e) {}

    let dettagliHtml = "";
    let ripristinaBtn = "";

    if (parsed && typeof parsed === "object") {
      const u = esc(parsed.unita || "pz");
      const cn = esc(parsed.comp_nome || "");
      const mn = esc(parsed.mag_nome  || "");

      if (l.azione === "UPDATE_STOCK") {
        const changed = parsed.old_qty !== parsed.new_qty
          || parsed.old_min !== parsed.new_min
          || parsed.old_scorta !== parsed.new_scorta;
        dettagliHtml = `
          <div style="font-size:12px;line-height:1.7">
            <strong>${cn}</strong> &mdash; <em>${mn}</em><br>
            Qtà: <span style="color:#ef4444;font-weight:600">${parsed.old_qty}</span>
            &rarr; <span style="color:#10b981;font-weight:600">${parsed.new_qty}</span> ${u}
            ${parsed.old_min !== parsed.new_min ? `&nbsp;·&nbsp;Min: ${parsed.old_min}&rarr;${parsed.new_min}` : ""}
          </div>`;
        ripristinaBtn = `<button class="btn btn-secondary btn-sm"
          onclick="ripristinaStock(${parsed.mag_id},${parsed.comp_id},${parsed.old_qty},${parsed.old_min},${parsed.old_scorta})"
          title="Ripristina i valori precedenti">↩ Ripristina</button>`;
      } else if (l.azione === "SET_STOCK") {
        dettagliHtml = `<div style="font-size:12px;line-height:1.7"><strong>${cn}</strong> &mdash; <em>${mn}</em><br>
          Qtà: <span style="font-weight:600;color:#10b981">${parsed.qty}</span> ${u} &nbsp;·&nbsp; Min: ${parsed.min}</div>`;
      } else if (l.azione === "REMOVE_STOCK") {
        dettagliHtml = `<div style="font-size:12px;line-height:1.7"><strong>${cn}</strong> rimosso da <em>${mn}</em><br>
          Era: <span style="color:#ef4444;font-weight:600">${parsed.old_qty}</span> ${u}</div>`;
        ripristinaBtn = `<button class="btn btn-secondary btn-sm"
          onclick="ripristinaStock(${parsed.mag_id},${parsed.comp_id},${parsed.old_qty},${parsed.old_min},${parsed.old_scorta})"
          title="Ripristina il componente nel magazzino">↩ Ripristina</button>`;
      }
    } else {
      dettagliHtml = `<span style="color:var(--text-soft);font-size:12px">${esc(l.dettagli||"")}</span>`;
    }

    // Formato timestamp leggibile: "16/05/2026 14:32"
    let ts = "—";
    if (l.timestamp) {
      const d = new Date(l.timestamp.replace(" ", "T"));
      if (!isNaN(d)) {
        ts = d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"});
      } else ts = l.timestamp.slice(0,16);
    }

    return `<tr class="log-row">
      <td style="white-space:nowrap;font-size:12px;color:var(--text-soft)">${esc(ts)}</td>
      <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.user_email||'')}">${esc(l.user_email||"—")}</td>
      <td>${catBadge}</td>
      <td>${badge}</td>
      <td>${dettagliHtml}</td>
      <td style="white-space:nowrap">${ripristinaBtn}</td>
    </tr>`;
  }).join("");
}

async function ripristinaStock(magId, compId, qty, min, scorta) {
  if (!confirm(`Ripristinare lo stock a quantità=${qty}, minimo=${min}?`)) return;
  const res = await fetch(`/api/magazzini/${magId}/componenti/${compId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantita: qty, quantita_minima: min, is_scorta: scorta })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert("Stock ripristinato con successo", "success");
    loadLogs();
  } else {
    showAlert(data.error || "Errore durante il ripristino", "error");
  }
}

// ─── EXPORT LOGS ──────────────────────────────────────

function exportLogs() {
  // Esporta i log attualmente filtrati (visibili a schermo)
  const emailF = (document.getElementById("log-filter-email")?.value || "").trim().toLowerCase();
  const catF   =  document.getElementById("log-filter-cat")?.value   || "";
  const daF    =  document.getElementById("log-filter-da")?.value    || "";
  const aF     =  document.getElementById("log-filter-a")?.value     || "";

  let filtered = _allLogs;
  if (emailF) filtered = filtered.filter(l => (l.user_email||"").toLowerCase().includes(emailF));
  if (catF)   filtered = filtered.filter(l => _logMeta(l.azione).cat === catF);
  if (daF)    filtered = filtered.filter(l => l.timestamp && l.timestamp.slice(0,10) >= daF);
  if (aF)     filtered = filtered.filter(l => l.timestamp && l.timestamp.slice(0,10) <= aF);

  if (!filtered.length) { showAlert("Nessun log da esportare.", "warning"); return; }

  const q = s => '"' + String(s||"").replace(/"/g,'""') + '"';

  let parsed = null;
  const lines = ["Data/Ora,Utente,Categoria,Azione,Dettagli"];
  filtered.forEach(l => {
    const meta = _logMeta(l.azione);
    let dettagliTxt = l.dettagli || "";
    try {
      const p = JSON.parse(dettagliTxt);
      if (p && typeof p === "object") {
        if (l.azione === "UPDATE_STOCK")
          dettagliTxt = `${p.comp_nome} in ${p.mag_nome}: ${p.old_qty}→${p.new_qty} ${p.unita}`;
        else if (l.azione === "SET_STOCK")
          dettagliTxt = `${p.comp_nome} in ${p.mag_nome}: qty=${p.qty} ${p.unita} min=${p.min}`;
        else if (l.azione === "REMOVE_STOCK")
          dettagliTxt = `${p.comp_nome} rimosso da ${p.mag_nome} (era ${p.old_qty} ${p.unita})`;
      }
    } catch(e) {}
    lines.push([q(l.timestamp), q(l.user_email), q(meta.cat), q(meta.label), q(dettagliTxt)].join(","));
  });

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `log_magazzino_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── IMPORT ───────────────────────────────────────────

function openImportModal() {
  document.getElementById("import-file-input").value = "";
  const res = document.getElementById("import-result");
  res.style.display = "none";
  res.textContent = "";
  openModal("modal-import");
}

function downloadSampleImport() {
  const sample = {
    magazzini: [
      { nome: "Laboratorio Elettronica A", descrizione: "Magazzino principale lab elettronica", ambiente: "Edificio A - Piano 1", sezione: "Scaffale 1", cassetto: "" },
      { nome: "Laboratorio Elettronica B", descrizione: "Magazzino secondario lab elettronica", ambiente: "Edificio A - Piano 1", sezione: "Scaffale 2", cassetto: "" },
      { nome: "Laboratorio Fisica", descrizione: "Magazzino laboratorio di fisica", ambiente: "Edificio B - Piano 2", sezione: "Armadio 1", cassetto: "" },
      { nome: "Deposito Strumenti", descrizione: "Deposito centrale strumenti di misura", ambiente: "Edificio A - Piano 0", sezione: "Armadio Grande", cassetto: "" },
      { nome: "Aula 3B", descrizione: "Piccolo deposito aula 3B", ambiente: "Edificio C", sezione: "", cassetto: "Cassetto 2" },
      { nome: "Aula 4A", descrizione: "Deposito aula 4A", ambiente: "Edificio C", sezione: "", cassetto: "Cassetto 1" },
      { nome: "Magazzino Consumabili", descrizione: "Scorte di componenti consumabili", ambiente: "Edificio A - Piano 0", sezione: "Scaffale C", cassetto: "" }
    ],
    componenti: [
      // ── Resistenze ──
      { nome: "Resistenza 100Ω", descrizione: "Resistore 100Ω 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 200, quantita_minima: 40, is_scorta: false }, { magazzino_nome: "Magazzino Consumabili", quantita: 500, quantita_minima: 100, is_scorta: true }] },
      { nome: "Resistenza 220Ω", descrizione: "Resistore 220Ω 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 150, quantita_minima: 30, is_scorta: false }] },
      { nome: "Resistenza 470Ω", descrizione: "Resistore 470Ω 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 120, quantita_minima: 20, is_scorta: false }] },
      { nome: "Resistenza 1kΩ", descrizione: "Resistore 1kΩ 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 180, quantita_minima: 30, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica B", quantita: 80, quantita_minima: 15, is_scorta: false }] },
      { nome: "Resistenza 10kΩ", descrizione: "Resistore 10kΩ 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 100, quantita_minima: 20, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica B", quantita: 60, quantita_minima: 10, is_scorta: false }] },
      { nome: "Resistenza 100kΩ", descrizione: "Resistore 100kΩ 1/4W carbonio", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Resistenza", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 80, quantita_minima: 15, is_scorta: false }] },
      { nome: "Potenziometro 10kΩ", descrizione: "Potenziometro lineare 10kΩ", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Potenziometro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 25, quantita_minima: 5, is_scorta: false }] },
      // ── Condensatori ──
      { nome: "Condensatore 100nF", descrizione: "Condensatore ceramico 100nF 50V", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Condensatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 80, quantita_minima: 15, is_scorta: false }] },
      { nome: "Condensatore 10µF", descrizione: "Condensatore elettrolitico 10µF 25V", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Condensatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 50, quantita_minima: 10, is_scorta: false }] },
      { nome: "Condensatore 100µF", descrizione: "Condensatore elettrolitico 100µF 16V", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Condensatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 30, quantita_minima: 5, is_scorta: false }, { magazzino_nome: "Magazzino Consumabili", quantita: 100, quantita_minima: 20, is_scorta: true }] },
      { nome: "Condensatore 470µF", descrizione: "Condensatore elettrolitico 470µF 16V", famiglia: "Elettronica", tipo: "Passivo", ambito: "Circuiti", sottotipo: "Condensatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 20, quantita_minima: 4, is_scorta: false }] },
      // ── LED ──
      { nome: "LED rosso 5mm", descrizione: "LED standard rosso, Vf=2.0V, 20mA", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "LED", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 80, quantita_minima: 15, is_scorta: true }, { magazzino_nome: "Magazzino Consumabili", quantita: 200, quantita_minima: 40, is_scorta: true }] },
      { nome: "LED verde 5mm", descrizione: "LED standard verde, Vf=2.2V, 20mA", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "LED", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 60, quantita_minima: 10, is_scorta: true }] },
      { nome: "LED giallo 5mm", descrizione: "LED standard giallo, Vf=2.0V, 20mA", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "LED", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 60, quantita_minima: 10, is_scorta: true }] },
      // ── Transistor e diodi ──
      { nome: "Transistor NPN BC547", descrizione: "Transistor NPN BC547, TO-92", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "Transistor", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 40, quantita_minima: 8, is_scorta: false }] },
      { nome: "Transistor PNP BC557", descrizione: "Transistor PNP BC557, TO-92", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "Transistor", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 30, quantita_minima: 5, is_scorta: false }] },
      { nome: "Diodo 1N4007", descrizione: "Diodo raddrizzatore 1N4007 1A 1000V", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "Diodo", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 60, quantita_minima: 10, is_scorta: false }] },
      { nome: "Diodo Zener 5.1V", descrizione: "Diodo Zener 5.1V 0.5W BZX55C", famiglia: "Elettronica", tipo: "Attivo", ambito: "Circuiti", sottotipo: "Diodo", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 25, quantita_minima: 5, is_scorta: false }] },
      // ── Circuiti integrati ──
      { nome: "LM555 Timer", descrizione: "Timer LM555 DIP-8", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti", sottotipo: "Timer", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 20, quantita_minima: 4, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica B", quantita: 10, quantita_minima: 2, is_scorta: false }] },
      { nome: "LM741 Op-Amp", descrizione: "Amplificatore operazionale LM741 DIP-8", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti", sottotipo: "Op-Amp", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 15, quantita_minima: 3, is_scorta: false }] },
      { nome: "NE5532 Op-Amp dual", descrizione: "Doppio op-amp NE5532 DIP-8, basso rumore", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti", sottotipo: "Op-Amp", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 12, quantita_minima: 3, is_scorta: false }] },
      { nome: "CD4017 Contatore decade", descrizione: "Contatore/decodificatore decade CMOS DIP-16", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti Logici", sottotipo: "Contatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica B", quantita: 15, quantita_minima: 3, is_scorta: false }] },
      { nome: "74HC00 NAND quad", descrizione: "Quattro porte NAND 2 ingressi 74HC00 DIP-14", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti Logici", sottotipo: "Gate", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica B", quantita: 20, quantita_minima: 4, is_scorta: false }] },
      { nome: "74HC08 AND quad", descrizione: "Quattro porte AND 2 ingressi 74HC08 DIP-14", famiglia: "Elettronica", tipo: "Integrato", ambito: "Circuiti Logici", sottotipo: "Gate", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica B", quantita: 20, quantita_minima: 4, is_scorta: false }] },
      // ── Accessori circuiti ──
      { nome: "Breadboard 830pt", descrizione: "Breadboard senza saldatura 830 punti", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Circuiti", sottotipo: "Breadboard", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 20, quantita_minima: 4, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica B", quantita: 10, quantita_minima: 2, is_scorta: false }] },
      { nome: "Breadboard 400pt", descrizione: "Breadboard mini senza saldatura 400 punti", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Circuiti", sottotipo: "Breadboard", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 30, quantita_minima: 6, is_scorta: false }] },
      { nome: "Filo conduttore jumper M-M 20cm", descrizione: "Jumper maschio-maschio per breadboard", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Circuiti", sottotipo: "Cavo", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 120, quantita_minima: 20, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica B", quantita: 60, quantita_minima: 10, is_scorta: false }] },
      { nome: "Filo conduttore con coccodrilli 50cm", descrizione: "Cavetto banana-coccodrillo rosso/nero", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Circuiti", sottotipo: "Cavo", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 40, quantita_minima: 8, is_scorta: false }, { magazzino_nome: "Aula 3B", quantita: 10, quantita_minima: 2, is_scorta: false }] },
      { nome: "Portabatteria AA doppio", descrizione: "Portabatteria 2xAA con interruttore", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Alimentazione", sottotipo: "Portabatteria", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 25, quantita_minima: 5, is_scorta: false }] },
      { nome: "Batteria AA 1.5V", descrizione: "Batteria stilo AA 1.5V alcalina", famiglia: "Elettronica", tipo: "Consumabile", ambito: "Alimentazione", sottotipo: "Batteria", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Magazzino Consumabili", quantita: 60, quantita_minima: 20, is_scorta: true }] },
      { nome: "Batteria 9V", descrizione: "Batteria 9V a blocco alcalina", famiglia: "Elettronica", tipo: "Consumabile", ambito: "Alimentazione", sottotipo: "Batteria", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Magazzino Consumabili", quantita: 20, quantita_minima: 5, is_scorta: true }] },
      // ── Strumenti di misura ──
      { nome: "Multimetro digitale", descrizione: "Multimetro digitale portatile V/A/Ω", famiglia: "Strumenti", tipo: "Misura", ambito: "Laboratorio", sottotipo: "Multimetro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 12, quantita_minima: 6, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica A", quantita: 6, quantita_minima: 3, is_scorta: false }] },
      { nome: "Oscilloscopio 2 canali", descrizione: "Oscilloscopio digitale 50MHz 2 canali", famiglia: "Strumenti", tipo: "Misura", ambito: "Laboratorio", sottotipo: "Oscilloscopio", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 4, quantita_minima: 2, is_scorta: false }] },
      { nome: "Generatore di funzioni", descrizione: "Generatore di segnali 1Hz-1MHz", famiglia: "Strumenti", tipo: "Misura", ambito: "Laboratorio", sottotipo: "Generatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 3, quantita_minima: 1, is_scorta: false }] },
      { nome: "Alimentatore da banco 30V/3A", descrizione: "Alimentatore regolabile DC 0-30V 0-3A", famiglia: "Strumenti", tipo: "Alimentazione", ambito: "Laboratorio", sottotipo: "Alimentatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 6, quantita_minima: 3, is_scorta: false }, { magazzino_nome: "Laboratorio Elettronica A", quantita: 4, quantita_minima: 2, is_scorta: false }] },
      { nome: "Saldatore a punta 25W", descrizione: "Saldatore a stilo 25W con supporto", famiglia: "Strumenti", tipo: "Utensile", ambito: "Saldatura", sottotipo: "Saldatore", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 8, quantita_minima: 4, is_scorta: false }] },
      { nome: "Stagno 0.8mm 250g", descrizione: "Lega stagno-piombo 60/40 250g", famiglia: "Strumenti", tipo: "Consumabile", ambito: "Saldatura", sottotipo: "Stagno", unita_misura: "g", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 5, quantita_minima: 2, is_scorta: true }] },
      { nome: "Treccia dissaldante 2mm", descrizione: "Treccia per dissaldare 2mm, 1.5m", famiglia: "Strumenti", tipo: "Consumabile", ambito: "Saldatura", sottotipo: "Consumabile", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 10, quantita_minima: 2, is_scorta: true }] },
      // ── Fisica ──
      { nome: "Dinamometro 5N", descrizione: "Dinamometro a molla 0-5N con scala", famiglia: "Fisica", tipo: "Misura", ambito: "Meccanica", sottotipo: "Dinamometro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 12, quantita_minima: 4, is_scorta: false }] },
      { nome: "Dinamometro 10N", descrizione: "Dinamometro a molla 0-10N con scala", famiglia: "Fisica", tipo: "Misura", ambito: "Meccanica", sottotipo: "Dinamometro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 10, quantita_minima: 4, is_scorta: false }] },
      { nome: "Massa 100g", descrizione: "Massa campione 100g con gancio", famiglia: "Fisica", tipo: "Accessorio", ambito: "Meccanica", sottotipo: "Massa", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 30, quantita_minima: 10, is_scorta: false }] },
      { nome: "Massa 200g", descrizione: "Massa campione 200g con gancio", famiglia: "Fisica", tipo: "Accessorio", ambito: "Meccanica", sottotipo: "Massa", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 20, quantita_minima: 6, is_scorta: false }] },
      { nome: "Binario per piano inclinato 80cm", descrizione: "Rotaia in alluminio 80cm per esperimenti di cinematica", famiglia: "Fisica", tipo: "Accessorio", ambito: "Meccanica", sottotipo: "Rotaia", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 6, quantita_minima: 2, is_scorta: false }] },
      { nome: "Carrello per binario", descrizione: "Carrello plastica con magnete per binario 80cm", famiglia: "Fisica", tipo: "Accessorio", ambito: "Meccanica", sottotipo: "Carrello", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 10, quantita_minima: 4, is_scorta: false }] },
      { nome: "Cronometro digitale", descrizione: "Cronometro digitale 1/100s con memory", famiglia: "Fisica", tipo: "Misura", ambito: "Meccanica", sottotipo: "Cronometro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 8, quantita_minima: 3, is_scorta: false }, { magazzino_nome: "Deposito Strumenti", quantita: 4, quantita_minima: 2, is_scorta: false }] },
      { nome: "Metro a nastro 2m", descrizione: "Metro flessibile 2m con fermo", famiglia: "Fisica", tipo: "Misura", ambito: "Meccanica", sottotipo: "Metro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 10, quantita_minima: 3, is_scorta: false }] },
      { nome: "Calorimetro in alluminio", descrizione: "Calorimetro Dewar alluminio 500ml", famiglia: "Fisica", tipo: "Accessorio", ambito: "Termodinamica", sottotipo: "Calorimetro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 5, quantita_minima: 2, is_scorta: false }] },
      { nome: "Termometro digitale -50/+150°C", descrizione: "Termometro digitale con sonda a K", famiglia: "Fisica", tipo: "Misura", ambito: "Termodinamica", sottotipo: "Termometro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Fisica", quantita: 6, quantita_minima: 2, is_scorta: false }, { magazzino_nome: "Deposito Strumenti", quantita: 3, quantita_minima: 1, is_scorta: false }] },
      // ── Materiali ──
      { nome: "PCB millefori 10x10cm", descrizione: "Basetta millefori vetronite 10x10cm", famiglia: "Elettronica", tipo: "Materiale", ambito: "Saldatura", sottotipo: "PCB", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 30, quantita_minima: 6, is_scorta: true }] },
      { nome: "Cavetto schermato RCA 1m", descrizione: "Cavo coassiale con connettori RCA, 1m", famiglia: "Elettronica", tipo: "Accessorio", ambito: "Circuiti", sottotipo: "Cavo", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Deposito Strumenti", quantita: 8, quantita_minima: 2, is_scorta: false }] },
      { nome: "Nastro isolante nero", descrizione: "Nastro isolante PVC nero 15mm", famiglia: "Materiali", tipo: "Consumabile", ambito: "Vario", sottotipo: "Nastro", unita_misura: "pz", datasheet_url: "",
        stock: [{ magazzino_nome: "Laboratorio Elettronica A", quantita: 10, quantita_minima: 2, is_scorta: true }, { magazzino_nome: "Deposito Strumenti", quantita: 6, quantita_minima: 2, is_scorta: true }] }
    ],
    esperienze: [
      {
        nome: "Circuito divisore di tensione",
        descrizione: "Realizzare un divisore di tensione resistivo e misurare le tensioni con il multimetro. Verificare sperimentalmente la legge del partitore.",
        componenti: [
          { componente_nome: "Resistenza 10kΩ", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Filo conduttore jumper M-M 20cm", quantita_necessaria: 6, consumabile: false },
          { componente_nome: "Multimetro digitale", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Lampeggiatore con LED e 555",
        descrizione: "Costruire un lampeggiatore astabile con il timer 555, una resistenza e un condensatore. Misurare la frequenza di lampeggio con l'oscilloscopio.",
        componenti: [
          { componente_nome: "LM555 Timer", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "LED rosso 5mm", quantita_necessaria: 1, consumabile: true },
          { componente_nome: "Resistenza 10kΩ", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Condensatore 100µF", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Condensatore 100nF", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Filo conduttore jumper M-M 20cm", quantita_necessaria: 8, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Oscilloscopio 2 canali", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Caratteristica I-V del diodo",
        descrizione: "Tracciare la curva caratteristica corrente-tensione di un diodo 1N4007 in polarizzazione diretta e inversa.",
        componenti: [
          { componente_nome: "Diodo 1N4007", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 220Ω", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Breadboard 400pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Multimetro digitale", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Filo conduttore con coccodrilli 50cm", quantita_necessaria: 4, consumabile: false }
        ]
      },
      {
        nome: "Amplificatore con transistor BC547",
        descrizione: "Realizzare uno stadio amplificatore a emettitore comune con BC547 e misurare il guadagno di tensione.",
        componenti: [
          { componente_nome: "Transistor NPN BC547", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 100kΩ", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 10kΩ", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 1kΩ", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Condensatore 10µF", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Generatore di funzioni", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Oscilloscopio 2 canali", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Amplificatore operazionale invertente",
        descrizione: "Montare un amplificatore invertente con LM741 e verificare la relazione Vout = -(Rf/Rin)·Vin variando le resistenze.",
        componenti: [
          { componente_nome: "LM741 Op-Amp", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 10kΩ", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 100kΩ", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Condensatore 100nF", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Generatore di funzioni", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Oscilloscopio 2 canali", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Porte logiche NAND e AND",
        descrizione: "Verificare le tavole di verità delle porte NAND (74HC00) e AND (74HC08) e realizzare funzioni combinatorie elementari.",
        componenti: [
          { componente_nome: "74HC00 NAND quad", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "74HC08 AND quad", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "LED rosso 5mm", quantita_necessaria: 2, consumabile: true },
          { componente_nome: "LED verde 5mm", quantita_necessaria: 2, consumabile: true },
          { componente_nome: "Resistenza 470Ω", quantita_necessaria: 4, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Filo conduttore jumper M-M 20cm", quantita_necessaria: 10, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Contatore decade con CD4017",
        descrizione: "Pilotare un CD4017 con il 555 in modalità astabile e visualizzare il conteggio con LED sequenziali.",
        componenti: [
          { componente_nome: "CD4017 Contatore decade", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "LM555 Timer", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "LED rosso 5mm", quantita_necessaria: 5, consumabile: true },
          { componente_nome: "LED verde 5mm", quantita_necessaria: 5, consumabile: true },
          { componente_nome: "Resistenza 470Ω", quantita_necessaria: 10, consumabile: false },
          { componente_nome: "Resistenza 10kΩ", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Condensatore 10µF", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Breadboard 830pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Regolatore di tensione con diodo Zener",
        descrizione: "Realizzare un regolatore di tensione semplice con diodo Zener 5.1V e verificarne il funzionamento al variare del carico.",
        componenti: [
          { componente_nome: "Diodo Zener 5.1V", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 470Ω", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Potenziometro 10kΩ", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Breadboard 400pt", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Multimetro digitale", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Alimentatore da banco 30V/3A", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Piano inclinato e attrito",
        descrizione: "Misurare il coefficiente di attrito statico e dinamico su piano inclinato variando l'angolo e le masse. Confrontare i valori con la teoria.",
        componenti: [
          { componente_nome: "Binario per piano inclinato 80cm", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Carrello per binario", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Massa 100g", quantita_necessaria: 4, consumabile: false },
          { componente_nome: "Massa 200g", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Dinamometro 5N", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Metro a nastro 2m", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Cronometro digitale", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Moto uniformemente accelerato",
        descrizione: "Studiare il moto di un carrello su rotaia, misurare spazio e tempo e verificare la relazione s = ½at².",
        componenti: [
          { componente_nome: "Binario per piano inclinato 80cm", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Carrello per binario", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Massa 100g", quantita_necessaria: 3, consumabile: false },
          { componente_nome: "Metro a nastro 2m", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Cronometro digitale", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Calorimetria: calore specifico",
        descrizione: "Misurare il calore specifico di un metallo con il metodo delle miscele usando calorimetro e termometro digitale.",
        componenti: [
          { componente_nome: "Calorimetro in alluminio", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Termometro digitale -50/+150°C", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Massa 100g", quantita_necessaria: 2, consumabile: false },
          { componente_nome: "Metro a nastro 2m", quantita_necessaria: 1, consumabile: false }
        ]
      },
      {
        nome: "Saldatura su millefori",
        descrizione: "Imparare le tecniche di base della saldatura a stagno: montaggio di resistenze e LED su PCB millefori.",
        componenti: [
          { componente_nome: "PCB millefori 10x10cm", quantita_necessaria: 1, consumabile: true },
          { componente_nome: "Saldatore a punta 25W", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Stagno 0.8mm 250g", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Resistenza 1kΩ", quantita_necessaria: 5, consumabile: true },
          { componente_nome: "LED rosso 5mm", quantita_necessaria: 3, consumabile: true },
          { componente_nome: "Treccia dissaldante 2mm", quantita_necessaria: 1, consumabile: false },
          { componente_nome: "Nastro isolante nero", quantita_necessaria: 1, consumabile: false }
        ]
      }
    ]
  };
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "magazzino_import_esempio.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function doImport() {
  const fileInput = document.getElementById("import-file-input");
  const resDiv    = document.getElementById("import-result");
  if (!fileInput.files.length) {
    showAlert("Seleziona un file JSON.", "warning");
    return;
  }
  const text = await fileInput.files[0].text();
  let json;
  try { json = JSON.parse(text); }
  catch { showAlert("File JSON non valido.", "danger"); return; }

  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });
  const data = await res.json();
  if (!res.ok) {
    resDiv.style.cssText = "display:block;background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;font-size:13px";
    resDiv.textContent = data.error || "Errore durante l'importazione.";
    return;
  }
  resDiv.style.cssText = "display:block;background:#dcfce7;color:#166534;padding:10px 14px;border-radius:8px;font-size:13px";
  resDiv.innerHTML =
    `<strong>Importazione completata.</strong><br>` +
    `Magazzini creati: ${data.magazzini} &nbsp;·&nbsp; ` +
    `Componenti creati: ${data.componenti} &nbsp;·&nbsp; ` +
    `Esperienze create: ${data.esperienze} &nbsp;·&nbsp; ` +
    `Assegnazioni stock: ${data.stock}` +
    (data.errori?.length ? `<br><br><strong>Avvisi:</strong><br>${data.errori.map(e => esc(e)).join('<br>')}` : '');
  // ricarica i dati in background
  loadComponentiSilent();
  loadMagazziniSilent();
}

// ─── UTILITY ──────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function contrastColor(hex) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.substring(0,2), 16) || 0;
  const g = parseInt(h.substring(2,4), 16) || 0;
  const b = parseInt(h.substring(4,6), 16) || 0;
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.55 ? '#1e293b' : '#ffffff';
}

function canEdit() {
  return ["ADMIN","TECNICO"].includes(currentUser?.ruolo);
}

// ─── BOOT ─────────────────────────────────────────────
init();
