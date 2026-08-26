import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackendBuildContractTests(unittest.TestCase):
    def test_tracked_catalog_matches_published_chunk_contract(self) -> None:
        index = json.loads((ROOT / "api" / "v1" / "index.json").read_text(encoding="utf-8"))
        all_manifest = json.loads((ROOT / "data" / "all" / "issues.manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(index["generated_at"], all_manifest["generated_at"])
        for dataset, metadata in index["datasets"].items():
            self.assertNotIn("results_slim", metadata["files"])
            self.assertEqual(
                metadata["files"]["results_chunks_manifest"],
                f"/api/v1/{dataset}/results.chunks.json",
            )

    def test_cloudflare_results_export_has_bounded_sort_indexes(self) -> None:
        module = _load_script("build_cloudflare_public_contract", "build_cloudflare_public.py")
        rows = [
            {"single_line": "B 2", "auction_date": "2025-01-01", "amount_hkd": None},
            {"single_line": "C 3", "auction_date": "2024-01-01", "amount_hkd": 50},
            {"single_line": "A 1", "auction_date": "2026-01-01", "amount_hkd": 100},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "api" / "v1" / "all" / "results.slim.json"
            source.parent.mkdir(parents=True)
            source.write_text(json.dumps(rows), encoding="utf-8")
            child_source = root / "api" / "v1" / "tvrm_physical" / "results.slim.json"
            child_source.parent.mkdir(parents=True)
            child_source.write_text(json.dumps(rows), encoding="utf-8")
            module.ROOT = root
            module.TARGET = root / "publish"
            module.RESULTS_CHUNK_ROWS = 2

            module.build_results_chunks("all")
            module.build_results_chunks("tvrm_physical")

            dataset_dir = module.TARGET / "api" / "v1" / "all"
            manifest = json.loads((dataset_dir / "results.chunks.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema_version"], 1)
            self.assertEqual(manifest["format"], "json-array-chunks")
            self.assertEqual(set(manifest["sort_indexes"]), {"amount_desc", "amount_asc", "plate_asc"})

            def ordered_plates(sort: str) -> list[str]:
                result = []
                for chunk in manifest["sort_indexes"][sort]["chunks"]:
                    result.extend(json.loads((dataset_dir / chunk["file"]).read_text(encoding="utf-8")))
                return [row["single_line"] for row in result]

            self.assertEqual(ordered_plates("amount_desc"), ["A 1", "C 3", "B 2"])
            self.assertEqual(ordered_plates("amount_asc"), ["B 2", "C 3", "A 1"])
            self.assertEqual(ordered_plates("plate_asc"), ["A 1", "B 2", "C 3"])
            child_manifest = json.loads(
                (module.TARGET / "api" / "v1" / "tvrm_physical" / "results.chunks.json").read_text(encoding="utf-8")
            )
            self.assertEqual(set(child_manifest["sort_indexes"]), {"amount_desc", "amount_asc", "plate_asc"})

            index_path = module.TARGET / "api" / "v1" / "index.json"
            index_path.write_text(json.dumps({
                "datasets": {
                    "all": {"files": {"results_slim": "/api/v1/all/results.slim.json"}},
                },
            }), encoding="utf-8")
            module.update_results_export_catalog()
            publish_index = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertNotIn("results_slim", publish_index["datasets"]["all"]["files"])
            self.assertEqual(
                publish_index["datasets"]["all"]["files"]["results_chunks_manifest"],
                "/api/v1/all/results.chunks.json",
            )

            module.build_complete_search_index([
                {
                    "dataset_key": "pvrm",
                    "auction_key": "pvrm::2026-01-01",
                    "auction_date": "2026-01-01",
                    "single_line": "A8",
                    "amount_hkd": 100,
                },
            ], dataset_dir)
            search_meta = json.loads((dataset_dir / "search-index" / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(search_meta["char_counts"]["8"], 1)
            char_rows = json.loads(
                (dataset_dir / "search-index" / "char1" / "8.json").read_text(encoding="utf-8")
            )["rows"]
            self.assertEqual(len(char_rows), 1)

    def test_public_catalog_advertises_chunk_manifest_not_removed_flat_file(self) -> None:
        module = _load_script("build_public_api_contract", "build_public_api.py")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            module.API = root / "api" / "v1"
            module.DATASETS = {
                dataset: root / "data" / dataset
                for dataset in ("all", "pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy")
            }
            for dataset, base in module.DATASETS.items():
                base.mkdir(parents=True)
                manifest = {"issue_count": 0, "total_rows": 0, "issues": []}
                if dataset == "all":
                    manifest["generated_at"] = "2026-08-12"
                (base / "issues.manifest.json").write_text(
                    json.dumps(manifest),
                    encoding="utf-8",
                )
                (base / "auctions.json").write_text("[]", encoding="utf-8")
                (base / "results.slim.json").write_text("[]", encoding="utf-8")
                (base / "preset.amount_desc.top1000.json").write_text("[]", encoding="utf-8")

            module.build()

            index = json.loads((module.API / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["generated_at"], "2026-08-12")
            for dataset, metadata in index["datasets"].items():
                self.assertNotIn("results_slim", metadata["files"])
                self.assertEqual(
                    metadata["files"]["results_chunks_manifest"],
                    f"/api/v1/{dataset}/results.chunks.json",
                )
                export_manifest = json.loads(
                    (module.API / dataset / "results.chunks.json").read_text(encoding="utf-8")
                )
                for chunk in export_manifest["chunks"]:
                    self.assertTrue((module.API / dataset / chunk["file"]).exists())
                self.assertEqual(metadata["results_export"]["format"], "json-array-chunks")

            openapi = (ROOT / "api" / "openapi.yaml").read_text(encoding="utf-8")
            self.assertNotIn("/api/v1/{dataset}/results.slim.json", openapi)
            self.assertIn("/api/v1/{dataset}/results.chunks.json", openapi)

            all_manifest_path = module.DATASETS["all"] / "issues.manifest.json"
            all_manifest = json.loads(all_manifest_path.read_text(encoding="utf-8"))
            all_manifest.pop("generated_at")
            all_manifest_path.write_text(json.dumps(all_manifest), encoding="utf-8")
            module.build()
            rebuilt_index = json.loads((module.API / "index.json").read_text(encoding="utf-8"))
            self.assertIsNone(rebuilt_index["generated_at"])


if __name__ == "__main__":
    unittest.main()
