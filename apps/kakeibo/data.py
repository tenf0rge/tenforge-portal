import json
from pathlib import Path

DATA_FILE = Path.home() / ".kakeibo.json"


def load_data(user_id: str | None = None) -> list[dict]:
    if user_id:
        file = DATA_FILE.parent / f".kakeibo-{user_id}.json"
    else:
        file = DATA_FILE
    if not file.exists():
        return []
    with file.open(encoding="utf-8") as f:
        return json.load(f)


def save_data(records: list[dict], user_id: str | None = None) -> None:
    if user_id:
        file = DATA_FILE.parent / f".kakeibo-{user_id}.json"
    else:
        file = DATA_FILE
    with file.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
