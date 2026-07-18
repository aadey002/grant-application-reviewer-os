import json
import unittest
from pathlib import Path
from unittest.mock import patch
from grant_reviewer.safe_review import find_evidence, review_application, run_manifest

class SafeReviewTests(unittest.TestCase):
    def test_page_citations_are_actual(self):
        evidence = find_evidence(["No relevant narrative here.", "The evaluation includes measurable outcomes and baseline data."], ["evaluation", "outcomes", "baseline"])
        self.assertEqual(evidence[0].page, 2)
        self.assertIn("baseline data", evidence[0].quote)

    @patch("grant_reviewer.safe_review.extract_pdf_pages", return_value=["A " * 300])
    def test_missing_is_zero_not_midpoint(self, _):
        result = review_application("r1", Path("app.pdf"), [{"name":"Budget","points":20,"keywords":["budget"]}])
        item = result["criteria"][0]
        self.assertEqual((item["status"], item["automated_points"], item["final_points"]), ("not_found", 0, None))

    @patch("grant_reviewer.safe_review.extract_pdf_pages", return_value=["short"])
    def test_short_document_is_unable(self, _):
        self.assertEqual(review_application("r1", Path("app.pdf"))["review_status"], "unable_to_evaluate")

    def test_manifest_requires_three(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.json"
            manifest.write_text(json.dumps({"reviews":[]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exactly three"):
                run_manifest(manifest, Path(directory) / "out")

if __name__ == "__main__":
    unittest.main()
