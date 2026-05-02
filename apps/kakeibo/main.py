from fastapi import FastAPI, HTTPException, Response, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import date, timedelta
from pathlib import Path
import csv
import io
import json

from auth_utils import verify_jwt
from data import DATA_FILE, load_data, save_data

BUDGET_FILE = Path.home() / ".kakeibo-budget.json"

app = FastAPI(title="家計簿アプリ")


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    cookie = request.headers.get("cookie", "")
    token = None
    for part in cookie.split("; "):
        if part.startswith("tenforge-auth-token="):
            token = part.split("=", 1)[1]
            break
    user_id = None
    if token:
        result = verify_jwt(token)
        if result:
            user_id = result["user_id"]
    request.state.user_id = user_id
    response = await call_next(request)
    return response


def requires_auth(request: Request):
    if not request.state.user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return request.state.user_id


def load_budgets() -> dict[str, int]:
    if not BUDGET_FILE.exists():
        return {}
    with BUDGET_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def save_budgets(budgets: dict[str, int]) -> None:
    with BUDGET_FILE.open("w", encoding="utf-8") as f:
        json.dump(budgets, f, ensure_ascii=False, indent=2)


def previous_month(month: str) -> str:
    y, m = map(int, month.split("-"))
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


class RecordIn(BaseModel):
    date: str = ""
    type: str = "expense"
    category: str
    amount: int
    note: str = ""


class BudgetsIn(BaseModel):
    budgets: dict[str, int]


@app.get("/api/records")
def list_records(
    month: str | None = None,
    q: str | None = None,
    category: str | None = None,
    type: str | None = None,
    user_id: str = Depends(requires_auth),
):
    all_records = load_data(user_id)
    out = []
    ql = q.lower() if q else None
    for i, r in enumerate(all_records):
        if month is not None and not r["date"].startswith(month):
            continue
        if category is not None and r.get("category") != category:
            continue
        if type is not None and r.get("type") != type:
            continue
        if ql is not None:
            hay = (r.get("category", "") + " " + r.get("note", "")).lower()
            if ql not in hay:
                continue
        out.append({"index": i, **r})
    return out


@app.post("/api/records", status_code=201)
def create_record(body: RecordIn, user_id: str = Depends(requires_auth)):
    records = load_data(user_id)
    new = {
        "date": body.date or str(date.today()),
        "type": body.type,
        "category": body.category,
        "amount": body.amount,
        "note": body.note,
    }
    records.append(new)
    save_data(records, user_id)
    return new


@app.put("/api/records/{index}")
def update_record(index: int, body: RecordIn, user_id: str = Depends(requires_auth)):
    records = load_data(user_id)
    if index < 0 or index >= len(records):
        raise HTTPException(status_code=404, detail="Record not found")
    records[index] = {
        "date": body.date or records[index]["date"],
        "type": body.type,
        "category": body.category,
        "amount": body.amount,
        "note": body.note,
    }
    save_data(records, user_id)
    return records[index]


@app.delete("/api/records/{index}")
def delete_record(index: int, user_id: str = Depends(requires_auth)):
    records = load_data(user_id)
    if index < 0 or index >= len(records):
        raise HTTPException(status_code=404, detail="Record not found")
    removed = records.pop(index)
    save_data(records, user_id)
    return removed


def summarize(records: list[dict]) -> dict:
    income = sum(r["amount"] for r in records if r["type"] == "income")
    expense = sum(r["amount"] for r in records if r["type"] == "expense")
    by_cat: dict[str, int] = {}
    for r in records:
        if r["type"] == "expense":
            by_cat[r["category"]] = by_cat.get(r["category"], 0) + r["amount"]
    return {
        "income": income,
        "expense": expense,
        "balance": income - expense,
        "by_category": sorted(
            [{"category": k, "amount": v} for k, v in by_cat.items()],
            key=lambda x: -x["amount"],
        ),
    }


@app.get("/api/summary")
def get_summary(month: str | None = None, user_id: str = Depends(requires_auth)):
    all_records = load_data(user_id)

    if month:
        current_records = [r for r in all_records if r["date"].startswith(month)]
        prev = previous_month(month)
        previous_records = [r for r in all_records if r["date"].startswith(prev)]
    else:
        current_records = all_records
        previous_records = []

    summary = summarize(current_records)
    summary["previous"] = summarize(previous_records) if previous_records else None

    budgets = load_budgets()
    by_cat_map = {c["category"]: c["amount"] for c in summary["by_category"]}
    progress = []
    for cat, budget in budgets.items():
        spent = by_cat_map.get(cat, 0)
        progress.append({
            "category": cat,
            "budget": budget,
            "spent": spent,
            "percent": round(spent / budget * 100) if budget > 0 else 0,
        })
    summary["budgets"] = sorted(progress, key=lambda x: -x["percent"])
    return summary


@app.get("/api/trend")
def get_trend(months: int = 6, user_id: str = Depends(requires_auth)):
    all_records = load_data(user_id)
    monthly: dict[str, dict[str, int]] = {}
    for r in all_records:
        m = r["date"][:7]
        bucket = monthly.setdefault(m, {"income": 0, "expense": 0})
        if r["type"] in bucket:
            bucket[r["type"]] += r["amount"]
    today = date.today()
    result = []
    for i in range(months - 1, -1, -1):
        y, mo = today.year, today.month - i
        while mo <= 0:
            mo += 12
            y -= 1
        key = f"{y:04d}-{mo:02d}"
        bucket = monthly.get(key, {"income": 0, "expense": 0})
        result.append({"month": key, "income": bucket["income"], "expense": bucket["expense"]})
    return result


@app.get("/api/budgets")
def get_budgets(user_id: str = Depends(requires_auth)):
    return load_budgets()


@app.put("/api/budgets")
def set_budgets(body: BudgetsIn, user_id: str = Depends(requires_auth)):
    save_budgets(body.budgets)
    return body.budgets


@app.get("/api/export.csv")
def export_csv(month: str | None = None, user_id: str = Depends(requires_auth)):
    all_records = load_data(user_id)
    records = [r for r in all_records if month is None or r["date"].startswith(month)]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "type", "category", "amount", "note"])
    for r in sorted(records, key=lambda x: x["date"]):
        writer.writerow([
            r["date"], r["type"], r["category"], r["amount"], r.get("note", ""),
        ])
    filename = f"kakeibo-{month}.csv" if month else "kakeibo.csv"
    return Response(
        content="﻿" + buf.getvalue(),  # BOM for Excel UTF-8
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/")
def root():
    return FileResponse("static/index.html")


app.mount("/static", StaticFiles(directory="static"), name="static")
