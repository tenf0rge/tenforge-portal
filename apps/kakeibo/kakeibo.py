#!/usr/bin/env python3
"""家計簿CLIツール - 収支を記録・集計する"""

import argparse
import sys
from datetime import date

from data import load_data, save_data


def cmd_add(args: argparse.Namespace) -> None:
    records = load_data()
    record = {
        "date": args.date or str(date.today()),
        "type": args.type,
        "category": args.category,
        "amount": args.amount,
        "note": args.note or "",
    }
    records.append(record)
    save_data(records)
    sign = "+" if args.type == "income" else "-"
    print(f"追加しました: {record['date']} [{record['category']}] {sign}{args.amount:,}円 {record['note']}")


def cmd_list(args: argparse.Namespace) -> None:
    records = load_data()
    if not records:
        print("記録がありません。")
        return

    if args.month:
        records = [r for r in records if r["date"].startswith(args.month)]

    if not records:
        print(f"{args.month} の記録がありません。")
        return

    print(f"{'日付':<12} {'種別':<8} {'カテゴリ':<12} {'金額':>10}  メモ")
    print("-" * 60)
    for r in sorted(records, key=lambda x: x["date"]):
        sign = "+" if r["type"] == "income" else "-"
        amount_str = f"{sign}{r['amount']:,}円"
        print(f"{r['date']:<12} {r['type']:<8} {r['category']:<12} {amount_str:>10}  {r['note']}")


def cmd_summary(args: argparse.Namespace) -> None:
    records = load_data()
    if not records:
        print("記録がありません。")
        return

    if args.month:
        records = [r for r in records if r["date"].startswith(args.month)]
        label = args.month
    else:
        label = "全期間"

    income_total = sum(r["amount"] for r in records if r["type"] == "income")
    expense_total = sum(r["amount"] for r in records if r["type"] == "expense")

    expense_by_cat: dict[str, int] = {}
    for r in records:
        if r["type"] == "expense":
            expense_by_cat[r["category"]] = expense_by_cat.get(r["category"], 0) + r["amount"]

    print(f"\n=== {label} の集計 ===")
    print(f"  収入合計: +{income_total:>10,}円")
    print(f"  支出合計: -{expense_total:>10,}円")
    print(f"  収支差分:  {income_total - expense_total:>10,}円")

    if expense_by_cat:
        print("\n  --- 支出カテゴリ別 ---")
        for cat, amount in sorted(expense_by_cat.items(), key=lambda x: -x[1]):
            print(f"  {cat:<14} {amount:>8,}円")


def cmd_delete(args: argparse.Namespace) -> None:
    records = load_data()
    if args.index < 0 or args.index >= len(records):
        print(f"エラー: インデックス {args.index} は存在しません（0〜{len(records)-1}）")
        sys.exit(1)
    removed = records.pop(args.index)
    save_data(records)
    print(f"削除しました: {removed['date']} [{removed['category']}] {removed['amount']:,}円")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kakeibo",
        description="シンプルな家計簿CLIツール",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # add
    p_add = sub.add_parser("add", help="収支を追加する")
    p_add.add_argument("amount", type=int, help="金額（円）")
    p_add.add_argument("category", help="カテゴリ（例: 食費, 交通費, 給与）")
    p_add.add_argument(
        "-t", "--type",
        choices=["expense", "income"],
        default="expense",
        help="種別: expense（支出）/ income（収入）[デフォルト: expense]",
    )
    p_add.add_argument("-d", "--date", help="日付 YYYY-MM-DD（省略時: 今日）")
    p_add.add_argument("-n", "--note", help="メモ")

    # list
    p_list = sub.add_parser("list", help="記録を一覧表示する")
    p_list.add_argument("-m", "--month", help="絞り込む月 YYYY-MM")

    # summary
    p_sum = sub.add_parser("summary", help="カテゴリ別集計を表示する")
    p_sum.add_argument("-m", "--month", help="絞り込む月 YYYY-MM")

    # delete
    p_del = sub.add_parser("delete", help="指定インデックスの記録を削除する")
    p_del.add_argument("index", type=int, help="削除する記録のインデックス番号（list で確認）")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        "add": cmd_add,
        "list": cmd_list,
        "summary": cmd_summary,
        "delete": cmd_delete,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
