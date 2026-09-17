"""
extract_engnovate.py
Automated Cambridge IELTS Speaking Question Extractor from Engnovate.
Extracts questions for Cambridge 21 down to 14 (Tests 1 to 4).
Solves the client-side Hashcash proof-of-work challenge automatically.
Saves canonical dataset to ielts_speaking_questions.json and frontend/src/cambridgeTests.js.
"""

import os
import sys
import time
import json
import re
import base64
import hashlib
import urllib.parse
import requests
from bs4 import BeautifulSoup

if sys.stdout:
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_OUTPUT_PATH = os.path.join(BASE_DIR, "ielts_speaking_questions.json")
JS_OUTPUT_PATH = os.path.join(BASE_DIR, "frontend", "src", "cambridgeTests.js")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1"
}

def solve_challenge(session: requests.Session, target_url: str):
    """
    Solves Engnovate's Hashcash SHA-256 client-side challenge to obtain session cookies.
    """
    try:
        r = session.get(target_url, headers=HEADERS, timeout=10)
        if r.status_code == 200 and "ielts-speaking-question" in r.text:
            return True

        set_cookie = r.headers.get("Set-Cookie", "")
        m = re.search(r"_hcc=([^;]+)", set_cookie)
        if not m:
            return False

        hcc = m.group(1)
        session.cookies.set("_hcc", hcc, domain="engnovate.com", path="/")
        b64_part = hcc.split(":")[1]
        decoded = base64.b64decode(b64_part).decode("utf-8")

        t0 = time.time()
        prefix_bytes = decoded.encode("utf-8")
        solution = None
        for n in range(5000000):
            if hashlib.sha256(prefix_bytes + str(n).encode("utf-8")).hexdigest().startswith("0000"):
                solution = decoded + str(n)
                break

        if not solution:
            return False

        solve_ms = int((time.time() - t0) * 1000)
        sol_b64 = base64.b64encode(solution.encode("utf-8")).decode("utf-8")
        env_str = f"ua={urllib.parse.quote(UA)};lang=en-US%2Cen;wd=0;tz=UTC;dpr=1;hc=8"

        ch_headers = {
            "User-Agent": UA,
            "X-Hashcash-Solution": sol_b64,
            "X-Hashcash-Solve-Ms": str(solve_ms),
            "X-Hashcash-Host": "engnovate.com",
            "X-Hashcash-Env": env_str,
            "X-Interactive": "",
            "Referer": target_url,
            "Origin": "https://engnovate.com"
        }

        ch_res = session.post("https://engnovate.com/__challenge", headers=ch_headers, timeout=10)
        return ch_res.status_code == 200
    except Exception as e:
        print(f"[!] Challenge solver error: {e}")
        return False


def parse_speaking_test(html: str):
    """
    Parses Part 1, Part 2, and Part 3 questions from an Engnovate test HTML document.
    """
    soup = BeautifulSoup(html, "html.parser")
    
    # 1. Map questions to parts via palette section
    part_mapping = {"Part 1": [], "Part 2": [], "Part 3": []}
    palette_sections = soup.find_all(class_="ielts-speaking-palette-section")
    for sec in palette_sections:
        part_tag = sec.find(class_="ielts-speaking-palette-section-part")
        if not part_tag:
            continue
        p_name = part_tag.get_text(strip=True).replace(":", "")
        q_items = [q.get_text(strip=True) for q in sec.find_all(class_="ielts-speaking-palette-item")]
        if "Part 1" in p_name:
            part_mapping["Part 1"].extend(q_items)
        elif "Part 2" in p_name:
            part_mapping["Part 2"].extend(q_items)
        elif "Part 3" in p_name:
            part_mapping["Part 3"].extend(q_items)

    # 2. Extract question text
    questions_by_num = {}
    for q in soup.find_all(class_="ielts-speaking-question"):
        num_tag = q.find(class_="question-number")
        text_tag = q.find(class_="question-text")
        if num_tag and text_tag:
            m = re.search(r"\d+", num_tag.get_text())
            if m:
                q_num = m.group(0)
                txt = text_tag.get_text("\n", strip=True)
                questions_by_num[q_num] = txt

    # Build parts
    part_1 = [questions_by_num[n] for n in part_mapping["Part 1"] if n in questions_by_num]
    part_2_list = [questions_by_num[n] for n in part_mapping["Part 2"] if n in questions_by_num]
    part_3 = [questions_by_num[n] for n in part_mapping["Part 3"] if n in questions_by_num]

    part_2 = "\n\n".join(part_2_list) if part_2_list else ""

    # Fallback heuristic if palette was not found or empty
    if not part_1 and questions_by_num:
        all_nums = sorted([int(k) for k in questions_by_num.keys()])
        if len(all_nums) >= 6:
            # 1-4 is Part 1, 5 is Part 2, 6+ is Part 3
            part_1 = [questions_by_num[str(n)] for n in all_nums if n <= 4 and str(n) in questions_by_num]
            part_2 = questions_by_num.get("5", "")
            part_3 = [questions_by_num[str(n)] for n in all_nums if n >= 6 and str(n) in questions_by_num]

    return {
        "part_1": part_1,
        "part_2": part_2,
        "part_3": part_3
    }


