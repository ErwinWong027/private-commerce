#!/usr/bin/env python3
"""执行售前问答用例并把 node:test 的真实结果落成 YAML / HTML 报告。

用例数与明细一律从 `npm test` 的 TAP 输出动态解析，不再硬编码。
"""
import os
import re
import subprocess
import sys
import yaml

REPORT_DIR = sys.argv[2] if len(sys.argv) > 2 else "tests/reports"
CASE_LINE = re.compile(r"^\s*(?:not ok|ok)\s+\d+\s+-\s+(.*?)(?:\s+#.*)?$")


def run_suite():
    result = subprocess.run(
        ["npm", "run", "--silent", "test:tap"],
        capture_output=True,
        text=True,
        check=False,
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.stdout, result.returncode


def parse_cases(output):
    cases = []
    for line in output.splitlines():
        matched = CASE_LINE.match(line)
        if not matched:
            continue
        name = matched.group(1).strip()
        if not name:
            continue
        passed = not line.lstrip().startswith("not ok")
        cases.append({"id": name, "status": "PASSED" if passed else "FAILED"})
    return cases


def main():
    print("=== Starting Presales QA Verification Suite ===")
    output, exit_code = run_suite()
    cases = parse_cases(output)
    passed = sum(1 for case in cases if case["status"] == "PASSED")
    failed = len(cases) - passed

    os.makedirs(REPORT_DIR, exist_ok=True)
    yaml_report_path = os.path.join(REPORT_DIR, "all_report.yaml")
    html_report_path = os.path.join(REPORT_DIR, "all_report.html")

    yaml_data = {
        "summary": {
            "total_cases": len(cases),
            "passed": passed,
            "failed": failed,
            "success_rate": f"{(passed / len(cases) * 100):.0f}%" if cases else "N/A",
        },
        "details": cases,
    }

    with open(yaml_report_path, "w", encoding="utf-8") as f:
        yaml.dump(yaml_data, f, allow_unicode=True)

    rows = "".join(
        f"""
            <tr>
                <td>{case['id']}</td>
                <td class="status-{case['status'].lower()}">{case['status']}</td>
            </tr>
        """
        for case in cases
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>售前问答用例执行报告</title>
    <style>
        body {{ font-family: sans-serif; padding: 20px; background-color: #f8fafc; color: #1e293b; }}
        h1 {{ color: #1e3a8a; }}
        .summary {{ background: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 12px; text-align: left; }}
        th {{ background: #f1f5f9; }}
        .status-passed {{ color: #15803d; font-weight: bold; }}
        .status-failed {{ color: #b91c1c; font-weight: bold; }}
    </style>
</head>
<body>
    <h1>售前问答用例执行报告</h1>
    <div class="summary">
        总用例数: {yaml_data['summary']['total_cases']} |
        通过: {yaml_data['summary']['passed']} |
        失败: {yaml_data['summary']['failed']} |
        通过率: {yaml_data['summary']['success_rate']}
    </div>
    <table>
        <thead>
            <tr><th>用例</th><th>执行状态</th></tr>
        </thead>
        <tbody>
    {rows}
        </tbody>
    </table>
</body>
</html>
"""

    with open(html_report_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"Created HTML report at: {html_report_path}")
    print(f"Created YAML report at: {yaml_report_path}")
    print(f"=== Verification Suite Complete: {passed}/{len(cases)} passed ===")
    return 0 if exit_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
