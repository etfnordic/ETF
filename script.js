// === 1. KONFIGURATION ===
const SUPABASE_URL = "https://ereoftabfbmwaahcubyb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZW9mdGFiZmJtd2FhaGN1YnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjE2NDEsImV4cCI6MjA4MDYzNzY0MX0.H7uFb8r8wDBYiiqVcKUOEJYq0vEmLkXMMUySqnG8MDw";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Globala variabler
let allaEtfer = [];

// Elementreferenser
const tbody = document.getElementById("etfTableBody");
const statusMessage = document.getElementById("statusMessage");
const countBadge = document.getElementById("countBadge");

const searchInput = document.getElementById("searchInput");
const regionFilter = document.getElementById("regionFilter");
const temaFilter = document.getElementById("temaFilter");
const tillgangFilter = document.getElementById("tillgangFilter");

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
  if (tillgangVal) filtrerad = filtrerad.filter((r) => r.tillgångsslag === tillgangVal);

  renderaTabell(filtrerad);
}

// === 4. Rendera tabell ===
function renderaTabell(rader) {
  tbody.innerHTML = "";

  rader.forEach((rad) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${rad.namn}</td>
      <td>${rad.ticker}</td>
      <td>${rad.region}</td>
      <td>${rad.tema}</td>
      <td>${rad.tillgångsslag}</td>
      <td>${rad.valuta}</td>
      <td class="numeric">${rad.ter?.toFixed(2) ?? ""}</td>
      <td class="numeric">${rad.senaste_kurs?.toFixed(2) ?? ""}</td>
      <td class="numeric">${rad.avkastning_1år ? rad.avkastning_1år + "%" : ""}</td>
    `;

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

// === 6. Start ===
hamtaEtfer();
