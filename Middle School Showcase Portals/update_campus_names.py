import pandas as pd

xlsx_path = r"path/to/your/campus_data.xlsx"
csv_path = r"path/to/your/campus_info.csv"

df = pd.read_excel(xlsx_path)
csv = pd.read_csv(csv_path)

name_lookup = csv.set_index("Org #")["School Name"]
name_lookup.index = name_lookup.index.astype(int)

print("=== Name differences (before update) ===")
for _, row in df.iterrows():
    org = int(row["ORG #"])
    current = str(row["Campus"]).strip()
    full = str(name_lookup.get(org, "")).strip()
    if full and current != full:
        print(f"ORG {org}:")
        print(f"  Current: {current}")
        print(f"  Full:    {full}")
        print()

df["Campus"] = df["ORG #"].map(name_lookup)

missing = df["Campus"].isna().sum()
if missing:
    print(f"WARNING: {missing} rows missing full campus name")

df.to_excel(xlsx_path, index=False)
print(f"Updated: {xlsx_path}")
print(f"Rows updated: {len(df)}")

