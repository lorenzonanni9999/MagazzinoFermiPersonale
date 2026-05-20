import tornado.escape

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class ComponentiHandler(BaseHandler):
    """GET /api/componenti  —  POST /api/componenti"""

    async def get(self):
        if not self.require_auth():
            return
        componenti = await db_interface.get_all_componenti()
        # Aggiungi i tag a ciascun componente
        for c in componenti:
            c["tags"] = await db_interface.get_tags_componente(c["id"])
        return self.write_json({"componenti": componenti})

    async def post(self):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()
        famiglia = body.get("famiglia", "").strip()
        tipo = body.get("tipo", "").strip()
        ambito = body.get("ambito", "").strip()
        sottotipo = body.get("sottotipo", "").strip()
        unita_misura = body.get("unita_misura", "pz").strip()
        datasheet_url = body.get("datasheet_url", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        inserted_id = await db_interface.create_componente(
            nome, descrizione, famiglia, tipo, ambito, sottotipo, unita_misura, datasheet_url
        )
        await db_interface.add_log(
            user["id"], user["email"], "CREATE_COMPONENTE",
            f"Componente '{nome}' (id={inserted_id})"
        )
        return self.write_json({"id": inserted_id}, 201)


class ComponenteHandler(BaseHandler):
    """GET /api/componenti/{id}  —  PUT  —  DELETE"""

    async def get(self, componente_id):
        if not self.require_auth():
            return
        c = await db_interface.get_componente(int(componente_id))
        if not c:
            return self.write_json({"error": "Componente non trovato"}, 404)

        c["tags"] = await db_interface.get_tags_componente(int(componente_id))
        c["magazzini"] = await db_interface.get_stock_componente(int(componente_id))
        return self.write_json(c)

    async def put(self, componente_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()
        famiglia = body.get("famiglia", "").strip()
        tipo = body.get("tipo", "").strip()
        ambito = body.get("ambito", "").strip()
        sottotipo = body.get("sottotipo", "").strip()
        unita_misura = body.get("unita_misura", "pz").strip()
        datasheet_url = body.get("datasheet_url", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        await db_interface.update_componente(
            int(componente_id), nome, descrizione, famiglia, tipo, ambito, sottotipo, unita_misura, datasheet_url
        )
        await db_interface.add_log(
            user["id"], user["email"], "UPDATE_COMPONENTE",
            f"Componente id={componente_id} → '{nome}'"
        )
        return self.write_json({"message": "Aggiornato"})

    async def delete(self, componente_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        c = await db_interface.get_componente(int(componente_id))
        await db_interface.delete_componente(int(componente_id))
        await db_interface.add_log(
            user["id"], user["email"], "DELETE_COMPONENTE",
            f"Eliminato componente '{c['nome'] if c else componente_id}'"
        )
        return self.write_json({"message": "Eliminato"})


class ComponenteEsperienzeHandler(BaseHandler):
    """GET /api/componenti/{id}/esperienze — elenco esperienze che usano il componente"""

    async def get(self, componente_id):
        if not self.require_auth():
            return
        esperienze = await db_interface.get_esperienze_componente(int(componente_id))
        return self.write_json({"esperienze": esperienze})
