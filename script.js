// === 1. KONFIGURATION ===
const SUPABASE_URL = "https://ereoftabfbmwaahcubyb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZW9mdGFiZmJtd2FhaGN1YnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjE2NDEsImV4cCI6MjA4MDYzNzY0MX0.H7uFb8r8wDBYiiqVcKUOEJYq0vEmLkXMMUySqnG8MDw";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Globala variabler
let allaEtfer = [];
let sortKey = null;      // t.ex. "namn", "ter"
let sortDir = "asc";     // "asc" eller "desc"

// Elementreferenser
const tbody = document.getElementById("etfTableBody");
const statusMessage = document.getElementById("statusMessage");
const countBadge = document.getElementById("countBadge");

const searchInput = document.getElementById("searchInput");
const regionFilter = document.getElementById("regionFilter");
const temaFilter = document.getElementById("temaFilter");
const tillgangFilter = document.getElementById("tillgangFilter");

// Hjälpfunktion för säkra tal
function formatNumber(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "";
}

// === 2. Hämta ETF:er ===
async function hamtaEtfer() {
  statusMessage.textContent = "Hämtar data...";
  try {
    const { data, error } = await client
      .from("DATA")
      .select("*")
      .order("namn", { ascending: true });

    if (error) {
      console.error(error);
      statusMessage.textContent = "Fel vid hämtning av data.";
      return;
    }

    allaEtfer = data || [];
    statusMessage.textContent = "";
    appliceraFilterOchRender();
  } catch (err) {
    console.error(err);
    statusMessage.textContent = "Tekniskt fel.";
  }
}

function sorteraLista(lista) {
  if (!sortKey) return lista;

  const numericKeys = new Set(["ter", "senaste_kurs", "avkastning_1år"]);

  const sorted = [...lista].sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];

    if (numericKeys.has(sortKey)) {
      va = Number(va);
      vb = Number(vb);

      if (!Number.isFinite(va) && !Number.isFinite(vb)) return 0;
      if (!Number.isFinite(va)) return 1;
      if (!Number.isFinite(vb)) return -1;
    } else {
      va = (va ?? "").toString().toLowerCase();
      vb = (vb ?? "").toString().toLowerCase();
    }

    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return sorted;
}

// === 3. Filtrering ===
function appliceraFilterOchRender() {
  const sök = searchInput.value.trim().toLowerCase();
  const regionVal = regionFilter.value;
  const temaVal = temaFilter.value;
  const tillgangVal = tillgangFilter.value;

  let filtrerad = allaEtfer;

  if (sök) {
    filtrerad = filtrerad.filter((rad) => {
      return (
        rad.namn.toLowerCase().includes(sök) ||
        rad.ticker.toLowerCase().includes(sök)
      );
    });
  }

  if (regionVal) filtrerad = filtrerad.filter((r) => r.region === regionVal);
  if (temaVal) filtrerad = filtrerad.filter((r) => r.tema === temaVal);
  if (tillgangVal)
    filtrerad = filtrerad.filter((r) => r.tillgångsslag === tillgangVal);

const sorterad = sorteraLista(filtrerad);
renderaTabell(sorterad);

}

// Hjälpfunktion för säkra tal
function formatNumber(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "";
}

// === 4. Rendera tabell ===
function renderaTabell(rader) {
  tbody.innerHTML = "";

  rader.forEach((rad) => {
    const tr = document.createElement("tr");

    const terText = formatNumber(rad.ter, 2);
    const kursText = formatNumber(rad.senaste_kurs, 2);
    const avkNum = Number(rad.avkastning_1år);
    const avkText = Number.isFinite(avkNum) ? avkNum.toFixed(1) + " %" : "";

    tr.innerHTML = `
      <td>${rad.namn}</td>
      <td>${rad.ticker}</td>
      <td>${rad.region}</td>
      <td>${rad.tema}</td>
      <td>${rad.tillgångsslag}</td>
      <td>${rad.valuta}</td>
      <td class="numeric">${terText}</td>
      <td class="numeric">${kursText}</td>
      <td class="numeric avk-1år">${avkText}</td>
    `;

    // färga 1-års-avkastning grön/röd
    if (Number.isFinite(avkNum)) {
      const avkCell = tr.querySelector(".avk-1år");
      if (avkNum < 0) {
        avkCell.style.color = "#f97373"; // röd
      } else if (avkNum > 0) {
        avkCell.style.color = "#4ade80"; // grön
      }
    }

    tbody.appendChild(tr);
  });

  countBadge.textContent = `${rader.length} st`;

  if (rader.length === 0) {
    statusMessage.textContent = "Inga ETF:er matchar filtren.";
  } else {
    statusMessage.textContent = "";
  }
}

// === 5. Event listeners ===
searchInput.addEventListener("input", appliceraFilterOchRender);
regionFilter.addEventListener("change", appliceraFilterOchRender);
temaFilter.addEventListener("change", appliceraFilterOchRender);
tillgangFilter.addEventListener("change", appliceraFilterOchRender);

function initSorting() {
  const headerCells = document.querySelectorAll("thead th[data-sort-key]");

  headerCells.forEach((th) => {
    const key = th.dataset.sortKey;
    if (!key) return;

    th.addEventListener("click", () => {
      if (sortKey === key) {
        // samma kolumn → toggla riktning
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        // ny kolumn → börja med asc
        sortKey = key;
        sortDir = "asc";
      }

      // rensa gamla pilar
      headerCells.forEach((h) =>
        h.classList.remove("sorted-asc", "sorted-desc")
      );
      th.classList.add(
        sortDir === "asc" ? "sorted-asc" : "sorted-desc"
      );

      appliceraFilterOchRender();
    });
  });
}

// initiera sortering
initSorting();

// === 6. Start ===
hamtaEtfer();

