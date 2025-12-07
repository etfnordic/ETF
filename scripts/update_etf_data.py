import os
import datetime as dt
import requests
import yfinance as yf

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TABLE = "DATA"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def fetch_rows():
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}?select=id,yahoo_symbol"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def compute_returns(symbol):
    # Hämtar 1 års historik
    hist = yf.Ticker(symbol).history(period="1y")
    if hist.empty or len(hist) < 2:
        return None, None

    last_close = float(hist["Close"].iloc[-1])
    first_close = float(hist["Close"].iloc[0])
    ret_1y = (last_close / first_close - 1.0) * 100.0
    return last_close, ret_1y


def update_row(row_id, last_price, ret_1y):
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=eq.{row_id}"
    payload = {
        "senaste_kurs": round(last_price, 4),
        "avkastning_1år": round(ret_1y, 2),
    }
    resp = requests.patch(url, json=payload, headers=HEADERS)
    resp.raise_for_status()


def main():
    rows = fetch_rows()
    print(f"Hittade {len(rows)} rader")

    for r in rows:
        symbol = r.get("yahoo_symbol")
        row_id = r["id"]
        if not symbol:
            print(f"Hoppar över {row_id}, ingen yahoo_symbol")
            continue

        try:
            last_price, ret_1y = compute_returns(symbol)
            if last_price is None:
                print(f"Ingen data för {symbol}")
                continue

            update_row(row_id, last_price, ret_1y)
            print(f"Uppdaterade {symbol}: pris={last_price}, 1år={ret_1y:.2f}%")
        except Exception as e:
            print(f"Fel för {symbol}: {e}")


if __name__ == "__main__":
    main()
