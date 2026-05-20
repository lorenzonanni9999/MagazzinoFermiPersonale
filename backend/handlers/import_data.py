import tornado.escape

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class ImportDataHandler(BaseHandler):
    """POST /api/import — ADMIN only
    Accetta un JSON con magazzini, componenti, esperienze e crea solo le entità mancanti.
    """

    async def post(self):
        user = self.require_roles("ADMIN")
        if not user:
            return

        try:
            body = tornado.escape.json_decode(self.request.body)
        except Exception:
            return self.write_json({"error": "JSON non valido"}, 400)

        magazzini_in  = body.get("magazzini",  [])
        componenti_in = body.get("componenti", [])
        esperienze_in = body.get("esperienze", [])

        result = {"magazzini": 0, "componenti": 0, "esperienze": 0, "stock": 0, "errori": []}

        # ── 1. Magazzini ──────────────────────────────────────────────
        existing_mag = {m["nome"]: m["id"] for m in await db_interface.get_all_magazzini()}
        for m in magazzini_in:
            nome = str(m.get("nome", "")).strip()
            if not nome:
                continue
            if nome not in existing_mag:
                new_id = await db_interface.create_magazzino(
                    nome,
                    str(m.get("descrizione", "")),
                    str(m.get("ambiente", "")),
                    str(m.get("sezione", "")),
                    str(m.get("cassetto", ""))
                )
                existing_mag[nome] = new_id
                result["magazzini"] += 1

        # ── 2. Componenti + stock ─────────────────────────────────────
        existing_comp = {c["nome"]: c["id"] for c in await db_interface.get_all_componenti()}
        for c in componenti_in:
            nome = str(c.get("nome", "")).strip()
            if not nome:
                continue
            if nome not in existing_comp:
                new_id = await db_interface.create_componente(
                    nome,
                    str(c.get("descrizione", "")),
                    str(c.get("famiglia",   "")),
                    str(c.get("tipo",       "")),
                    str(c.get("ambito",     "")),
                    str(c.get("sottotipo",  "")),
                    str(c.get("unita_misura", "pz")),
                    str(c.get("datasheet_url", ""))
                )
                existing_comp[nome] = new_id
                result["componenti"] += 1
            comp_id = existing_comp[nome]
            for s in c.get("stock", []):
                mag_nome = str(s.get("magazzino_nome", "")).strip()
                if mag_nome not in existing_mag:
                    result["errori"].append(
                        f"Magazzino '{mag_nome}' non trovato per componente '{nome}'"
                    )
                    continue
                await db_interface.set_stock(
                    existing_mag[mag_nome], comp_id,
                    int(s.get("quantita", 0)),
                    int(s.get("quantita_minima", 0)),
                    bool(s.get("is_scorta", False))
                )
                result["stock"] += 1

        # ── 3. Esperienze + componenti ────────────────────────────────
        existing_esp = {e["nome"]: e["id"] for e in await db_interface.get_all_esperienze()}
        for e in esperienze_in:
            nome = str(e.get("nome", "")).strip()
            if not nome:
                continue
            if nome not in existing_esp:
                new_id = await db_interface.create_esperienza(
                    nome,
                    str(e.get("descrizione", "")),
                    int(user["id"])
                )
                existing_esp[nome] = new_id
                result["esperienze"] += 1
            esp_id = existing_esp[nome]
            for comp in e.get("componenti", []):
                comp_nome = str(comp.get("componente_nome", "")).strip()
                if comp_nome not in existing_comp:
                    result["errori"].append(
                        f"Componente '{comp_nome}' non trovato per esperienza '{nome}'"
                    )
                    continue
                try:
                    await db_interface.add_componente_esperienza(
                        esp_id,
                        existing_comp[comp_nome],
                        int(comp.get("quantita_necessaria", 1)),
                        bool(comp.get("consumabile", False))
                    )
                except Exception:
                    pass  # duplicato: ignora silenziosamente

        await db_interface.add_log(
            user["id"], user["email"], "IMPORT",
            f"Importati: {result['magazzini']} magazzini, "
            f"{result['componenti']} componenti, "
            f"{result['esperienze']} esperienze, "
            f"{result['stock']} assegnazioni stock"
        )

        return self.write_json(result, 200)
