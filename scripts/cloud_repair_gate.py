"""Recompute escalation from evidence using trusted rules before enabling a model job."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from auto_heal_update import classify

ROOT = Path(__file__).resolve().parents[1]


def escalation_outputs(evidence: Path, repository: str) -> dict[str, str]:
    plan = json.loads((evidence / 'plan.json').read_text())
    freshness_path = evidence / 'freshness.json'
    try:
        freshness = json.loads(freshness_path.read_text())
    except (OSError, ValueError):
        freshness = None
    computed = classify((evidence / 'failed.log').read_text(), freshness,
                        json.loads((ROOT / '.github/autoheal/rules.json').read_text()))
    should_run = (plan.get('action') == 'escalate_llm_repair' and plan.get('status') == 'escalate'
                  and all(plan.get(field) == computed.get(field) for field in ('action', 'status', 'classification')))
    issue_path = evidence / 'issue.json'
    issue = json.loads(issue_path.read_text()) if issue_path.exists() else {}
    number = str(issue.get('number', ''))
    if not re.fullmatch(r'[1-9][0-9]*', number):
        number = ''
    return {'should_run': str(should_run).lower(), 'classification': computed['classification'],
            'issue_number': number, 'issue_url': f'https://github.com/{repository}/issues/{number}' if number else ''}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repository', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        raise ValueError('Invalid repository')
    with args.output.open('a') as output:
        for field, value in escalation_outputs(args.evidence, args.repository).items():
            output.write(f'{field}={value}\n')
