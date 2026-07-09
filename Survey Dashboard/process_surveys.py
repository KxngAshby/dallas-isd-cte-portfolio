"""
CTE Survey Cross-Reference Processor
Reads both survey Excel files, cross-references teachers by Employee_ID,
computes priority scores (1-5), joins region data from the campus CSV,
and outputs survey_data.json / survey_data.js for the dashboard.
"""

import csv
import json
import re
import os
from collections import defaultdict
import openpyxl

# ── File paths ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_2425 = os.path.join(BASE_DIR, "2024-25 Annual CTE Program Evaluation Survey Section 2 - Shared with CTE.xlsx")
FILE_2526 = os.path.join(BASE_DIR, "2025-26 Annual CTE Program Evaluation Teacher Survey Shared with CTE Department.xlsx")
SHEET_2425 = "2024-25 CTE Teacher_Section2"
SHEET_2526 = "Section2"
OUTPUT_FILE = os.path.join(BASE_DIR, "survey_data.json")
OUTPUT_JS   = os.path.join(BASE_DIR, "survey_data.js")

# Campus information CSV provided by the district
CSV_CAMPUS = os.path.join(BASE_DIR, "Campus Information 2025-2026 - Sheet1 (1).csv")

REGION_ORDER = ["Region I", "Region II", "Region III", "Region IV", "Region V", "Region VI", "NA", "Unassigned"]

# ── Open-ended question pairs (2024-25 col keyword → 2025-26 col keyword) ──
# We match columns by searching for these substrings in the header text.
QUESTION_PAIRS = [
    {
        "key": "software",
        "label": "Software Needs",
        "key_2425": "additional or updated software",
        "key_2526": "additional or updated software",
    },
    {
        "key": "equipment_repair",
        "label": "Equipment / Furniture Repair",
        "key_2425": "currently have that needs to be repaired",
        "key_2526": "currently have that needs to be repaired",
    },
    {
        "key": "materials",
        "label": "Materials & Supplies",
        "key_2425": "additional materials and supplies",
        "key_2526": "additional materials and supplies",
    },
    {
        "key": "new_equipment",
        "label": "Additional Equipment",
        "key_2425": "additional equipment would enhance",
        "key_2526": "additional equipment would enhance",
    },
    {
        "key": "curriculum",
        "label": "Curriculum Resources",
        "key_2425": "additional curriculum resources",
        "key_2526": "additional curriculum resources",
    },
    {
        "key": "training",
        "label": "Additional Training",
        "key_2425": "additional training do you need",
        "key_2526": "additional training do you need",
    },
]

STOPWORDS = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","being","have","has","had","do","does",
    "did","will","would","could","should","may","might","shall","can","need",
    "not","no","n/a","na","none","i","my","we","our","you","your","it","its",
    "this","that","these","those","if","as","by","from","up","about","into",
    "through","during","more","also","than","then","so","what","which","who",
    "how","why","when","where","there","here","please","briefly","explain",
    "students","student","classroom","program","course","teacher","teaching",
}


def normalize_campus(name):
    if not name:
        return ""
    return re.sub(r"\s+", " ", str(name).strip()).title()


# Abbreviations to expand when building a canonical campus key for grouping.
_CAMPUS_ABBREVS = [
    (r"\bSch\b",  "School"),
    (r"\bElem\b", "Elementary"),
    (r"\bAcad\b", "Academy"),
    (r"\bCtr\b",  "Center"),
    (r"\bH S\b",  "High School"),
    (r"\bH\.S\.\b", "High School"),
]

def campus_key(name: str) -> str:
    """Return a canonical, lowercased campus name for dedup grouping."""
    s = normalize_campus(name)
    for pattern, replacement in _CAMPUS_ABBREVS:
        s = re.sub(pattern, replacement, s, flags=re.IGNORECASE)
    return s.lower()


