import json
import tornado.escape

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class MagazziniHandler(BaseHandler):
    """GET /api/magazzini  —  POST /api/magazzini"""

    async def get(self):
        if not self.require_auth():
            return
        magazzini = await db_interface.get_all_magazzini()
        return self.write_json({"magazzini": magazzini})

    async def post(self):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()
        ambiente = body.get("ambiente", "").strip()
        sezione = body.get("sezione", "").strip()
        cassetto = body.get("cassetto", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        inserted_id = await db_interface.create_magazzino(nome, descrizione, ambiente, sezione, cassetto)
        await db_interface.add_log(
            user["id"], user["email"], "CREATE_MAGAZZINO",
            f"Magazzino '{nome}' (id={inserted_id})"
        )
        return self.write_json({"id": inserted_id}, 201)


class MagazzinoHandler(BaseHandler):
    """GET /api/magazzini/{id}  —  PUT  —  DELETE"""

    async def get(self, magazzino_id):
        if not self.require_auth():
            return
        m = await db_interface.get_magazzino(int(magazzino_id))
        if not m:
            return self.write_json({"error": "Magazzino non trovato"}, 404)
        return self.write_json(m)

    async def put(self, magazzino_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()
        ambiente = body.get("ambiente", "").strip()
        sezione = body.get("sezione", "").strip()
        cassetto = body.get("cassetto", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        await db_interface.update_magazzino(int(magazzino_id), nome, descrizione, ambiente, sezione, cassetto)
        await db_interface.add_log(
            user["id"], user["email"], "UPDATE_MAGAZZINO",
            f"Magazzino id={magazzino_id} → '{nome}'"
        )
        return self.write_json({"message": "Aggiornato"})

    async def delete(self, magazzino_id):
        user = self.require_roles("ADMIN")
        if not user:
            return
        m = await db_interface.get_magazzino(int(magazzino_id))
        await db_interface.delete_magazzino(int(magazzino_id))
        await db_interface.add_log(
            user["id"], user["email"], "DELETE_MAGAZZINO",
            f"Eliminato magazzino '{m['nome'] if m else magazzino_id}'"
        )
        return self.write_json({"message": "Eliminato"})


class MagazzinoStockHandler(BaseHandler):
    """GET /api/magazzini/{id}/componenti  —  POST"""

    async def get(self, magazzino_id):
        if not self.require_auth():
            return
        stock = await db_interface.get_stock_magazzino(int(magazzino_id))
        return self.write_json({"componenti": stock})

    async def post(self, magazzino_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        componente_id = body.get("componente_id")
        quantita = body.get("quantita", 0)
        quantita_minima = body.get("quantita_minima", 0)
        is_scorta = body.get("is_scorta", False)

        if componente_id is None:
            return self.write_json({"error": "componente_id obbligatorio"}, 400)

        await db_interface.set_stock(
            int(magazzino_id), int(componente_id),
            int(quantita), int(quantita_minima), bool(is_scorta)
        )
        mag  = await db_interface.get_magazzino(int(magazzino_id))
        comp = await db_interface.get_componente(int(componente_id))
        dettagli = json.dumps({
            "mag_id": int(magazzino_id), "comp_id": int(componente_id),
            "mag_nome":  mag["nome"]  if mag  else str(magazzino_id),
            "comp_nome": comp["nome"] if comp else str(componente_id),
            "qty": int(quantita), "min": int(quantita_minima),
            "scorta": bool(is_scorta),
            "unita": comp["unita_misura"] if comp else "pz"
        }, ensure_ascii=False)
        await db_interface.add_log(user["id"], user["email"], "SET_STOCK", dettagli)
        return self.write_json({"message": "Stock aggiornato"})


class MagazzinoStockItemHandler(BaseHandler):
    """PUT /api/magazzini/{id}/componenti/{comp_id}  —  DELETE"""

    async def put(self, magazzino_id, componente_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        quantita = body.get("quantita", 0)
        quantita_minima = body.get("quantita_minima", 0)
        is_scorta = body.get("is_scorta", False)

        # Legge i valori PRIMA dell'aggiornamento (per log old→new e ripristino)
        old = await db_interface.get_stock_item(int(magazzino_id), int(componente_id))
        await db_interface.set_stock(
            int(magazzino_id), int(componente_id),
            int(quantita), int(quantita_minima), bool(is_scorta)
        )
        mag  = await db_interface.get_magazzino(int(magazzino_id))
        comp = await db_interface.get_componente(int(componente_id))
        dettagli = json.dumps({
            "mag_id": int(magazzino_id), "comp_id": int(componente_id),
            "mag_nome":   mag["nome"]  if mag  else str(magazzino_id),
            "comp_nome":  comp["nome"] if comp else str(componente_id),
            "old_qty":    int(old["quantita"])         if old else 0,
            "new_qty":    int(quantita),
            "old_min":    int(old["quantita_minima"])  if old else 0,
            "new_min":    int(quantita_minima),
            "old_scorta": bool(old["is_scorta"])       if old else False,
            "new_scorta": bool(is_scorta),
            "unita": comp["unita_misura"] if comp else "pz"
        }, ensure_ascii=False)
        await db_interface.add_log(user["id"], user["email"], "UPDATE_STOCK", dettagli)
        return self.write_json({"message": "Stock aggiornato"})

    async def delete(self, magazzino_id, componente_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        # Legge i valori prima della rimozione (per log e ripristino)
        old  = await db_interface.get_stock_item(int(magazzino_id), int(componente_id))
        mag  = await db_interface.get_magazzino(int(magazzino_id))
        comp = await db_interface.get_componente(int(componente_id))
        await db_interface.remove_from_magazzino(int(magazzino_id), int(componente_id))
        dettagli = json.dumps({
            "mag_id": int(magazzino_id), "comp_id": int(componente_id),
            "mag_nome":   mag["nome"]  if mag  else str(magazzino_id),
            "comp_nome":  comp["nome"] if comp else str(componente_id),
            "old_qty":    int(old["quantita"])        if old else 0,
            "old_min":    int(old["quantita_minima"]) if old else 0,
            "old_scorta": bool(old["is_scorta"])      if old else False,
            "unita": comp["unita_misura"] if comp else "pz"
        }, ensure_ascii=False)
        await db_interface.add_log(user["id"], user["email"], "REMOVE_STOCK", dettagli)
        return self.write_json({"message": "Componente rimosso dal magazzino"})
