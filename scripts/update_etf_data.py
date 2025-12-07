import os
import math
import requests
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

DATA_TABLE = "DATA"
HIST_TABLE = "HISTORIK"

DATA_URL = f"{SUPABASE_URL}/rest/v1/{DATA_TABLE}"
HIST_URL = f"{SUPABASE_URL}/rest/v1/{HIST_TABLE}"

HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def get_etfer():
    r = requests.get(DATA_URL, headers=HEADERS)
    r.raise_for_status()
    return r.json()


_fx_cache: dict[str, float] = {}


def get_fx_to_sek(currency: str) -> float | None:
    if not currency or currency.upper() == "SEK":
        return 1.0
    cur = currency.upper()
    if cur in _fx_cache:
        return _fx_cache[cur]
    symbol = f"{cur}SEK=X"
    t = yf.Ticker(symbol)
    hist = t.history(period="1d")
    if hist.empty:
        print(f"[WARN] ingen FX för {symbol}")
        return None
    rate = float(hist["Close"].iloc[-1])
    _fx_cache[cur] = rate
    return rate


def upsert_history(rows: list[dict]):
    """
    Upsert mot HISTORIK via on_conflict på (etf_id, datum).
    Du måste ha unikt index på de kolumnerna i Supabase.
    """
    if not rows:
        return
    resp = requests.post(
        f"{HIST_URL}?on_conflict=etf_id,datum",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
        json=rows,
    )
    try:
        resp.raise_for_status()
    except Exception:
        print("Upsert-fel:", resp.text)
        raise


def main():
    etfer = get_etfer()
    print(f"Hittade {len(etfer)} ETF:er")

    end = datetime.utcnow().date()
    start = end - timedelta(days=730)  # 2 år bakåt

    for etf in etfer:
        etf_id = etf.get("id")
        symbol = etf.get("yahoo_symbol")
        if not etf_id or not symbol:
            continue

        print(f"Historik för {symbol}...")

        try:
            t = yf.Ticker(symbol)
            hist = t.history(start=start, end=end + timedelta(days=1))
        except Exception as e:
            print(f"[ERROR] {symbol}: {e}")
            continue

        if hist.empty:
            print(f"[WARN] ingen historik för {symbol}")
            continue

        info = t.info or {}
        currency = info.get("currency") or "USD"
        fx = get_fx_to_sek(currency)

        rows = []
        for dt, row in hist.iterrows():
            close = row.get("Close")
            if close is None or math.isnan(close):
                continue
            datum = dt.date().isoformat()
            pris = float(close)
            pris_sek = float(close * fx) if fx is not None else None

            payload = {
                "etf_id": etf_id,
                "datum": datum,
                "pris": pris,
            }
            if pris_sek is not None:
                payload["pris_sek"] = round(pris_sek, 4)

            rows.append(payload)

        print(f"  upsertar {len(rows)} rader")
        upsert_history(rows)


if __name__ == "__main__":
    main()
