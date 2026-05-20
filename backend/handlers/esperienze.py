import tornado.escape

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class EsperienzeHandler(BaseHandler):
    """GET /api/esperienze  —  POST /api/esperienze"""

    async def get(self):
        if not self.require_auth():
            return
        esperienze = await db_interface.get_all_esperienze()
        return self.write_json({"esperienze": esperienze})

    async def post(self):
        user = self.require_roles("ADMIN", "TECNICO", "DOCENTE")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        inserted_id = await db_interface.create_esperienza(nome, descrizione, int(user["id"]))
        await db_interface.add_log(
            user["id"], user["email"], "CREATE_ESPERIENZA",
            f"Esperienza '{nome}' (id={inserted_id})"
        )
        return self.write_json({"id": inserted_id}, 201)


class EsperienzaHandler(BaseHandler):
    """GET /api/esperienze/{id}  —  PUT  —  DELETE"""

    async def get(self, esperienza_id):
        if not self.require_auth():
            return
        e = await db_interface.get_esperienza(int(esperienza_id))
        if not e:
            return self.write_json({"error": "Esperienza non trovata"}, 404)

        componenti = await db_interface.get_componenti_esperienza(int(esperienza_id))
        e["componenti"] = componenti
        return self.write_json(e)

    async def put(self, esperienza_id):
        user = self.require_auth()
        if not user:
            return

        e = await db_interface.get_esperienza(int(esperienza_id))
        if not e:
            return self.write_json({"error": "Esperienza non trovata"}, 404)

        # ADMIN e TECNICO possono modificare tutte; DOCENTE solo le proprie
        is_owner = str(e["docente_id"]) == str(user["id"])
        if user["ruolo"] not in ("ADMIN", "TECNICO") and not is_owner:
            return self.write_json({"error": "Permesso negato"}, 403)

        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        descrizione = body.get("descrizione", "").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        await db_interface.update_esperienza(int(esperienza_id), nome, descrizione)
        await db_interface.add_log(
            user["id"], user["email"], "UPDATE_ESPERIENZA",
            f"Esperienza id={esperienza_id} → '{nome}'"
        )
        return self.write_json({"message": "Aggiornato"})

    async def delete(self, esperienza_id):
        user = self.require_auth()
        if not user:
            return

        e = await db_interface.get_esperienza(int(esperienza_id))
        if not e:
            return self.write_json({"error": "Esperienza non trovata"}, 404)

        is_owner = str(e["docente_id"]) == str(user["id"])
        if user["ruolo"] not in ("ADMIN", "TECNICO") and not is_owner:
            return self.write_json({"error": "Permesso negato"}, 403)

        await db_interface.delete_esperienza(int(esperienza_id))
        await db_interface.add_log(
            user["id"], user["email"], "DELETE_ESPERIENZA",
            f"Eliminata esperienza '{e['nome']}' (id={esperienza_id})"
        )
        return self.write_json({"message": "Eliminato"})


class EsperienzaComponentiHandler(BaseHandler):
    """GET /api/esperienze/{id}/componenti  —  POST (aggiungi componente)"""

    async def get(self, esperienza_id):
        if not self.require_auth():
            return
        componenti = await db_interface.get_componenti_esperienza(int(esperienza_id))
        return self.write_json({"componenti": componenti})

    async def post(self, esperienza_id):
        user = self.require_roles("ADMIN", "DOCENTE", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        componente_id = body.get("componente_id")
        quantita_necessaria = body.get("quantita_necessaria", 1)
        consumabile = body.get("consumabile", False)

        if componente_id is None:
            return self.write_json({"error": "componente_id obbligatorio"}, 400)

        await db_interface.add_componente_esperienza(
            int(esperienza_id), int(componente_id), int(quantita_necessaria), bool(consumabile)
        )
        await db_interface.add_log(
            user["id"], user["email"], "ADD_COMP_ESPERIENZA",
            f"Esp. id={esperienza_id} ← componente id={componente_id} qty={quantita_necessaria} consumabile={consumabile}"
        )
        return self.write_json({"message": "Componente aggiunto"}, 201)


class EsperienzaComponenteItemHandler(BaseHandler):
    """DELETE /api/esperienze/{id}/componenti/{comp_id}"""

    async def delete(self, esperienza_id, componente_id):
        if not self.require_roles("ADMIN", "DOCENTE", "TECNICO"):
            return
        await db_interface.remove_componente_esperienza(int(esperienza_id), int(componente_id))
        await db_interface.add_log(
            user["id"], user["email"], "REMOVE_COMP_ESPERIENZA",
            f"Esp. id={esperienza_id} rimosso componente id={componente_id}"
        )
        return self.write_json({"message": "Componente rimosso"})


class EsperienzaDisponibilitaHandler(BaseHandler):
    """GET /api/esperienze/{id}/disponibilita
    Verifica se tutti i componenti necessari sono disponibili nei magazzini."""

    async def get(self, esperienza_id):
        if not self.require_auth():
            return
        risultati = await db_interface.check_disponibilita_esperienza(int(esperienza_id))
        tutto_disponibile = all(r["disponibile"] for r in risultati)
        return self.write_json({
            "tutto_disponibile": tutto_disponibile,
            "componenti": risultati
        })
