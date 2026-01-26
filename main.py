import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

# Импортируем Response
from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from bot import client, bot, dp, check_updates_task

load_dotenv()

CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = None
    update_task = None
    
    if bot:
        print("🚀 Запуск Telegram бота...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    print("🛑 Остановка сервисов...")
    if polling_task:
        polling_task.cancel()
        try: await polling_task; except: pass
    if update_task:
        update_task.cancel()
        try: await update_task; except: pass
            
    if bot: await bot.session.close()

    try:
        client.session.close()
        if hasattr(client.session, "cookies"): client.session.cookies.clear()
        client.is_logged_in = False
    except: pass

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ВОТ ЭТОЙ ФУНКЦИИ НЕ БЫЛО, ПОЭТОМУ КАРТИНКИ НЕ РАБОТАЛИ ---
@app.get("/api/img")
def proxy_img(url: str):
    if not url: return Response(status_code=404)
    try:
        r = client.session.get(url)
        content_type = r.headers.get("content-type", "image/jpeg")
        return Response(content=r.content, media_type=content_type)
    except Exception as e:
        print(f"Ошибка картинки: {e}")
        return Response(status_code=404)
# -------------------------------------------------------------

@app.get("/api/watching")
def get_watching():
    return client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)

# ... (Остальные эндпоинты остаются стандартными, они не влияют на картинки)
@app.get("/api/search")
def search(q: str): return client.search(q)

class AddRequest(BaseModel):
    post_id: str
    category: str
@app.post("/api/add")
def add_item(req: AddRequest):
    return {"success": client.add_favorite(req.post_id, CAT_WATCHING)}

# Статика
if not os.path.exists("static"): os.makedirs("static")
@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    response = FileResponse(f"static/{file_path}")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)