// Supabase-konfiguration – samma som i script.js
const SUPABASE_URL = "https://ereoftabfbmwaahcubyb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZW9mdGFiZmJtd2FhaGN1YnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjE2NDEsImV4cCI6MjA4MDYzNzY0MX0.H7uFb8r8wDBYiiqVcKUOEJYq0vEmLkXMMUySqnG8MDw";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hjälpfunktioner
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

// Hämta ETF och fyll sidan
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
    setText("etfSubtitle", `${etf.ticker || ""} • ${etf.region || ""} • ${
      etf.tema || ""
    }`);

    setText("etfName", etf.namn);
    setText("etfTicker", `Ticker: ${etf.ticker || "-"}`);

    // Emitent – vi använder ev. kolumn 'emitent', annars fallback
    setText(
      "etfIssuer",
      etf.emitent ? `Emitent: ${etf.emitent}` : "Emitent: (ej ifylld ännu)"
    );

    // Nyckeltal
    setText("etfRegion", etf.region);
    setText("etfTema", etf.tema);
    setText("etfTillgang", etf.tillgångsslag);
    setText("etfValuta", etf.valuta);

    setText("etfTer", formatNumber(etf.ter, 2) + " %");
    setText("etfLastPrice", formatNumber(etf.senaste_kurs, 2));

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
const retSek = Number(etf.avkastning_1år_sek);
const retSekText = Number.isFinite(retSek) ? retSek.toFixed(1) + " %" : "-";
const retSekEl = document.getElementById("etf1yReturnSek");
if (retSekEl) {
  retSekEl.textContent = retSekText;
  if (Number.isFinite(retSek)) {
    if (retSek < 0) retSekEl.style.color = "#f97373";
    else if (retSek > 0) retSekEl.style.color = "#4ade80";
  }
}

    // Beskrivning – om du senare lägger till kolumn 'beskrivning'
    if (etf.beskrivning) {
      setText("etfDescription", etf.beskrivning);
    }

    // TradingView-graf om du har kolumn 'tv_symbol'
    if (etf.tv_symbol) {
      initTradingViewChart(etf.tv_symbol);
    }
  } catch (err) {
    console.error(err);
    setText("etfSubtitle", "Tekniskt fel vid hämtning av ETF.");
  }
}

function initTradingViewChart(tvSymbol) {
  const container = document.getElementById("chartContainer");
  const placeholder = document.getElementById("chartPlaceholder");
  if (!container) return;

  if (placeholder) placeholder.remove();

  const widgetDiv = document.createElement("div");
  widgetDiv.id = "tradingview_widget";
  container.appendChild(widgetDiv);

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = "https://s3.tradingview.com/tv.js";
  script.onload = () => {
    // global TV kommer från tradingview-scriptet
    // @ts-ignore
    new TradingView.widget({
      autosize: true,
      symbol: tvSymbol, // t.ex. "LSE:VUSA"
      interval: "D",
      timezone: "Europe/Stockholm",
      theme: "dark",
      style: "1",
      locale: "sv_SE",
      container_id: "tradingview_widget",
      hide_top_toolbar: false,
      hide_legend: false,
    });
  };

  container.appendChild(script);
}

// Start
loadEtf();
