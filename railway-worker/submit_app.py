"""
Submit a single grant application to the Railway worker.
Usage: python submit_app.py <applicant_pdf_path> <review_id>
"""
import sys
import json
import requests

ENDPOINT = "https://lively-wisdom-production-3e69.up.railway.app/safe-reviews/run"

APPROVED_CRITERIA = [
    {"name": "Statement of Need", "points": 20, "keywords": ["need", "population", "disparity", "gap", "data"]},
    {"name": "Response to Statement of Need", "points": 25, "keywords": ["approach", "response", "intervention", "service", "strategy"]},
    {"name": "Evaluative Measures", "points": 15, "keywords": ["evaluation", "measure", "outcome", "baseline", "target"]},
    {"name": "Impact", "points": 15, "keywords": ["impact", "sustainability", "replication", "dissemination"]},
    {"name": "Organizational Capacity", "points": 15, "keywords": ["capacity", "staff", "experience", "organization"]},
    {"name": "Support Requested", "points": 10, "keywords": ["budget", "cost", "justification", "resource"]}
]

NOFO_PATH = r"C:\Users\adeto\Downloads\HRSA 026-19\HRSA-26-019 Final NOFO.pdf"
WORKSHEET_PATH = r"C:\Users\adeto\Downloads\HRSA 026-19\HRSA-26-019_Reviewer_Worksheet.docx"

def submit(app_pdf_path, review_id):
    print(f"Submitting: {app_pdf_path}")
    print(f"Review ID:  {review_id}")

    with open(NOFO_PATH, "rb") as nofo_f, \
         open(WORKSHEET_PATH, "rb") as ws_f, \
         open(app_pdf_path, "rb") as app_f:

        basename = app_pdf_path.replace("\\", "/").split("/")[-1]
        files = [
            ("nofo", ("HRSA-26-019 Final NOFO.pdf", nofo_f, "application/pdf")),
            ("worksheet", ("HRSA-26-019_Reviewer_Worksheet.docx", ws_f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("applications", (basename, app_f, "application/pdf")),
        ]
        data = {
            "agency": "HRSA",
            "user_id": "anonymous-test",
            "review_id": review_id,
            "approved_criteria": json.dumps(APPROVED_CRITERIA),
        }
        try:
            resp = requests.post(ENDPOINT, files=files, data=data, timeout=90)
            print(f"HTTP {resp.status_code}")
            print(resp.text[:500])
            return resp
        except requests.exceptions.Timeout:
            print("Timed out (90s) — job likely running in background")
            return None
        except Exception as e:
            print(f"Error: {e}")
            return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python submit_app.py <pdf_path> <review_id>")
        sys.exit(1)
    submit(sys.argv[1], sys.argv[2])
