import asyncio
import os
import tornado.web
from dotenv import load_dotenv

# Carica .env dalla directory del progetto (funziona su qualsiasi OS)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.db.db import COOKIE_SECRET, PORT, init_db
from backend.handlers.auth import (
    RegisterHandler, LoginHandler, LogoutHandler,
    UsersHandler, MeHandler, PendingUsersHandler, ApproveUserHandler,
    RejectUserHandler, UserRuoloHandler, ResetTokenHandler, ResetPasswordHandler
)
from backend.handlers.magazzini import (
    MagazziniHandler, MagazzinoHandler,
    MagazzinoStockHandler, MagazzinoStockItemHandler
)
from backend.handlers.componenti import ComponentiHandler, ComponenteHandler, ComponenteEsperienzeHandler
from backend.handlers.esperienze import (
    EsperienzeHandler, EsperienzaHandler,
    EsperienzaComponentiHandler, EsperienzaComponenteItemHandler,
    EsperienzaDisponibilitaHandler
)
from backend.handlers.tags import (
    TagsHandler, TagHandler,
    ComponenteTagsHandler, ComponenteTagItemHandler
)
from backend.handlers.search import SearchComponentiHandler
from backend.handlers.lista_acquisti import ListaAcquistiHandler
from backend.handlers.logs import LogsHandler
from backend.handlers.import_data import ImportDataHandler

ID = r"([0-9]+)"


def make_app():
    return tornado.web.Application(
        [
            # Auth
            (r"/api/login",                                             LoginHandler),
            (r"/api/logout",                                            LogoutHandler),
            (r"/api/me",                                                MeHandler),
            (r"/api/register",                                          RegisterHandler),
            (r"/api/users",                                             UsersHandler),
            (r"/api/users/pending",                                     PendingUsersHandler),
            (r"/api/users/" + ID + r"/approva",                         ApproveUserHandler),
            (r"/api/users/" + ID + r"/rifiuta",                         RejectUserHandler),
            (r"/api/users/" + ID + r"/ruolo",                           UserRuoloHandler),
            (r"/api/users/" + ID + r"/reset-token",                     ResetTokenHandler),
            (r"/api/users/" + ID,                                       UsersHandler),
            (r"/api/reset-password",                                    ResetPasswordHandler),

            # Magazzini
            (r"/api/magazzini",                                         MagazziniHandler),
            (r"/api/magazzini/" + ID,                                   MagazzinoHandler),
            (r"/api/magazzini/" + ID + r"/componenti",                  MagazzinoStockHandler),
            (r"/api/magazzini/" + ID + r"/componenti/" + ID,            MagazzinoStockItemHandler),

            # Componenti (catalogo)
            (r"/api/componenti",                                        ComponentiHandler),
            (r"/api/componenti/" + ID + r"/esperienze",                 ComponenteEsperienzeHandler),
            (r"/api/componenti/" + ID,                                  ComponenteHandler),
            (r"/api/componenti/" + ID + r"/tags",                       ComponenteTagsHandler),
            (r"/api/componenti/" + ID + r"/tags/" + ID,                 ComponenteTagItemHandler),

            # Tags
            (r"/api/tags",                                              TagsHandler),
            (r"/api/tags/" + ID,                                        TagHandler),

            # Ricerca
            (r"/api/search/componenti",                                 SearchComponentiHandler),

            # Lista acquisti
            (r"/api/lista-acquisti",                                    ListaAcquistiHandler),

            # Log
            (r"/api/logs",                                              LogsHandler),

            # Import
            (r"/api/import",                                            ImportDataHandler),

            # Esperienze
            (r"/api/esperienze",                                        EsperienzeHandler),
            (r"/api/esperienze/" + ID,                                  EsperienzaHandler),
            (r"/api/esperienze/" + ID + r"/componenti",                 EsperienzaComponentiHandler),
            (r"/api/esperienze/" + ID + r"/componenti/" + ID,           EsperienzaComponenteItemHandler),
            (r"/api/esperienze/" + ID + r"/disponibilita",              EsperienzaDisponibilitaHandler),

            # Static files
            (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": "static"}),
            (r"/", tornado.web.RedirectHandler, {"url": "/static/login.html"}),
        ],
        cookie_secret=COOKIE_SECRET,
        autoreload=True,
        debug=True
    )


async def main():
    await init_db()
    app = make_app()
    app.listen(PORT)
    print(f"Server avviato su http://localhost:{PORT}")
    await asyncio.Event().wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer spento.")
