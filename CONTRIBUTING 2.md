# Contributing

Thanks for contributing to Plate.hk.

## Scope

- Search and data products for Hong Kong vehicle registration mark auctions
- Static site assets, public API payloads, and data-generation scripts
- Source-of-truth data comes from Transport Department publications and bundled legacy workbooks

## Local setup

```bash
python3 -m pip install --user -r requirements.txt
npm install
```

Start the local site:

```bash
./scripts/run_local.sh 8080
```

## Common workflows

Rebuild the site and generated artifacts:

```bash
./scripts/build_site.sh
```

Run the validation suite:

```bash
./scripts/check_site.sh
```

Run the tracked-secret and dependency audit:

```bash
./scripts/check_security.sh
```

## Data updates

When new auction records are published, regenerate the derived artifacts before opening a PR:

```bash
python3 scripts/build_dataset.py
python3 scripts/build_tvrm_dataset.py
python3 scripts/build_tvrm_legacy_dataset.py
python3 scripts/build_all_results_preset.py
python3 scripts/build_all_search_index.py
python3 scripts/build_hot_search_cache.py
python3 scripts/build_popular_plate_pages.py
python3 scripts/build_public_api.py
python3 scripts/build_audit_report.py
python3 scripts/verify_data_integrity.py
```

## Pull requests

- Keep changes scoped and explain whether they affect generated data, frontend behavior, or both.
- Include the official source URL or document reference when adding or correcting auction data.
- Call out any intentional schema, cache, or service-worker changes.
- Do not commit secrets, credentials, or local config files.

## Security

- Review [SECURITY.md](./SECURITY.md) before changing public endpoints or OCR flows.
- Use placeholder values in examples.
- Run `python3 scripts/scan_repo_secrets.py` before shipping if you touched config, CI, or API code.
