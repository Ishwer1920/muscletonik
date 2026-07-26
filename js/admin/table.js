/* ===========================================================
   MUSCLE TONIK - AdminTable
   One reusable, server-driven data table shared by every admin
   list (Products, Orders, Customers, Inventory, Coupons, …).
   Features: sticky header, search, per-column sort, filters +
   date range, bulk select/actions, row actions, column
   visibility, CSV/Excel export, loading/empty/error states,
   responsive card view, keyboard navigation, ARIA.
   Pages provide a `fetch(query)` adapter -> real backend data.
   =========================================================== */
const AdminTable = (() => {
  const esc = (s) => (window.AdminShell ? AdminShell.esc(s) : String(s == null ? "" : s));
  const SEARCH_SVG = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

  // Build a clean querystring (drops empty values) — pages use this in fetch().
  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
    return p.toString();
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function create(cfg) {
    const root = typeof cfg.mount === "string" ? document.querySelector(cfg.mount) : cfg.mount;
    const rowId = cfg.rowId || (r => r.id);
    const pageSize = cfg.pageSize || 20;
    const storageKey = cfg.storageKey || null;
    const dataColumns = cfg.columns;                      // excludes select/actions
    const hidden = new Set(loadHidden());
    const selected = new Set();
    let state = {
      page: 1, search: "", sort: cfg.sort?.key || "", dir: cfg.sort?.dir || "desc",
      filters: {}, rows: [], total: 0, totalPages: 1, loading: false
    };

    function loadHidden() {
      if (!storageKey) return [];
      try { return JSON.parse(localStorage.getItem("dt_hidden_" + storageKey) || "[]"); } catch { return []; }
    }
    function saveHidden() {
      if (storageKey) localStorage.setItem("dt_hidden_" + storageKey, JSON.stringify([...hidden]));
    }

    const visibleCols = () => dataColumns.filter(c => !hidden.has(c.key));
    const colCount = () => visibleCols().length + 1 /*select*/ + (cfg.rowActions ? 1 : 0);

    // ---------- static shell ----------
    root.innerHTML = `
      <div class="dt">
        <div class="dt-toolbar">
          ${cfg.search !== false ? `<div class="dt-search">${SEARCH_SVG}<input type="search" class="dt-search-input" placeholder="${esc(cfg.searchPlaceholder || "Search…")}" aria-label="Search"></div>` : ""}
          <div class="dt-filters"></div>
          <div class="dt-tools">
            <div class="dt-menuwrap dt-col-wrap">
              <button class="a-btn ghost dt-col-btn" type="button" aria-haspopup="true" aria-expanded="false">Columns</button>
              <div class="dt-menu dt-col-menu" role="menu"></div>
            </div>
            <div class="dt-menuwrap dt-export-wrap">
              <button class="a-btn ghost dt-export-btn" type="button" aria-haspopup="true" aria-expanded="false">Export</button>
              <div class="dt-menu dt-export-menu" role="menu">
                <button class="dt-menu-item" data-export="csv" role="menuitem">Export CSV</button>
                <button class="dt-menu-item" data-export="xls" role="menuitem">Export Excel</button>
              </div>
            </div>
          </div>
        </div>
        <div class="dt-bulkbar" hidden role="region" aria-label="Bulk actions">
          <span class="dt-selcount"></span>
          <button class="a-btn ghost dt-clear-sel" type="button">Clear</button>
          <div class="dt-bulk-actions"></div>
        </div>
        <div class="dt-scroll">
          <table class="dt-table" aria-label="${esc(cfg.label || "Data table")}">
            <thead><tr class="dt-head-row"></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="dt-pager">
          <span class="dt-pageinfo"></span>
          <div class="dt-pagebtns">
            <button class="a-btn ghost dt-prev" type="button">Previous</button>
            <button class="a-btn ghost dt-next" type="button">Next</button>
          </div>
        </div>
      </div>`;

    const $ = sel => root.querySelector(sel);
    const tbody = $(".dt-table tbody");
    const headRow = $(".dt-head-row");

    // ---------- header ----------
    function renderHead() {
      const cols = visibleCols();
      headRow.innerHTML =
        `<th class="dt-check"><input type="checkbox" class="dt-select-all" aria-label="Select all rows on this page"></th>` +
        cols.map(c => {
          const sortable = c.sortable;
          const isSorted = state.sort === c.key;
          const ariaSort = !sortable ? "" : ` aria-sort="${isSorted ? (state.dir === "asc" ? "ascending" : "descending") : "none"}"`;
          const inner = sortable
            ? `<button class="dt-sort" type="button" data-key="${c.key}">${esc(c.label)}<span class="dt-arrow">${isSorted ? (state.dir === "asc" ? "▲" : "▼") : "↕"}</span></button>`
            : esc(c.label);
          return `<th scope="col"${ariaSort} style="${c.thStyle || ""}">${inner}</th>`;
        }).join("") +
        (cfg.rowActions ? `<th scope="col" class="dt-actions-cell">Actions</th>` : "");

      headRow.querySelectorAll(".dt-sort").forEach(btn =>
        btn.addEventListener("click", () => toggleSort(btn.dataset.key)));
      const selAll = headRow.querySelector(".dt-select-all");
      selAll.addEventListener("change", () => {
        state.rows.forEach(r => { const id = rowId(r); selAll.checked ? selected.add(id) : selected.delete(id); });
        renderBody(); renderBulkBar();
      });
    }

    function toggleSort(key) {
      if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.sort = key; state.dir = "asc"; }
      state.page = 1; load();
    }

    // ---------- filters ----------
    function renderFilters() {
      const wrap = $(".dt-filters");
      if (!cfg.filters || !cfg.filters.length) { wrap.remove?.(); return; }
      wrap.innerHTML = cfg.filters.map(f => {
        if (f.type === "daterange") {
          return `<span class="dt-daterange"><label>${esc(f.label)}</label>
            <input type="date" class="a-input dt-filter dt-date" data-fkey="${f.fromKey || "from"}" aria-label="${esc(f.label)} from">
            <span style="color:var(--a-muted)">–</span>
            <input type="date" class="a-input dt-filter dt-date" data-fkey="${f.toKey || "to"}" aria-label="${esc(f.label)} to"></span>`;
        }
        const opts = [{ value: "", label: "All " + f.label }].concat(f.options || []);
        return `<select class="a-select dt-filter" data-fkey="${f.key}" aria-label="${esc(f.label)}" style="width:auto;">
          ${opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>`;
      }).join("");
      wrap.querySelectorAll(".dt-filter").forEach(el =>
        el.addEventListener("change", () => { state.filters[el.dataset.fkey] = el.value; state.page = 1; load(); }));
    }

    // ---------- column visibility ----------
    function renderColMenu() {
      const menu = $(".dt-col-menu");
      menu.innerHTML = dataColumns.filter(c => c.hideable !== false).map(c =>
        `<label><input type="checkbox" data-col="${c.key}" ${hidden.has(c.key) ? "" : "checked"}> ${esc(c.label)}</label>`).join("");
      menu.querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => {
        cb.checked ? hidden.delete(cb.dataset.col) : hidden.add(cb.dataset.col);
        saveHidden(); renderHead(); renderBody();
      }));
    }

    // ---------- body ----------
    function stateRow(html) {
      tbody.innerHTML = `<tr><td class="dt-statecell" colspan="${colCount()}">${html}</td></tr>`;
    }
    function renderSkeleton() {
      const rows = Array.from({ length: 6 }).map(() =>
        `<tr class="dt-skel-row"><td colspan="${colCount()}"><div class="dt-skel"></div></td></tr>`).join("");
      tbody.innerHTML = rows;
    }

    function renderBody() {
      const cols = visibleCols();
      if (!state.rows.length) {
        stateRow(`<h4>${esc(cfg.emptyTitle || "Nothing here yet")}</h4><p>${esc(cfg.emptyText || "No records match your current filters.")}</p>`);
        syncSelectAll(); return;
      }
      tbody.innerHTML = state.rows.map(r => {
        const id = rowId(r);
        const sel = selected.has(id);
        const cells = cols.map(c => {
          const val = c.render ? c.render(r) : esc(r[c.key]);
          return `<td data-label="${esc(c.label)}" class="${c.className || ""}">${val}</td>`;
        }).join("");
        const actions = cfg.rowActions ? `<td class="dt-actions-cell" data-label="Actions">${
          (cfg.rowActions(r) || []).map((a, i) =>
            `<button class="a-btn ghost dt-row-btn" data-act="${i}" ${a.danger ? 'style="color:var(--a-red)"' : ""}>${esc(a.label)}</button>`).join("")
        }</td>` : "";
        return `<tr data-id="${esc(id)}" tabindex="-1" class="${sel ? "dt-selected" : ""}">
          <td class="dt-check" data-label="Select"><input type="checkbox" class="dt-row-check" ${sel ? "checked" : ""} aria-label="Select row"></td>
          ${cells}${actions}</tr>`;
      }).join("");

      // wire per-row controls
      tbody.querySelectorAll("tr[data-id]").forEach(tr => {
        const r = state.rows.find(x => String(rowId(x)) === tr.dataset.id);
        tr.querySelector(".dt-row-check").addEventListener("change", e => {
          e.target.checked ? selected.add(rowId(r)) : selected.delete(rowId(r));
          tr.classList.toggle("dt-selected", e.target.checked);
          syncSelectAll(); renderBulkBar();
        });
        if (cfg.rowActions) {
          const acts = cfg.rowActions(r);
          tr.querySelectorAll(".dt-row-btn").forEach(btn =>
            btn.addEventListener("click", () => acts[Number(btn.dataset.act)].onClick(r)));
        }
        if (cfg.onRowRender) cfg.onRowRender(r, tr);
      });
      wireKeyboard();
      syncSelectAll();
    }

    function syncSelectAll() {
      const selAll = headRow.querySelector(".dt-select-all");
      if (!selAll) return;
      const ids = state.rows.map(rowId);
      selAll.checked = ids.length > 0 && ids.every(id => selected.has(id));
      selAll.indeterminate = ids.some(id => selected.has(id)) && !selAll.checked;
    }

    // ---------- keyboard: roving focus on rows ----------
    function wireKeyboard() {
      const rows = [...tbody.querySelectorAll("tr[data-id]")];
      if (rows.length) rows[0].tabIndex = 0;
      tbody.onkeydown = (e) => {
        const cur = document.activeElement.closest ? document.activeElement.closest("tr[data-id]") : null;
        if (!cur) return;
        const idx = rows.indexOf(cur);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = rows[e.key === "ArrowDown" ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1)];
          if (next) { cur.tabIndex = -1; next.tabIndex = 0; next.focus(); }
        } else if (e.key === " " && cur === document.activeElement) {
          e.preventDefault(); cur.querySelector(".dt-row-check").click();
        } else if (e.key === "Enter" && cur === document.activeElement && cfg.rowActions) {
          const first = cur.querySelector(".dt-row-btn"); if (first) first.click();
        }
      };
    }

    // ---------- bulk bar ----------
    function renderBulkBar() {
      const bar = $(".dt-bulkbar");
      if (!selected.size || !cfg.bulkActions) { bar.hidden = true; return; }
      bar.hidden = false;
      bar.querySelector(".dt-selcount").textContent = `${selected.size} selected`;
      const host = bar.querySelector(".dt-bulk-actions");
      host.innerHTML = cfg.bulkActions.map((a, i) =>
        `<button class="a-btn ${a.danger ? "ghost" : "primary"} dt-bulk-act" data-i="${i}" ${a.danger ? 'style="color:var(--a-red)"' : ""}>${esc(a.label)}</button>`).join("");
      host.querySelectorAll(".dt-bulk-act").forEach(btn => btn.addEventListener("click", async () => {
        const action = cfg.bulkActions[Number(btn.dataset.i)];
        btn.disabled = true;
        try { await action.run([...selected]); selected.clear(); await load(); }
        catch (err) { window.AdminShell && AdminShell.toast(err.message, "err"); }
        finally { btn.disabled = false; }
      }));
    }

    // ---------- data load ----------
    async function load() {
      state.loading = true;
      renderHead();            // keep sort indicators / aria-sort in sync
      renderSkeleton();
      const query = { page: state.page, limit: pageSize, search: state.search, sort: state.sort, dir: state.dir, ...state.filters };
      try {
        const res = await cfg.fetch(query);
        state.rows = res.rows || [];
        state.total = res.total || state.rows.length;
        state.totalPages = res.totalPages || 1;
        state.page = res.page || state.page;
        renderBody();
        updatePager();
        if (cfg.onLoad) cfg.onLoad(res);
      } catch (err) {
        stateRow(`<h4>Couldn't load data</h4><p>${esc(err.message)}</p><button class="a-btn ghost dt-retry" style="margin-top:12px">Retry</button>`);
        tbody.querySelector(".dt-retry")?.addEventListener("click", load);
      } finally {
        state.loading = false; renderBulkBar();
      }
    }

    function updatePager() {
      $(".dt-pageinfo").textContent = state.total
        ? `Showing ${(state.page - 1) * pageSize + 1}–${Math.min(state.page * pageSize, state.total)} of ${state.total}`
        : "No results";
      $(".dt-prev").disabled = state.page <= 1;
      $(".dt-next").disabled = state.page >= state.totalPages;
    }

    // ---------- export (real data via the same fetch adapter) ----------
    async function exportData(kind) {
      const cols = visibleCols();
      let rows = state.rows;
      try {
        const res = await cfg.fetch({ page: 1, limit: 10000, search: state.search, sort: state.sort, dir: state.dir, ...state.filters });
        rows = res.rows || rows;
      } catch { /* fall back to current page */ }
      const headers = cols.map(c => c.label);
      const value = (c, r) => c.exportValue ? c.exportValue(r) : (r[c.key] == null ? "" : String(r[c.key]));
      const name = (cfg.exportName || "export") + "-" + new Date().toISOString().slice(0, 10);
      if (kind === "csv") {
        const csv = [headers].concat(rows.map(r => cols.map(c => value(c, r))))
          .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
        download(name + ".csv", csv, "text/csv;charset=utf-8;");
      } else {
        const table = `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
          rows.map(r => `<tr>${cols.map(c => `<td>${esc(value(c, r))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
        download(name + ".xls", `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table}</body></html>`, "application/vnd.ms-excel");
      }
    }

    // ---------- wire toolbar ----------
    if (cfg.search !== false) {
      $(".dt-search-input").addEventListener("input", debounce(e => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300));
    }
    $(".dt-prev").addEventListener("click", () => { if (state.page > 1) { state.page--; load(); } });
    $(".dt-next").addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; load(); } });
    $(".dt-clear-sel").addEventListener("click", () => { selected.clear(); renderBody(); renderBulkBar(); });

    // dropdown menus (columns + export) with outside-click + Escape close
    function bindMenu(btnSel, menuSel) {
      const btn = $(btnSel), menu = $(menuSel);
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const open = menu.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
      });
      menu.addEventListener("click", e => e.stopPropagation());
    }
    bindMenu(".dt-col-btn", ".dt-col-menu");
    bindMenu(".dt-export-btn", ".dt-export-menu");
    root.querySelectorAll("[data-export]").forEach(b => b.addEventListener("click", () => { exportData(b.dataset.export); $(".dt-export-menu").classList.remove("open"); }));
    document.addEventListener("click", () => root.querySelectorAll(".dt-menu.open").forEach(m => { m.classList.remove("open"); m.previousElementSibling?.setAttribute("aria-expanded", "false"); }));
    document.addEventListener("keydown", e => { if (e.key === "Escape") root.querySelectorAll(".dt-menu.open").forEach(m => m.classList.remove("open")); });

    renderHead(); renderFilters(); renderColMenu();
    load();

    return {
      reload: load,
      getSelected: () => [...selected],
      clearSelection: () => { selected.clear(); renderBody(); renderBulkBar(); }
    };
  }

  return { create, qs };
})();
