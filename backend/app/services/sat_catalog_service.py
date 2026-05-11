"""RAG sobre catalogo SAT c_ClaveProdServ.

Estrategia:
1. Lista curada de ferreteria/aceros (siempre disponible)
2. Catalogo SAT completo (opcional, se carga si existe app/data/sat_catalog.json)
3. Para una query: busca candidatos por keyword, los pasa a Claude para que ELIJA
"""
import json
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "sat_catalog.json"


# Lista curada para Aceromax (ferreteria, aceros, construccion)
# Cada item: clave SAT + descripcion oficial + keywords que la disparan
EMBEDDED_FERRETERIA = [
    # === ACEROS ===
    {"clave": "30102404", "descripcion": "Varilla corrugada de acero",
     "keywords": ["varilla corrugada", "varilla"]},
    {"clave": "30102402", "descripcion": "Alambron de acero",
     "keywords": ["alambron"]},
    {"clave": "30102403", "descripcion": "Alambre de acero",
     "keywords": ["alambre", "alambre recocido", "alambre galvanizado"]},
    {"clave": "30102301", "descripcion": "Perfiles, angulos y soleras de acero",
     "keywords": ["perfil", "angulo", "solera", "viga", "ptr", "monten", "canal", "ipr", "ips"]},
    {"clave": "30102310", "descripcion": "Tubos y tuberia de acero",
     "keywords": ["tubo de acero", "tuberia de acero", "tubo cuadrado", "tubo rectangular"]},
    {"clave": "30103105", "descripcion": "Lamina de acero (galvanizada / negra)",
     "keywords": ["lamina", "lamina galvanizada", "lamina negra", "rolada"]},
    {"clave": "30102302", "descripcion": "Placa de acero",
     "keywords": ["placa de acero", "placa estructural"]},
    {"clave": "30191601", "descripcion": "Malla electrosoldada / castillo armex",
     "keywords": ["malla electrosoldada", "malla", "castillo", "armex", "cadena armex"]},

    # === CEMENTOS Y MORTEROS ===
    {"clave": "30111601", "descripcion": "Cemento gris / Portland",
     "keywords": ["cemento gris", "cemento portland", "cemento cpc"]},
    {"clave": "30111601", "descripcion": "Cemento blanco",
     "keywords": ["cemento blanco"]},
    {"clave": "30111604", "descripcion": "Mortero / mezcla cemento-cal",
     "keywords": ["mortero", "mezcla", "cal hidratada"]},
    {"clave": "30111603", "descripcion": "Yeso y derivados",
     "keywords": ["yeso", "pasta", "junta yeso"]},
    {"clave": "30111601", "descripcion": "Concreto / hormigon",
     "keywords": ["concreto", "hormigon", "cemento premezclado"]},

    # === TABLAROCA / DURROCK ===
    {"clave": "30121502", "descripcion": "Panel de yeso (tablaroca, drywall)",
     "keywords": ["tablaroca", "tabla roca", "drywall", "panel yeso", "panel de yeso", "durock"]},
    {"clave": "30121502", "descripcion": "Perfiles y postes para tablaroca",
     "keywords": ["poste tablaroca", "canal tablaroca", "perfil tablaroca"]},

    # === HERRAMIENTAS MANUALES ===
    {"clave": "27112710", "descripcion": "Palas",
     "keywords": ["pala", "pala redonda", "pala recta", "pala cuadrada"]},
    {"clave": "27112710", "descripcion": "Picos, talaches",
     "keywords": ["pico", "talache"]},
    {"clave": "27111900", "descripcion": "Carretillas y diablos",
     "keywords": ["carretilla", "diablo", "carretilla obra"]},
    {"clave": "27112812", "descripcion": "Martillos y marros",
     "keywords": ["martillo", "marro", "mazo", "almadana"]},
    {"clave": "27112811", "descripcion": "Cinceles y barretas",
     "keywords": ["cincel", "barreta", "barra acero"]},
    {"clave": "27112700", "descripcion": "Llaves de mano (perica, espanola, allen)",
     "keywords": ["llave perica", "llave espanola", "llave allen", "llave inglesa", "llave torque"]},
    {"clave": "27112707", "descripcion": "Pinzas mecanicas",
     "keywords": ["pinza", "pinzas", "alicates"]},
    {"clave": "27112730", "descripcion": "Desarmadores / destornilladores",
     "keywords": ["desarmador", "destornillador", "desarmador phillips", "desarmador plano"]},
    {"clave": "27112701", "descripcion": "Cuchillas y navajas",
     "keywords": ["cutter", "navaja", "cuchilla"]},
    {"clave": "27111701", "descripcion": "Niveles y plomadas",
     "keywords": ["nivel", "plomada", "nivel laser"]},
    {"clave": "27111709", "descripcion": "Cintas metricas / flexometros",
     "keywords": ["flexometro", "cinta metrica", "metro"]},

    # === HERRAMIENTAS ELECTRICAS ===
    {"clave": "27112102", "descripcion": "Taladros electricos",
     "keywords": ["taladro", "rotomartillo", "taladro percutor"]},
    {"clave": "27112103", "descripcion": "Sierras electricas",
     "keywords": ["sierra", "sierra circular", "sierra caladora", "sierra ingletadora"]},
    {"clave": "27112106", "descripcion": "Esmeriladoras / pulidoras",
     "keywords": ["esmeril", "esmeriladora", "pulidora", "amoladora"]},
    {"clave": "27112108", "descripcion": "Soldadoras electricas",
     "keywords": ["soldadora", "maquina soldar", "inversora"]},

    # === TORNILLERIA Y FIJACION ===
    {"clave": "31161500", "descripcion": "Tornillos, pijas, pernos",
     "keywords": ["tornillo", "pija", "perno", "tornillo coche"]},
    {"clave": "31161700", "descripcion": "Tuercas",
     "keywords": ["tuerca"]},
    {"clave": "31161600", "descripcion": "Rondanas / arandelas",
     "keywords": ["rondana", "arandela"]},
    {"clave": "31162200", "descripcion": "Clavos",
     "keywords": ["clavo", "clavo concreto"]},
    {"clave": "31163100", "descripcion": "Anclas y taquetes",
     "keywords": ["taquete", "ancla", "expansion"]},
    {"clave": "31201600", "descripcion": "Adhesivos / pegamentos",
     "keywords": ["pegamento", "adhesivo", "silicon", "kola loca"]},

    # === PINTURAS Y RECUBRIMIENTOS ===
    {"clave": "31211501", "descripcion": "Pintura vinilica / latex",
     "keywords": ["pintura vinilica", "vinilica", "latex"]},
    {"clave": "31211503", "descripcion": "Pintura esmalte",
     "keywords": ["esmalte", "pintura esmalte"]},
    {"clave": "31211505", "descripcion": "Impermeabilizantes",
     "keywords": ["impermeabilizante", "fester", "imperm"]},
    {"clave": "12352300", "descripcion": "Solventes (thinner, aguarras)",
     "keywords": ["thinner", "aguarras", "solvente"]},
    {"clave": "31211900", "descripcion": "Brochas, rodillos, accesorios pintura",
     "keywords": ["brocha", "rodillo", "charola pintura"]},

    # === PLOMERIA ===
    {"clave": "40141700", "descripcion": "Tuberia y conexiones PVC / CPVC",
     "keywords": ["tuberia pvc", "tubo pvc", "codo pvc", "conexion pvc", "cpvc"]},
    {"clave": "40141800", "descripcion": "Tuberia y conexiones de cobre",
     "keywords": ["tubo cobre", "conexion cobre", "codo cobre"]},
    {"clave": "40141900", "descripcion": "Llaves y valvulas de agua",
     "keywords": ["llave agua", "llave nariz", "valvula", "llave paso"]},

    # === ELECTRICO ===
    {"clave": "26121500", "descripcion": "Cable electrico (calibre 12/14/10)",
     "keywords": ["cable electrico", "cable thw", "cable thhn", "alambre electrico"]},
    {"clave": "39121400", "descripcion": "Contactos, apagadores, placas",
     "keywords": ["contacto", "apagador", "placa", "interruptor"]},
    {"clave": "39111600", "descripcion": "Focos y luminarias",
     "keywords": ["foco", "lampara", "luminaria", "led"]},

    # === MAMPOSTERIA ===
    {"clave": "30161601", "descripcion": "Block / tabicon de concreto",
     "keywords": ["block", "tabicon", "block hueco"]},
    {"clave": "30161501", "descripcion": "Tabique / ladrillo rojo",
     "keywords": ["tabique", "ladrillo", "ladrillo rojo"]},
    {"clave": "11141700", "descripcion": "Arena, grava, agregados",
     "keywords": ["arena", "grava", "tepetate", "polvo piedra"]},

    # === SEGURIDAD / EPP ===
    {"clave": "46181500", "descripcion": "Cascos, lentes, guantes proteccion",
     "keywords": ["casco", "lentes seguridad", "guantes", "epp"]},

    # === SOLDADURA ===
    {"clave": "23271700", "descripcion": "Electrodos para soldar",
     "keywords": ["electrodo", "soldadura 6011", "soldadura 7018", "varilla soldadura"]},

    # === GENERICOS ===
    {"clave": "01010101", "descripcion": "No existe en el catalogo",
     "keywords": []},
]


