"""Extract authorized company samples without floats or database access (stdlib only)."""
import argparse, hashlib, json, re, zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
ROOT = Path(__file__).resolve().parent
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
SHEETS = {"Sample Info Data":"info", "Sample CML Data":"cml", "Sample TP Data":"testPoints", "Sample Thickness Data":"thickness"}
DECIMALS = {"pipe_size", "original_thickness", "operating_temperature", "actual_outside_diameter", "design_ thickness", "structural_ thickness", "required_ thickness", "actual_thickness"}
INTEGERS = {"cml_number", "tp_number", "tp_description", "stress", "joint_efficiency", "ca", "design_life", "design_pressure", "operating_pressure", "design_temperature"}

def export(workbook):
    data, corrections = {}, []
    with zipfile.ZipFile(workbook) as z:
        shared = ["".join(s.itertext()) for s in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        rels = {r.attrib["Id"]:r.attrib["Target"] for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        book = ET.fromstring(z.read("xl/workbook.xml"))
        prop = book.find("m:workbookPr", NS)
        if prop is not None and prop.attrib.get("date1904") in ("1","true"):
            raise ValueError("Unexpected workbook date system")
        for sheet in book.findall("m:sheets/m:sheet", NS):
            name = sheet.attrib["name"]
            if name.strip() not in SHEETS: continue
            target = rels[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            cells = {}
            for c in ET.fromstring(z.read(target)).findall(".//m:sheetData/m:row/m:c", NS):
                if c.find("m:f", NS) is not None: raise ValueError("Sample formulas require explicit review")
                v = c.find("m:v", NS); raw = v.text if v is not None else None
                if c.attrib.get("t") == "s" and raw is not None: raw = shared[int(raw)]
                elif c.attrib.get("t") == "inlineStr": raw = "".join(c.find("m:is", NS).itertext())
                cells[c.attrib["r"]] = raw
            headers = {re.sub(r"\d+", "", a):" ".join(v.split()) for a,v in cells.items() if v and re.search(r"\d+$",a).group()=="4"}
            rows = sorted({int(re.search(r"\d+$",a).group()) for a,v in cells.items() if v is not None and int(re.search(r"\d+$",a).group())>=5})
            records = []
            for row in rows:
                record = {}
                for col,field in headers.items():
                    address = f"{col}{row}"; value = cells.get(address)
                    if value is not None and field in DECIMALS:
                        # This exact, approved display correction is NOT a blanket rounding policy.
                        if name == "Sample Info Data" and address in ("S7","S8","S9"):
                            if value != "73.270000000000039": raise ValueError("Temperature source changed; review normalization")
                            corrections.append({"sheet":name,"cell":address,"raw":value,"imported":"73.27","reason":"Approved displayed-value import, not an engineering rounding rule"})
                            value = "73.27"
                        number = Decimal(value)
                        if not number.is_finite() or max(0,-number.normalize().as_tuple().exponent)>3: raise ValueError("Unapproved precision change: "+name+"!"+address)
                    elif value is not None and field in INTEGERS:
                        number = Decimal(value)
                        if not number.is_finite() or number != number.to_integral_value(): raise ValueError("Non-integer sample")
                        value = int(number)
                    elif value is not None and field in ("inservice_date","inspection_date"):
                        days = Decimal(value)
                        if days != days.to_integral_value(): raise ValueError("Unexpected time component")
                        value = (datetime(1899,12,30)+timedelta(days=int(days))).date().isoformat()
                    record[field] = value
                records.append(record)
            data[SHEETS[name.strip()]] = records
    if set(data) != set(SHEETS.values()): raise ValueError("Missing sample sheets")
    source = {"workbook":workbook.name,"sha256":hashlib.sha256(workbook.read_bytes()).hexdigest(),"counts":{k:len(v) for k,v in data.items()},"explicitCorrections":corrections}
    return data, source

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook",type=Path,default=ROOT/"DEVELOPING TEST-AIHR-DEV02.xlsx")
    args = parser.parse_args(); data, source = export(args.workbook)
    for name,payload in (("company-seed-data.json",data),("company-seed-provenance.json",source)):
        destination = ROOT/"prisma"/name
        if destination.exists() and json.loads(destination.read_text(encoding="utf8")) != payload: raise SystemExit("Existing generated data differs; preserve and review before replacing")
        if not destination.exists(): destination.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps({"counts":source["counts"],"explicitTemperatureCorrections":len(source["explicitCorrections"])}))