def extract_all_tests():
    session = requests.Session()
    books = list(range(21, 13, -1)) # Books 21 down to 14
    all_tests = []

    print(f"[*] Initializing session challenge bypass...")
    init_url = "https://engnovate.com/ielts-speaking-tests/cambridge-ielts-21-academic-speaking-test-1/"
    solve_challenge(session, init_url)

    total_target = len(books) * 4
    extracted_count = 0

    for book in books:
        for test in range(1, 5):
            test_id = f"cambridge-{book}-test-{test}"
            test_title = f"Cambridge IELTS {book} - Test {test}"
            url = f"https://engnovate.com/ielts-speaking-tests/cambridge-ielts-{book}-academic-speaking-test-{test}/"

            print(f"[*] Extracting {test_title} ...", end=" ", flush=True)

            try:
                res = session.get(url, headers=HEADERS, timeout=12)
                if res.status_code == 403 or "ielts-speaking-question" not in res.text:
                    # Challenge re-trigger
                    solve_challenge(session, url)
                    res = session.get(url, headers=HEADERS, timeout=12)

                if res.status_code == 200 and "ielts-speaking-question" in res.text:
                    data = parse_speaking_test(res.text)
                    if data["part_1"] and data["part_2"]:
                        record = {
                            "id": test_id,
                            "title": test_title,
                            "book": book,
                            "test": test,
                            "part_1": data["part_1"],
                            "part_2": data["part_2"],
                            "part_3": data["part_3"]
                        }
                        all_tests.append(record)
                        extracted_count += 1
                        print(f"OK (P1: {len(data['part_1'])}, P2: Cue Card, P3: {len(data['part_3'])})")
                    else:
                        print(f"EMPTY PARSE")
                else:
                    print(f"FAIL (Status {res.status_code})")
            except Exception as e:
                print(f"ERROR: {e}")

            time.sleep(0.3)

    print(f"\n[+] Successfully extracted {extracted_count}/{total_target} Cambridge IELTS Speaking tests!")

    # Save to JSON database
    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_tests, f, indent=2, ensure_ascii=False)
    print(f"[+] Saved canonical JSON database to: {JSON_OUTPUT_PATH}")

    # Generate JavaScript module for frontend
    js_code = "// Auto-generated Cambridge IELTS Speaking Tests database extracted from Engnovate\n"
    js_code += f"// Generated on: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    js_code += f"// Total tests: {len(all_tests)} (Cambridge {books[0]} down to {books[-1]})\n\n"
    js_code += "export const CAMBRIDGE_TESTS = " + json.dumps(all_tests, indent=2, ensure_ascii=False) + ";\n\n"
    js_code += "export const getCambridgeTestById = (id) => {\n"
    js_code += "  return CAMBRIDGE_TESTS.find(test => test.id === id) || CAMBRIDGE_TESTS[0];\n"
    js_code += "};\n"

    with open(JS_OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(js_code)
    print(f"[+] Exported frontend module to: {JS_OUTPUT_PATH}")

    return all_tests


if __name__ == "__main__":
    extract_all_tests()
