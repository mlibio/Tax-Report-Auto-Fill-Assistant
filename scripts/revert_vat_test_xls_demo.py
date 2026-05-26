# -*- coding: utf-8 -*-
"""撤回 patch_vat_test_xls_demo.py 对 test.xls 主表「一般项目本月数」列的写入。"""
from __future__ import annotations

import os
import sys

CORRUPT_LOAD_REPAIR = 2
DEFAULT_REL = (
    "1.《增值税及附加税费申报表（一般纳税人适用）》及其附列资料-test.xls"
)


def main() -> None:
    try:
        import win32com.client as win32
    except ImportError as e:
        print("需要 pywin32：pip install pywin32", e, file=sys.stderr)
        sys.exit(1)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, DEFAULT_REL)
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        print("文件不存在:", path, file=sys.stderr)
        sys.exit(1)

    # 与 patch 脚本相同的 (xlrd_row, col)，恢复为打补丁前的值
    restore_number: dict[tuple[int, int], float] = {
        (13, 18): 0.0,
        (15, 18): 0.0,
        (24, 18): 0.0,
        (29, 18): 0.0,
        (31, 18): 0.0,
        (35, 18): 0.0,
        (38, 18): 0.0,
        (42, 18): 0.0,
        (44, 18): 0.0,
        (47, 18): 0.0,
    }
    clear_cells = [(51, 18)]  # line41 原为空白

    excel = win32.Dispatch("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    wb = None
    try:
        wb = excel.Workbooks.Open(
            path,
            False,
            False,
            None,
            None,
            None,
            False,
            None,
            None,
            False,
            False,
            None,
            False,
            None,
            CORRUPT_LOAD_REPAIR,
        )
        ws = wb.Worksheets("主表")
        for (xr, xc), val in restore_number.items():
            cell = ws.Cells(xr + 1, xc + 1)
            fm = str(cell.Formula).strip() if cell.Formula else ""
            if fm.startswith("="):
                continue
            cell.Value = float(val)
        for xr, xc in clear_cells:
            cell = ws.Cells(xr + 1, xc + 1)
            fm = str(cell.Formula).strip() if cell.Formula else ""
            if fm.startswith("="):
                continue
            # 勿用 ClearContents：可能删除末行导致主表少一行（第 41 栏所在行）
            cell.Value = ""

        excel.CalculateFullRebuild()
        xlExcel8 = 56
        wb.SaveAs(path, FileFormat=xlExcel8)
        sys.stdout.reconfigure(encoding="utf-8")
        print("已恢复并保存:", path)
    finally:
        if wb is not None:
            wb.Close(SaveChanges=False)
        excel.Quit()


if __name__ == "__main__":
    main()
