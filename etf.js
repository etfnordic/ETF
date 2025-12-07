// === 1. Supabase-konfiguration ===
// Samma projekt som på startsidan
const SUPABASE_URL = "https://ereoftabfbmwaahcubyb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZW9mdGFiZmJtd2FhaGN1YnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjE2NDEsImV4cCI6MjA4MDYzNzY0MX0.H7uFb8r8wDBYiiqVcKUOEJYq0vEmLkXMMUySqnG8MDw";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === 2. Små hjälpfunktioner ===

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function formatNumber(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "-";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "-";
}

// === 3. Ladda ETF och fyll sidan ===

async function loadEtf() {
  const id = getIdFromUrl();
  if (!id) {
    setText("etfSubtitle", "Ingen ETF angiven (saknar id-param i URL).");
    return;
  }

  try {
    const { data, error } = await client
      .from("DATA")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      console.error(error || "Ingen rad hittades");
      setText("etfSubtitle", "Kunde inte hitta ETF i databasen.");
      return;
    }

    const etf = data;

    // Titlar
    setText("etfTitle", etf.namn || "ETF-detaljer");
    setText(
      "etfSubtitle",
      [etf.ticker, etf.region, etf.tema].filter(Boolean).join(" • ")
    );

    setText("etfName", etf.namn);
    setText("etfTicker", etf.ticker ? `Ticker: ${etf.ticker}` : "Ticker: -");
    setText(
      "etfIssuer",
      etf.emitent ? `Emitent: ${etf.emitent}` : "Emitent: (ej ifylld ännu)"
    );

    // Grundinfo
    setText("etfRegion", etf.region);
    setText("etfTema", etf.tema);
    setText("etfTillgang", etf.tillgångsslag);
    setText("etfValuta", etf.valuta);
    setText("etfHemvist", etf.hemvist);
    setText("etfReplikering", etf.replikeringsmetod);
    setText("etfUtdelning", etf.utdelningsfrekvens);
    setText("etfStartdatum", etf.startdatum);

    // Fondstorlek i SEK (om du fyller den via scriptet)
    if (etf.fondstorlek_sek) {
      setText(
        "etfFondstorlek",
        formatNumber(etf.fondstorlek_sek / 1_000_000, 1) + " MSEK"
      );
    }

    // Nyckeltal
    setText("etfTer", etf.ter != null ? formatNumber(etf.ter, 2) + " %" : "-");
    setText(
      "etfLastPrice",
      etf.senaste_kurs != null ? formatNumber(etf.senaste_kurs, 2) : "-"
    );

    // 1 år i fondvaluta
    const ret1 = Number(etf.avkastning_1år);
    const ret1Text = Number.isFinite(ret1) ? ret1.toFixed(1) + " %" : "-";
    const retEl = document.getElementById("etf1yReturn");
    if (retEl) {
      retEl.textContent = ret1Text;
      if (Number.isFinite(ret1)) {
        if (ret1 < 0) retEl.style.color = "#f97373";
        else if (ret1 > 0) retEl.style.color = "#4ade80";
      }
    }

    // 1 år i SEK (om du använder den kolumnen)
    const retSek = Number(etf.avkastning_1år_sek);
    const retSekEl = document.getElementById("etf1yReturnSek");
    if (retSekEl) {
      const t = Number.isFinite(retSek) ? retSek.toFixed(1) + " %" : "-";
      retSekEl.textContent = t;
      if (Number.isFinite(retSek)) {
        if (retSek < 0) retSekEl.style.color = "#f97373";
        else if (retSek > 0) retSekEl.style.color = "#4ade80";
      }
    }

    // Beskrivning och index
    if (etf.beskrivning) {
      setText("etfDescription", etf.beskrivning);
    }
    if (etf.index_namn) {
      setText("etfIndexInfo", `Följer index: ${etf.index_namn}`);
    }

    // Hämta historik och rita graf
    await loadHistory(id);
  } catch (err) {
    console.error(err);
    setText("etfSubtitle", "Tekniskt fel vid hämtning av ETF.");
  }
}

// === 4. Hämta historik från HISTORIK och rita graf med Chart.js ===

let priceChart = null;

async function loadHistory(etfId) {
  const chartInfo = document.getElementById("chartInfo");

  const { data, error } = await client
    .from("HISTORIK")
    .select("datum, pris, pris_sek")
    .eq("etf_id", etfId)
    .order("datum", { ascending: true });

  if (error) {
    console.error("Fel vid hämtning av historik:", error);
    if (chartInfo) chartInfo.textContent = "Fel vid hämtning av historik";
    return;
  }

  if (!data || data.length === 0) {
    console.log("Ingen historik för denna ETF.");
    if (chartInfo) chartInfo.textContent = "Ingen historik ännu";
    return;
  }

  // Använd pris_sek om det finns, annars pris
  const labels = data.map((row) => row.datum);
  const values = data.map((row) =>
    Number(row.pris_sek != null ? row.pris_sek : row.pris)
  );

  const ctxEl = document.getElementById("priceChart");
  if (!ctxEl) {
    console.warn("Hittar inte canvas-elementet priceChart.");
    return;
  }
  const ctx = ctxEl.getContext("2d");

  if (priceChart) {
    priceChart.destroy();
  }

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pris i SEK",
          data: values,
          tension: 0.15,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 6,
          },
        },
        y: {
          ticks: {
            callback: (v) =>
              typeof v === "number" && v.toFixed ? v.toFixed(0) : v,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : "-"} SEK`,
          },
        },
      },
    },
  });

  if (chartInfo) chartInfo.textContent = `Pris i SEK (${labels[0]} – ${
    labels[labels.length - 1]
  })`;
}

// === 5. Starta ===
loadEtf();