def _name_key(name):
    """Reduce a school name to a compact comparison key for fuzzy matching."""
    s = str(name).lower()
    # Expand common abbreviations so both sides normalize the same way
    s = re.sub(r"\bhs\b", "high school", s)
    s = re.sub(r"\bms\b", "middle school", s)
    s = re.sub(r"\bes\b", "elementary school", s)
    s = re.sub(r"\bsch\b", "school", s)
    s = re.sub(r"\belem\b", "elementary", s)
    s = re.sub(r"\bacad\b", "academy", s)
    s = re.sub(r"\bdr\.?\b", "doctor", s)
    s = re.sub(r"\bst\.?\b", "saint", s)
    s = re.sub(r"\bjr\.?\b", "junior", s)
    s = re.sub(r"\bsr\.?\b", "senior", s)
    # Keep only alpha-numeric words, drop very short tokens
    words = [w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 1]
    return set(words)


def _name_similarity(a, b):
    """Jaccard similarity between two school name key-sets."""
    ka, kb = _name_key(a), _name_key(b)
    if not ka or not kb:
        return 0.0
    return len(ka & kb) / len(ka | kb)


def load_campus_regions():
    """
    Returns two dicts:
      org_to_info  : str(org_number) → {region, level, school_name}
      name_to_info : normalized_name → {region, level, school_name}
    """
    org_to_info  = {}
    name_to_info = {}

    if not os.path.exists(CSV_CAMPUS):
        print(f"  WARNING: Campus CSV not found at {CSV_CAMPUS} — regions will be Unassigned")
        return org_to_info, name_to_info

    with open(CSV_CAMPUS, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            org = row.get("Org #", "").strip()
            region = row.get("Region", "").strip() or "NA"
            level  = row.get("Level", "").strip()
            sname  = row.get("School Name", "").strip()
            info   = {"region": region, "level": level, "school_name": sname}
            if org:
                org_to_info[org] = info
            if sname:
                name_to_info[sname] = info

    print(f"  Campus CSV: {len(org_to_info)} org codes, {len(name_to_info)} school names loaded")
    return org_to_info, name_to_info


def lookup_region(org_str, campus_name, org_to_info, name_to_info):
    """
    Returns (region, level, matched_school_name).
    Priority: exact org match → fuzzy name match → Unassigned.
    """
    # 1. Exact org code match
    if org_str and org_str in org_to_info:
        info = org_to_info[org_str]
        return info["region"], info["level"], info["school_name"]

    # 2. Fuzzy name match against CSV school names
    if campus_name:
        best_score, best_info = 0.0, None
        for csv_name, info in name_to_info.items():
            score = _name_similarity(campus_name, csv_name)
            if score > best_score:
                best_score, best_info = score, info
        if best_score >= 0.40 and best_info:
            return best_info["region"], best_info["level"], best_info["school_name"]

    return "Unassigned", "", ""


def clean_text(text):
    if not text:
        return ""
    return re.sub(r"\s+", " ", str(text).strip())


def is_substantive(text):
    """Return True if the response contains real content (not blank/N/A/None)."""
    if not text:
        return False
    low = text.lower().strip()
    return low not in {"", "n/a", "na", "none", "no", "-", ".", "n.a.", "not applicable"}


def keyword_overlap(text_a, text_b, threshold=0.30):
    """
    Returns (overlap_ratio, shared_keywords).
    Splits both texts into meaningful words, ignores stopwords,
    then measures Jaccard similarity.
    """
    def words(t):
        return {w for w in re.findall(r"[a-z]+", t.lower()) if len(w) > 2 and w not in STOPWORDS}

    wa, wb = words(text_a), words(text_b)
    if not wa or not wb:
        return 0.0, []
    intersection = wa & wb
    union = wa | wb
    ratio = len(intersection) / len(union)
    return ratio, sorted(intersection)


def find_col(headers, keyword):
    """Find column index (0-based) by searching header for keyword (case-insensitive)."""
    kw = keyword.lower()
    for i, h in enumerate(headers):
        if h and kw in str(h).lower():
            return i
    return None


def load_sheet(filepath, sheetname):
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb[sheetname]
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    data = rows[1:]
    return headers, data


def build_teacher_dict(headers, data, id_col, campus_col, cluster_col,
                       last_col, first_col, email_col, org_col=None):
    teachers = {}
    for row in data:
        emp_id = row[id_col]
        if emp_id is None:
            continue
        try:
            emp_id_str = str(int(float(str(emp_id))))
        except (ValueError, TypeError):
            emp_id_str = str(emp_id).strip()

        # Capture org code if available (2024-25 only)
        org_str = ""
        if org_col is not None and row[org_col] is not None:
            try:
                org_str = str(int(float(str(row[org_col]))))
            except (ValueError, TypeError):
                org_str = str(row[org_col]).strip()

        teachers[emp_id_str] = {
            "id": emp_id_str,
            "last_name": clean_text(row[last_col]) if last_col is not None else "",
            "first_name": clean_text(row[first_col]) if first_col is not None else "",
            "email": clean_text(row[email_col]) if email_col is not None else "",
            "campus": normalize_campus(row[campus_col]) if campus_col is not None else "",
            "cluster": clean_text(row[cluster_col]) if cluster_col is not None else "",
            "org": org_str,
            "row": row,
            "headers": headers,
        }
    return teachers


def assign_priority(recurring_count, new_count, in_2425, in_2526, resolved_count):
    """
    Critical and High are reserved ONLY for recurring needs. New / non-recurring
    issues are never High or Critical, no matter how many there are.

    Priority 1 = Critical: 2+ recurring needs repeated across both years
    Priority 2 = High: exactly 1 recurring need repeated across both years
    Priority 3 = Medium: no recurring needs but 1+ active new issue this year
                 (covers returning teachers with only new issues AND first-time
                  2025-26-only respondents)
    Priority 4 = Resolved: had needs in 2024-25, nothing active this year
    Priority 5 = No 2025-26 Response: responded in 2024-25 but did not re-submit
    """
    # Recurring needs are the only path to Critical / High.
    if recurring_count >= 2:
        return 1
    if recurring_count == 1:
        return 2

    # No recurring needs below this point.
    if in_2425 and not in_2526:
        return 5              # did not re-submit this year -> bottom bucket

    # Responded this year (returning or first-time), no recurring needs.
    if new_count >= 1:
        return 3              # any new active need -> Medium
    if resolved_count > 0:
        return 4              # old needs gone, nothing new -> Resolved
    return 3


PRIORITY_LABELS = {1: "Critical", 2: "High", 3: "Medium", 4: "Resolved", 5: "No 2025-26 Response"}
PRIORITY_COLORS = {1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#9ca3af"}


def extract_top_keywords(all_texts, top_n=30):
    freq = defaultdict(int)
    for text in all_texts:
        words = re.findall(r"[a-z]+", text.lower())
        for w in words:
            if len(w) > 3 and w not in STOPWORDS:
                freq[w] += 1
    return sorted(freq.items(), key=lambda x: -x[1])[:top_n]


def main():
    print("Loading campus region data...")
    org_to_info, name_to_info = load_campus_regions()

    print("Loading 2024-25 survey...")
    h1, d1 = load_sheet(FILE_2425, SHEET_2425)

    print("Loading 2025-26 survey...")
    h2, d2 = load_sheet(FILE_2526, SHEET_2526)

    # ── Locate identity columns ──────────────────────────────────────────────
    id1      = find_col(h1, "Employee_ID")
    campus1  = find_col(h1, "Campus")
    org1     = find_col(h1, "org")
    cluster1 = find_col(h1, "Career Cluster(s) in which you teach")
    last1    = find_col(h1, "Last Name")
    first1   = find_col(h1, "First Name")
    email1   = find_col(h1, "Email")

    id2      = find_col(h2, "Employee_ID")
    campus2  = find_col(h2, "Campus")
    cluster2 = find_col(h2, "Cluster")
    if cluster2 is None:
        cluster2 = find_col(h2, "Career Cluster")
    last2    = find_col(h2, "Last Name")
    first2   = find_col(h2, "First Name")
    email2   = find_col(h2, "Email")

    print(f"  2024-25: {len(d1)} rows")
    print(f"  2025-26: {len(d2)} rows")

    t1 = build_teacher_dict(h1, d1, id1, campus1, cluster1, last1, first1, email1, org_col=org1)
    t2 = build_teacher_dict(h2, d2, id2, campus2, cluster2, last2, first2, email2)

    # ── Locate open-ended question columns ──────────────────────────────────
    q_cols_1 = {}
    q_cols_2 = {}
    for qp in QUESTION_PAIRS:
        c1 = find_col(h1, qp["key_2425"])
        c2 = find_col(h2, qp["key_2526"])
        q_cols_1[qp["key"]] = c1
        q_cols_2[qp["key"]] = c2
        print(f"  Q '{qp['label']}': 2424-25 col={c1}, 2025-26 col={c2}")

    # ── Cross-reference teachers ─────────────────────────────────────────────
    ids_both = set(t1.keys()) & set(t2.keys())
    ids_only_2425 = set(t1.keys()) - set(t2.keys())
    ids_only_2526 = set(t2.keys()) - set(t1.keys())

    print(f"\nTeachers in both years: {len(ids_both)}")
    print(f"Teachers only in 2024-25: {len(ids_only_2425)}")
    print(f"Teachers only in 2025-26: {len(ids_only_2526)}")

    teachers_out = []
    campus_stats = defaultdict(lambda: {
        "campus": "", "region": "Unassigned", "level": "",
        "teacher_count": 0, "priority_sum": 0, "rated_count": 0,
        "recurring": 0, "resolved": 0, "new_issues": 0, "teachers": []
    })
    cluster_stats = defaultdict(lambda: {
        "cluster": "", "teacher_count": 0, "recurring": 0,
        "resolved": 0, "new_issues": 0
    })

    recurring_texts_all = []

    def process_teacher(emp_id, in_2425, in_2526):
        t2425 = t1.get(emp_id)
        t2526 = t2.get(emp_id)

        # Use 2025-26 data as primary for name/campus if available
        primary = t2526 if t2526 else t2425
        campus = primary["campus"]
        cluster = primary["cluster"] or (t2425["cluster"] if t2425 else "")
        cluster = re.split(r"\s+Career Cluster", cluster)[0].strip()

        # Resolve region: prefer org code from 2024-25, fall back to name match
        org_str = (t2425 or {}).get("org", "") or ""
        region, level, _ = lookup_region(org_str, campus, org_to_info, name_to_info)

        areas = []
        recurring_count = 0
        resolved_count = 0
        new_count = 0
        active_2526_count = 0

        for qp in QUESTION_PAIRS:
            col1 = q_cols_1[qp["key"]]
            col2 = q_cols_2[qp["key"]]

            r1 = clean_text(t2425["row"][col1]) if (t2425 and col1 is not None) else ""
            r2 = clean_text(t2526["row"][col2]) if (t2526 and col2 is not None) else ""

            sub1 = is_substantive(r1)
            sub2 = is_substantive(r2)

            overlap_ratio, shared_kw = keyword_overlap(r1, r2) if (sub1 and sub2) else (0.0, [])

            if sub1 and sub2 and overlap_ratio >= 0.30:
                status = "recurring"
                recurring_count += 1
                recurring_texts_all.append(r2)
                active_2526_count += 1
            elif sub1 and not sub2:
                status = "resolved"
                resolved_count += 1
            elif sub2:
                status = "new"
                new_count += 1
                active_2526_count += 1
            elif sub1:
                status = "resolved"
                resolved_count += 1
            else:
                status = "none"

            areas.append({
                "key": qp["key"],
                "label": qp["label"],
                "status": status,
                "response_2425": r1,
                "response_2526": r2,
                "overlap_ratio": round(overlap_ratio, 3),
                "shared_keywords": shared_kw[:10],
            })

        priority = assign_priority(recurring_count, new_count, in_2425, in_2526, resolved_count)

        return {
            "id": emp_id,
            "last_name": primary["last_name"],
            "first_name": primary["first_name"],
            "email": primary["email"],
            "campus": campus,
            "cluster": cluster,
            "region": region,
            "level": level,
            "in_2425": in_2425,
            "in_2526": in_2526,
            "priority": priority,
            "priority_label": PRIORITY_LABELS[priority],
            "priority_color": PRIORITY_COLORS[priority],
            "recurring_count": recurring_count,
            "resolved_count": resolved_count,
            "new_count": new_count,
            "active_2526_count": active_2526_count,
            "areas": areas,
        }

    for emp_id in sorted(ids_both):
        rec = process_teacher(emp_id, True, True)
        teachers_out.append(rec)

    for emp_id in sorted(ids_only_2425):
        rec = process_teacher(emp_id, True, False)
        teachers_out.append(rec)

    for emp_id in sorted(ids_only_2526):
        rec = process_teacher(emp_id, False, True)
        teachers_out.append(rec)

    # ── Campus & cluster aggregates ─────────────────────────────────────────
    for t in teachers_out:
        campus  = t["campus"]  or "Unknown Campus"
        cluster = t["cluster"] or "Unknown Cluster"
        region  = t["region"]  or "Unassigned"
        level   = t["level"]   or ""

        ckey = campus_key(campus)
        cs = campus_stats[ckey]
        # Keep the longest/most complete display name seen for this campus
        if len(campus) > len(cs["campus"]):
            cs["campus"] = campus
        cs["region"] = region
        cs["level"]  = level
        cs["teacher_count"] += 1
        # Exclude "No 2025-26 Response" (P5) from urgency average so campuses
        # aren't made to look less urgent just because some teachers skipped.
        if t["priority"] != 5:
            cs["priority_sum"]  += t["priority"]
            cs["rated_count"]   += 1
        cs["recurring"]     += t["recurring_count"]
        cs["resolved"]      += t["resolved_count"]
        cs["new_issues"]    += t["new_count"]
        cs["teachers"].append(t["id"])

        cl = cluster_stats[cluster]
        cl["cluster"]       = cluster
        cl["teacher_count"] += 1
        cl["recurring"]     += t["recurring_count"]
        cl["resolved"]      += t["resolved_count"]
        cl["new_issues"]    += t["new_count"]

    campuses_out = []
    for _ckey, cs in sorted(campus_stats.items()):
        # Average only over teachers who responded in 2025-26 (rated_count).
        # If nobody responded this year, treat as low urgency (4).
        avg_priority = cs["priority_sum"] / cs["rated_count"] if cs["rated_count"] else 4
        campuses_out.append({
            "campus":        cs["campus"] or normalize_campus(_ckey),
            "region":        cs["region"],
            "level":         cs["level"],
            "teacher_count": cs["teacher_count"],
            "rated_count":   cs["rated_count"],
            "avg_priority":  round(avg_priority, 2),
            "heat_level":    round(avg_priority, 1),
            "recurring":     cs["recurring"],
            "resolved":      cs["resolved"],
            "new_issues":    cs["new_issues"],
            "teacher_ids":   cs["teachers"],
        })
    campuses_out.sort(key=lambda x: (
        REGION_ORDER.index(x["region"]) if x["region"] in REGION_ORDER else 99,
        x["avg_priority"]
    ))

    # ── Region roll-ups ──────────────────────────────────────────────────────
    region_stats = defaultdict(lambda: {
        "region": "", "campus_count": 0, "teacher_count": 0, "rated_count": 0,
        "priority_sum": 0, "recurring": 0, "resolved": 0, "new_issues": 0
    })
    for c in campuses_out:
        r = c["region"]
        rs = region_stats[r]
        rs["region"]        = r
        rs["campus_count"]  += 1
        rs["teacher_count"] += c["teacher_count"]
        rs["rated_count"]   += c["rated_count"]
        rs["priority_sum"]  += c["avg_priority"] * c["rated_count"]
        rs["recurring"]     += c["recurring"]
        rs["resolved"]      += c["resolved"]
        rs["new_issues"]    += c["new_issues"]

    regions_out = []
    for region, rs in region_stats.items():
        avg_p = rs["priority_sum"] / rs["rated_count"] if rs["rated_count"] else 4
        regions_out.append({
            "region":        rs["region"],
            "campus_count":  rs["campus_count"],
            "teacher_count": rs["teacher_count"],
            "avg_priority":  round(avg_p, 2),
            "heat_level":    round(avg_p, 1),
            "recurring":     rs["recurring"],
            "resolved":      rs["resolved"],
            "new_issues":    rs["new_issues"],
        })
    regions_out.sort(key=lambda x: (
        REGION_ORDER.index(x["region"]) if x["region"] in REGION_ORDER else 99
    ))

    clusters_out = []
    for cluster, cl in sorted(cluster_stats.items()):
        clusters_out.append({
            "cluster": cluster,
            "teacher_count": cl["teacher_count"],
            "recurring": cl["recurring"],
            "resolved": cl["resolved"],
            "new_issues": cl["new_issues"],
        })
    clusters_out.sort(key=lambda x: -x["recurring"])

    # ── Summary ─────────────────────────────────────────────────────────────
    total = len(teachers_out)
    p_counts = defaultdict(int)
    for t in teachers_out:
        p_counts[t["priority"]] += 1

    top_keywords = extract_top_keywords(recurring_texts_all, top_n=25)

    summary = {
        "total_teachers_2425": len(t1),
        "total_teachers_2526": len(t2),
        "teachers_both_years": len(ids_both),
        "teachers_only_2425": len(ids_only_2425),
        "teachers_only_2526": len(ids_only_2526),
        "total_unique_teachers": total,
        "priority_counts": {str(k): v for k, v in sorted(p_counts.items())},
        "total_campuses": len(campuses_out),
        "total_regions": len(regions_out),
        "total_clusters": len(clusters_out),
    }

    # ── Priority queue (sorted by priority asc, then recurring desc) ─────────
    priority_queue = sorted(
        [t for t in teachers_out if t["in_2526"] or t["in_2425"]],
        key=lambda x: (x["priority"], -x["recurring_count"], x["last_name"])
    )

    output = {
        "summary": summary,
        "teachers": teachers_out,
        "campuses": campuses_out,
        "regions":  regions_out,
        "clusters": clusters_out,
        "priority_queue": [t["id"] for t in priority_queue],
        "priority_labels": PRIORITY_LABELS,
        "priority_colors": PRIORITY_COLORS,
        "question_areas": [{"key": q["key"], "label": q["label"]} for q in QUESTION_PAIRS],
        "region_order": REGION_ORDER,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    js_payload = json.dumps(output, ensure_ascii=False)
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(f"var SURVEY_DATA = {js_payload};\n")

    print(f"\nDone. Wrote {OUTPUT_FILE}")
    print(f"Done. Wrote {OUTPUT_JS}")
    print(f"  Total unique teachers: {total}")
    print(f"  Priority breakdown: {dict(sorted(p_counts.items()))}")
    print(f"  Campuses: {len(campuses_out)}")
    print(f"  Regions: {[r['region'] for r in regions_out]}")


if __name__ == "__main__":
    main()
