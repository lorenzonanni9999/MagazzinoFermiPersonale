import tornado.escape
from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class TagsHandler(BaseHandler):
    """GET /api/tags  —  POST /api/tags"""

    async def get(self):
        if not self.require_auth():
            return
        tags = await db_interface.get_all_tags()
        return self.write_json({"tags": tags})

    async def post(self):
        user = self.require_auth()
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        colore = body.get("colore", "#3b82f6").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)
        if not colore.startswith("#") or len(colore) not in (4, 7):
            colore = "#3b82f6"

        inserted_id = await db_interface.create_tag(nome, colore, int(user["id"]))
        await db_interface.add_log(user["id"], user["email"], "CREATE_TAG", f"Tag '{nome}' (colore {colore})")
        return self.write_json({"id": inserted_id, "nome": nome, "colore": colore}, 201)


class TagHandler(BaseHandler):
    """PUT /api/tags/{id}  —  DELETE /api/tags/{id}"""

    async def put(self, tag_id):
        user = self.require_auth()
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        nome = body.get("nome", "").strip()
        colore = body.get("colore", "#3b82f6").strip()

        if not nome:
            return self.write_json({"error": "Nome obbligatorio"}, 400)

        await db_interface.update_tag(int(tag_id), nome, colore)
        await db_interface.add_log(user["id"], user["email"], "UPDATE_TAG", f"Tag {tag_id} → '{nome}'")
        return self.write_json({"message": "Tag aggiornato"})

    async def delete(self, tag_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        tag = await db_interface.get_tag(int(tag_id))
        if not tag:
            return self.write_json({"error": "Tag non trovato"}, 404)
        await db_interface.delete_tag(int(tag_id))
        await db_interface.add_log(user["id"], user["email"], "DELETE_TAG", f"Tag '{tag['nome']}'")
        return self.write_json({"message": "Tag eliminato"})


class ComponenteTagsHandler(BaseHandler):
    """GET /api/componenti/{id}/tags  —  POST (aggiungi tag)"""

    async def get(self, componente_id):
        if not self.require_auth():
            return
        tags = await db_interface.get_tags_componente(int(componente_id))
        return self.write_json({"tags": tags})

    async def post(self, componente_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        tag_id = body.get("tag_id")
        if tag_id is None:
            return self.write_json({"error": "tag_id obbligatorio"}, 400)

        await db_interface.add_tag_to_componente(int(componente_id), int(tag_id))
        await db_interface.add_log(user["id"], user["email"], "ADD_TAG_COMPONENTE",
                                    f"Componente {componente_id} ← tag {tag_id}")
        return self.write_json({"message": "Tag aggiunto"}, 201)


class ComponenteTagItemHandler(BaseHandler):
    """DELETE /api/componenti/{id}/tags/{tag_id}"""

    async def delete(self, componente_id, tag_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        await db_interface.remove_tag_from_componente(int(componente_id), int(tag_id))
        await db_interface.add_log(user["id"], user["email"], "REMOVE_TAG_COMPONENTE",
                                    f"Componente {componente_id} rimosso tag {tag_id}")
        return self.write_json({"message": "Tag rimosso"})
