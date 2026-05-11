"""Genera sat_catalog.json a partir del XLS oficial del SAT.

USO (corre una sola vez):

  1. Descarga el catalogo c_ClaveProdServ desde:
     http://omawww.sat.gob.mx/tramitesyservicios/Paginas/catalogos_emision_cfdi_complemento_ce.htm
     (Busca "Catalogo de Productos y Servicios" o "c_ClaveProdServ")

  2. Guarda el archivo .xls o .xlsx aqui:
     backend/scripts/sat_input.xlsx
     (renombrarlo a ese nombre exacto)

  3. Corre:
     cd backend
     python scripts/build_sat_catalog.py

  4. Genera:
     backend/app/data/sat_catalog.json (~5MB, ~58000 entradas)

  5. Commit y push:
     git add backend/app/data/sat_catalog.json
     git commit -m "data: catalogo SAT c_ClaveProdServ"
     git push
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
INPUT = ROOT / "scripts" / "sat_input.xlsx"
INPUT_XLS = ROOT / "scripts" / "sat_input.xls"
OUTPUT = ROOT / "app" / "data" / "sat_catalog.json"


def main():
    src = None
    if INPUT.exists():
        src = INPUT
    elif INPUT_XLS.exists():
        src = INPUT_XLS
        print("ADVERTENCIA: archivo .xls antiguo. Si falla, abrelo y guardalo como .xlsx")
    else:
        print(f"ERROR: falta el archivo. Descarga el catalogo SAT y guardalo como:")
        print(f"  {INPUT}")
        sys.exit(1)

    try:
        from openpyxl import load_workbook
    except ImportError:
        print("ERROR: necesitas openpyxl. Instalalo: pip install openpyxl")
        sys.exit(1)

    print(f"Leyendo {src}...")
    wb = load_workbook(src, read_only=True, data_only=True)

    # El sheet con productos suele llamarse "c_ClaveProdServ" o similar
    target_sheet = None
    for name in wb.sheetnames:
        if "ProdServ" in name or "Prod_Serv" in name or "claveprodserv" in name.lower():
            target_sheet = name
            break
    if not target_sheet:
        target_sheet = wb.sheetnames[0]
        print(f"ADVERTENCIA: no encontre hoja 'c_ClaveProdServ', usando '{target_sheet}'")

    ws = wb[target_sheet]
    catalog: list[dict] = []
    for row in ws.iter_rows(min_row=1, values_only=True):
        if not row or not row[0]:
            continue
        clave = str(row[0]).strip()
        # La descripcion puede estar en columna 1 o 2 dependiendo del layout
        desc = ""
        for i in range(1, min(4, len(row))):
            if row[i]:
                desc = str(row[i]).strip()
                if len(desc) > 5:  # filtra headers y campos cortos
                    break
        if clave.isdigit() and len(clave) == 8 and desc:
            catalog.append({"clave": clave, "descripcion": desc})

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))

    print(f"OK: {len(catalog)} claves SAT guardadas en {OUTPUT}")
    print(f"Tamano: {OUTPUT.stat().st_size / 1024:.0f} KB")
    print()
    print("Siguientes pasos:")
    print("  git add backend/app/data/sat_catalog.json")
    print("  git commit -m 'data: catalogo SAT c_ClaveProdServ'")
    print("  git push")


if __name__ == "__main__":
    main()
