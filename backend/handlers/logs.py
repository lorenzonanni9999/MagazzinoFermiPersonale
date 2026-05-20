from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class LogsHandler(BaseHandler):
    """GET /api/logs — solo ADMIN"""

    async def get(self):
        if not self.require_roles("ADMIN"):
            return
        limit = int(self.get_argument("limit", 2000))
        logs = await db_interface.get_logs(limit=limit)
        return self.write_json({"logs": logs})
