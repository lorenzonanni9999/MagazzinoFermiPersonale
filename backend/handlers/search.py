from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class SearchComponentiHandler(BaseHandler):
    """GET /api/search/componenti?q=&famiglia=&tipo=&ambito=&sottotipo=&tag_id="""

    async def get(self):
        if not self.require_auth():
            return

        q = self.get_argument("q", "").strip()
        famiglia = self.get_argument("famiglia", "").strip()
        tipo = self.get_argument("tipo", "").strip()
        ambito = self.get_argument("ambito", "").strip()
        sottotipo = self.get_argument("sottotipo", "").strip()
        tag_id = self.get_argument("tag_id", None)

        componenti = await db_interface.search_componenti(
            q=q, famiglia=famiglia, tipo=tipo,
            ambito=ambito, sottotipo=sottotipo, tag_id=tag_id
        )

        # Aggiungi i tag a ciascun componente
        for c in componenti:
            c["tags"] = await db_interface.get_tags_componente(c["id"])

        return self.write_json({"componenti": componenti, "totale": len(componenti)})
