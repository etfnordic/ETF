// === 1. Supabase-konfiguration ===
const SUPABASE_URL = "https://ereoftabfbmwaahcubyb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIs...CI6MjA4MDYzNzY0MX0.H7uFb8r8wDBYiiqVcKUOEJYq0vEmLkXMMUySqnG8MDw";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let priceChartInstance = null;

// === 2. Hjälpfunktioner ===
function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatNumber(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "-";
}

// === 3. Hämta ETF-detaljer ===
async function hamtaEtfDetaljer() {
  const id = getIdFromUrl();
  if (!id) {
    document.getElementById("etfSubtitle").textContent =
      "Ingen ETF-id angivet.";
    return;
  }

  try {
    const { data, error } = await client
      .from("DATA")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(error);
      document.getElementById("etfSubtitle").textContent =
        "Fel vid hämtning av ETF.";
      return;
    }

    if (!data) {
      document.getElementById("etfSubtitle").textContent =
        "ETF hittades inte.";
      return;
    }

    const etf = data;

    // Rubrik + undertext
    setText("etfTitle", etf.namn || "ETF-detaljer");
    setText("etfSubtitle", etf.ticker ? etf.ticker : "");

    setText("etfName", etf.namn);
    setText("etfTicker", etf.ticker ? `Ticker: ${etf.ticker}` : "Ticker: -");
    setText(
      "etfIssuer",
      etf.emitent ? `Emitent: ${etf.emitent}` : "Emitent: (ej ifylld ännu)"
    );

    // Grundinfo
    setText("etfRegion", etf.region || "-");
    setText("etfTema", etf.tema || "-");
    setText("etfTillgang", etf.tillgångsslag || "-");
    setText("etfValuta", etf.valuta || "-");
    setText("etfHemvist", etf.hemvist || "-");
    setText("etfReplikering", etf.replikeringsmetod || "-");
    setText("etfUtdelning", etf.utdelningsfrekvens || "-");
    setText("etfStartdatum", etf.startdatum || "-");

    if (etf.fondstorlek) {
      const storlekNum = Number(etf.fondstorlek);
      const text =
        Number.isFinite(storlekNum) && storlekNum > 0
          ? `${storlekNum.toLocaleString("sv-SE")} MSEK`
          : "-";
      setText("etfFondstorlek", text);
    } else {
      setText("etfFondstorlek", "-");
    }

    // TER
    setText("etfTer", formatNumber(etf.ter, 2) + " %");

    // Senaste kurs
    setText("etfLastPrice", formatNumber(etf.senaste_kurs, 2));

    // 1 år
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

    // 1 år i SEK
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

    // Ladda historik för graf
    await hamtaHistorikOchRitaGraf(id, etf.valuta);
  } catch (err) {
    console.error(err);
    document.getElementById("etfSubtitle").textContent =
      "Tekniskt fel vid hämtning av ETF.";
  }
}

// === 4. Hämta historik + rita graf ===
async function hamtaHistorikOchRitaGraf(etfId, valuta) {
  const chartInfo = document.getElementById("chartInfo");

  try {
    const { data, error } = await client
      .from("HISTORIK")
      .select("*")
      .eq("etf_id", etfId)
      .order("datum", { ascending: true });

    if (error) {
      console.error(error);
      if (chartInfo) chartInfo.textContent = "Fel vid hämtning av historik.";
      return;
    }

    if (!data || data.length === 0) {
      console.log("Ingen historik för denna ETF.");
      if (chartInfo) chartInfo.textContent = "Ingen historik ännu.";
      return;
    }

    const labels = data.map((row) => row.datum);
    const values = data.map((row) =>
      Number(row.pris_sek != null ? row.pris_sek : row.pris)
    );

    if (chartInfo) {
      chartInfo.textContent =
        valuta && data[0].pris_sek != null
          ? "Pris i SEK (omräknat)."
          : "Pris i fondens valuta.";
    }

    const ctxEl = document.getElementById("priceChart");
    if (!ctxEl) return;

    const ctx = ctxEl.getContext("2d");

    if (priceChartInstance) {
      priceChartInstance.destroy();
    }

    priceChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Pris",
            data: values,
            fill: false,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
            },
          },
          y: {
            ticks: {
              maxTicksLimit: 6,
            },
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    if (chartInfo) chartInfo.textContent = "Tekniskt fel vid hämtning av historik.";
  }
}

// === 5. Start ===
hamtaEtfDetaljer();
