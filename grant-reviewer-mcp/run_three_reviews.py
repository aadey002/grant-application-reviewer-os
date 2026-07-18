#!/usr/bin/env python3
import argparse
from pathlib import Path
from src.grant_reviewer.safe_review import run_manifest

parser = argparse.ArgumentParser(description="Run three isolated evidence-first grant reviews")
parser.add_argument("manifest", type=Path)
parser.add_argument("--output", type=Path, default=Path("review-output"))
args = parser.parse_args()
for result in run_manifest(args.manifest, args.output):
    print(f"{result['review_id']}: {result['review_status']} ({result['page_count']} pages)")
