import os
import math
import requests
import pandas as pd
import yfinance as yf

SUPABASE_URL = os.environ["SUPABASE_URL"]  # ex: https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TABLE = "DATA"

REST_URL = f"{SUPABASE_URL}/rest/v1/{TABLE}"

HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def get_rows():
    resp = requests.get(REST_URL, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


_fx_cache: dict[str, float] = {}


def get_fx_to_sek(currency: str) -> float | None:
    """
    Hämta valutakurs currency -> SEK via yfinance, t.ex. USDSEK=X.
    Cache:ar resultat per körning.
    """
    if not currency or currency.upper() == "SEK":
        return 1.0

    cur = currency.upper()
    if cur in _fx_cache:
        return _fx_cache[cur]

    symbol = f"{cur}SEK=X"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="1d")
    if hist.empty:
        print(f"[WARN] Ingen FX-data för {symbol}")
        return None

    rate = float(hist["Close"].iloc[-1])
    _fx_cache[cur] = rate
    return rate


def compute_returns_and_size(yahoo_symbol: str):
    """
    Hämtar:
      - senaste pris
      - 1-års avkastning i lokal valuta
      - 1-års avkastning i SEK
      - fondstorlek i SEK (om tillgängligt)
    """
    t = yf.Ticker(yahoo_symbol)

    # --- Info / fondstorlek ---
    info = t.info or {}
    currency = info.get("currency") or "USD"
    total_assets = info.get("totalAssets")  # ofta i fondvaluta (USD/EUR etc.)

    fx_rate = get_fx_to_sek(currency)
    fund_size_sek = None
    if total_assets and fx_rate:
        try:
            fund_size_sek = float(total_assets) * fx_rate
        except Exception:
            pass

    # --- Pris-historik ---
    hist = t.history(period="1y")
    if hist.empty or hist["Close"].dropna().shape[0] < 2:
        print(f"[WARN] Ingen prisdata för {yahoo_symbol}")
        return None, None, fund_size_sek, None

    close = hist["Close"].dropna()
    last_price = float(close.iloc[-1])
    first_price = float(close.iloc[0])
    ret_local = (last_price / first_price - 1.0) * 100.0

    # --- SEK-avkastning ---
    ret_sek = None
    if fx_rate is not None:
        if currency.upper() == "SEK":
            # samma som lokal
            ret_sek = ret_local
        else:
            fx_symbol = f"{currency.upper()}SEK=X"
            fx_ticker = yf.Ticker(fx_symbol)
            fx_hist = fx_ticker.history(start=hist.index[0], end=hist.index[-1] + pd.Timedelta(days=1))
            if not fx_hist.empty:
                fx_close = fx_hist["Close"].reindex(hist.index, method="ffill").dropna()
                # align date range
                idx = close.index.intersection(fx_close.index)
                if len(idx) >= 2:
                    p = close.loc[idx]
                    f = fx_close.loc[idx]
                    first_sek = float(p.iloc[0] * f.iloc[0])
                    last_sek = float(p.iloc[-1] * f.iloc[-1])
                    ret_sek = (last_sek / first_sek - 1.0) * 100.0

    return last_price, ret_local, fund_size_sek, ret_sek


def update_row(row_id, payload: dict):
    url = f"{REST_URL}?id=eq.{row_id}"
    resp = requests.patch(url, headers=HEADERS, json=payload)
    try:
        resp.raise_for_status()
    except Exception as e:
        print(f"[ERROR] Misslyckades med update för id={row_id}: {resp.text}")
        raise e


def main():
    rows = get_rows()
    print(f"Hittade {len(rows)} ETF-rader")

    for r in rows:
        etf_id = r.get("id")
        symbol = r.get("yahoo_symbol")
        if not etf_id or not symbol:
            continue

        print(f"Bearbetar {symbol} (id={etf_id})...")

        try:
            last_price, ret_local, fund_size_sek, ret_sek = compute_returns_and_size(symbol)
        except Exception as e:
            print(f"[ERROR] Problem med {symbol}: {e}")
            continue

        payload = {}

        if last_price is not None and not math.isnan(last_price):
            payload["senaste_kurs"] = round(last_price, 4)

        if ret_local is not None and not math.isnan(ret_local):
            payload["avkastning_1år"] = round(ret_local, 2)

        if fund_size_sek is not None and not math.isnan(fund_size_sek):
            payload["fondstorlek_sek"] = round(fund_size_sek, 0)

        if ret_sek is not None and not math.isnan(ret_sek):
            payload["avkastning_1år_sek"] = round(ret_sek, 2)

        if payload:
            update_row(etf_id, payload)
            print(f"  Uppdaterade: {payload}")
        else:
            print("  Inget att uppdatera.")


if __name__ == "__main__":
    main()
