import tornado.escape

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface


class TasksHandler(BaseHandler):
    async def get(self):
        user = self.get_current_user()
        if not user:
            return self.write_json({"error": "Non autenticato"}, 401)

        tasks = await db_interface.get_tasks_by_user(user["id"])

        out = [{
            "id": str(t["id"]),
            "text": t["text"],
            "email": t["email"],
            "ora": t["ora"],
            "mio": str(t["user_id"]) == str(user["id"])
        } for t in tasks]

        return self.write_json({"items": out})

    async def post(self):
        user = self.get_current_user()
        if not user:
            return self.write_json({"error": "Non autenticato"}, 401)

        body = tornado.escape.json_decode(self.request.body)
        text = body.get("text", "").strip()

        if not text:
            return self.write_json({"error": "Testo obbligatorio"}, 400)

        inserted_id = await db_interface.create_task(user["id"], user["email"], text)
        return self.write_json({"id": str(inserted_id)}, 201)


class TaskDeleteHandler(BaseHandler):
    async def delete(self, task_id):
        user = self.get_current_user()
        if not user:
            return self.write_json({"error": "Non autenticato"}, 401)

        await db_interface.delete_task(task_id, user["id"])
        return self.write_json({"message": "Eliminato"})
