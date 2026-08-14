#!/usr/bin/env python3
"""Remove only the temporary asset-cleanup verification fixtures.

The script refuses to remove an asset referenced by an active label template and
prints before/after evidence suitable for the cleanup verification report.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "sqlite-databases" / "printer.db"
ASSET_DIR = ROOT / "sqlite-databases" / "label-assets"
FIXTURE_NAME = "verify-delete-icon.svg"
FIXTURE_FILES = {
    "dab06555-7c80-4f61-a9ca-cbb8be7b4ec4.svg",
    "15aeaebe-778f-4bb9-8ea3-05d67549d575.svg",
}


def referenced_by_active_template(connection: sqlite3.Connection, asset_id: str) -> list[str]:
    matches: list[str] = []
    needle = asset_id.lower()
    for template_id, payload in connection.execute(
        "select id, template_json from label_templates where is_active = 1"
    ):
        if needle in (payload or "").lower():
            matches.append(template_id)
    return matches


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    with sqlite3.connect(DB) as connection:
        rows = connection.execute(
            "select id, name, storage_path from label_assets where name = ?",
            (FIXTURE_NAME,),
        ).fetchall()
        print(json.dumps({"before_rows": rows}, indent=2))

        for asset_id, _name, storage_path in rows:
            references = referenced_by_active_template(connection, asset_id)
            if references:
                raise RuntimeError(
                    f"Refusing to remove {asset_id}; active templates reference it: {references}"
                )
            connection.execute("delete from label_assets where id = ?", (asset_id,))
            if storage_path:
                candidate = (ASSET_DIR / storage_path).resolve()
                if ASSET_DIR.resolve() in candidate.parents and candidate.exists():
                    candidate.unlink()

        removed_files: list[str] = []
        for filename in FIXTURE_FILES:
            candidate = ASSET_DIR / filename
            if candidate.exists() and file_hash(candidate).startswith("bcc26b60f0983791"):
                candidate.unlink()
                removed_files.append(filename)
        connection.commit()

        after_rows = connection.execute(
            "select id, name, storage_path from label_assets where name = ?",
            (FIXTURE_NAME,),
        ).fetchall()
        remaining_files = [name for name in FIXTURE_FILES if (ASSET_DIR / name).exists()]
        print(json.dumps({
            "after_rows": after_rows,
            "removed_files": removed_files,
            "remaining_fixture_files": remaining_files,
        }, indent=2))
        if after_rows or remaining_files:
            raise RuntimeError("Temporary fixture cleanup verification failed")


if __name__ == "__main__":
    main()
