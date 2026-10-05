"""Configure refresh credentials through stdin; never print credential values."""
from __future__ import annotations
import argparse
import json
import os
import secrets
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'heathermhuang/platehk'
CONTROL_URL = 'https://platehk-refresh.measurable.workers.dev'


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--control-only',action='store_true',help='Configure the private control channel without enabling GitHub dispatch')
    parser.add_argument('--dispatch-token-file',type=Path,default=ROOT/'.private/refresh-dispatch-token')
    args=parser.parse_args()
    private=ROOT/'.private';private.mkdir(mode=0o700,exist_ok=True)
    path=private/'refresh-control.json'
    if path.exists(): payload=json.loads(path.read_text())
    else: payload={'CONTROL_TOKEN':secrets.token_hex(32)}
    if not args.control_only:
        if not args.dispatch_token_file.exists():
            raise SystemExit('Provide a repository-scoped GitHub Actions dispatch token in .private/refresh-dispatch-token (never paste it into chat).')
        dispatch=args.dispatch_token_file.read_text().strip()
        if not dispatch.startswith('github_pat_') or any(c.isspace() for c in dispatch):
            raise SystemExit('Use a fine-grained token restricted to PlateHK Actions write permission.')
        payload['GITHUB_DISPATCH_TOKEN']=dispatch
    path.write_text(json.dumps(payload));path.chmod(0o600)
    env={**os.environ,'WRANGLER_SEND_METRICS':'false'}
    subprocess.run(['npx','wrangler','secret','bulk','--config','refresh-worker/wrangler.jsonc'],cwd=ROOT,input=json.dumps(payload).encode(),check=True,env=env)
    subprocess.run(['gh','secret','set','REFRESH_CONTROL_TOKEN','--repo',REPOSITORY],input=payload['CONTROL_TOKEN'].encode(),check=True)
    subprocess.run(['gh','variable','set','REFRESH_CONTROL_URL','--repo',REPOSITORY,'--body',CONTROL_URL],check=True)
    print('Refresh credentials configured; no credential values were printed.')


if __name__ == '__main__':main()
