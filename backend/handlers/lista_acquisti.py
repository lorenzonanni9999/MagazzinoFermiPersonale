import tornado.escape
from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class ListaAcquistiHandler(BaseHandler):
    """GET /api/lista-acquisti — componenti sotto scorta minima"""

    async def get(self):
        if not self.require_auth():
            return
        lista = await db_interface.get_lista_acquisti()
        return self.write_json({"lista": lista, "totale": len(lista)})