_full_catalog: list[dict] | None = None


def _load_full() -> list[dict]:
    global _full_catalog
    if _full_catalog is not None:
        return _full_catalog
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                _full_catalog = json.load(f)
        except Exception:
            _full_catalog = []
    else:
        _full_catalog = []
    return _full_catalog


def buscar_candidatos(query: str, categoria: str | None = None, limit: int = 15) -> list[dict]:
    """Busca claves SAT relevantes para una query de producto.

    Estrategia:
    1. Match en lista curada de ferreteria (alta precision)
    2. Si no hay match, busqueda por keywords en catalogo SAT completo (si existe)
    3. Devuelve top N candidatos
    """
    q = (query or "").lower().strip()
    if categoria:
        q = q + " " + categoria.lower()
    if not q:
        return []

    # 1. Lista curada
    embedded_matches: list[dict] = []
    seen_claves: set[str] = set()
    for item in EMBEDDED_FERRETERIA:
        for kw in item.get("keywords", []):
            if kw in q and item["clave"] not in seen_claves:
                embedded_matches.append({
                    "clave": item["clave"],
                    "descripcion": item["descripcion"],
                    "fuente": "ferreteria_curada",
                })
                seen_claves.add(item["clave"])
                break

    # 2. Catalogo completo (si esta cargado)
    catalog = _load_full()
    if catalog:
        words = [w for w in q.split() if len(w) >= 3]
        if words:
            scored: list[tuple[int, dict]] = []
            for item in catalog:
                desc_lower = item["descripcion"].lower()
                score = sum(2 if w == word else 1 for word in words for w in desc_lower.split() if word in w)
                if score > 0:
                    scored.append((score, item))
            scored.sort(key=lambda x: -x[0])
            for _, item in scored[:limit]:
                if item["clave"] not in seen_claves:
                    embedded_matches.append({
                        "clave": item["clave"],
                        "descripcion": item["descripcion"],
                        "fuente": "catalogo_sat",
                    })
                    seen_claves.add(item["clave"])

    return embedded_matches[:limit]


def estadisticas() -> dict:
    catalog = _load_full()
    return {
        "ferreteria_curada": len(EMBEDDED_FERRETERIA),
        "catalogo_sat_completo": len(catalog),
        "fuente_principal": "catalogo_sat_completo" if catalog else "ferreteria_curada",
    }
