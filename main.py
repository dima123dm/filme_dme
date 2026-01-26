import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

# Импортируем Response для картинок
from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from bot import client, bot, dp, check_updates_task, logger
import time

load_dotenv()

CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- ЗАПУСК ---
    polling_task = None
    update_task = None
    
    if bot:
        print("🚀 Запуск Telegram бота и фоновых задач...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    # --- ОСТАНОВКА ---
    print("🛑 Остановка сервисов...")
    
    # Корректная остановка задач (try/except на разных строках!)
    if polling_task:
        polling_task.cancel()
        try:
            await polling_task
        except:
            pass

    if update_task:
        update_task.cancel()
        try:
            await update_task
        except:
            pass
            
    if bot:
        await bot.session.close()

    try:
        client.session.close()
        if hasattr(client.session, "cookies"):
            client.session.cookies.clear()
        client.is_logged_in = False
        print("✅ HTTP‑сессия HDRezka закрыта")
    except Exception as e:
        print(f"⚠️ Ошибка закрытия сессии: {e}")
    
    print("✅ Сервер остановлен.")

app = FastAPI(lifespan=lifespan)

# Разрешаем CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AddRequest(BaseModel):
    post_id: str
    category: str

class WatchRequest(BaseModel):
    global_id: str
    referer: Optional[str] = None

class DeleteRequest(BaseModel):
    post_id: str
    category: str

# --- ЭНДПОИНТЫ ---

@app.get("/api/watching")
def get_watching():
    items = client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)
    print(f"[API] 📋 Возвращаем {len(items)} элементов")
    if items:
        print(f"[API] 📝 Пример первого элемента: {items[0]}")
    return items

@app.get("/api/later")
def get_later():
    return client.get_category_items_paginated(CAT_LATER, MAX_PAGES)

@app.get("/api/watched")
def get_watched():
    return client.get_category_items_paginated(CAT_WATCHED, MAX_PAGES)

@app.get("/api/details")
def get_details(url: str):
    return client.get_series_details(url)

@app.get("/api/search")
def search(q: str):
    return client.search(q)

@app.get("/api/franchise")
def get_franchise(url: str):
    return client.get_franchise_items(url)

class EpisodeUpdateRequest(BaseModel):
    url: str
    season: str
    episode: str

@app.post("/api/episode/mark")
def mark_episode_watched(req: EpisodeUpdateRequest):
    """Отмечает конкретную серию как просмотренную"""
    try:
        # Получаем детали сериала
        details = client.get_series_details(req.url)
        
        if not details or "seasons" not in details:
            return {"success": False, "error": "Failed to get series details"}
        
        # Ищем нужную серию
        seasons = details["seasons"]
        if req.season not in seasons:
            return {"success": False, "error": f"Season {req.season} not found"}
        
        episodes = seasons[req.season]
        target_episode = None
        
        for ep in episodes:
            if ep["episode"] == req.episode:
                target_episode = ep
                break
        
        if not target_episode:
            return {"success": False, "error": f"Episode {req.episode} not found"}
        
        # Отмечаем как просмотренную
        global_id = target_episode["global_id"]
        success = client.toggle_watch(global_id, req.url)
        
        return {"success": success, "watched": not target_episode["watched"]}
    except Exception as e:
        logger.error(f"Error marking episode: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/episode/mark-range")
def mark_episodes_range(req: dict):
    """Отмечает диапазон серий как просмотренные"""
    try:
        url = req.get("url")
        season = req.get("season")
        from_episode = int(req.get("from_episode", 1))
        to_episode = int(req.get("to_episode", 999))
        
        details = client.get_series_details(url)
        if not details or "seasons" not in details:
            return {"success": False, "error": "Failed to get series details"}
        
        seasons = details["seasons"]
        if season not in seasons:
            return {"success": False, "error": f"Season {season} not found"}
        
        episodes = seasons[season]
        marked_count = 0
        
        for ep in episodes:
            ep_num = int(ep["episode"])
            if from_episode <= ep_num <= to_episode:
                if not ep["watched"]:
                    global_id = ep["global_id"]
                    if client.toggle_watch(global_id, url):
                        marked_count += 1
                        time.sleep(0.3)  # Небольшая задержка между запросами
        
        return {"success": True, "marked": marked_count}
    except Exception as e:
        logger.error(f"Error marking episode range: {e}")
        return {"success": False, "error": str(e)}

# --- ПРОКСИ ДЛЯ КАРТИНОК (ОБЯЗАТЕЛЬНО) ---
@app.get("/api/img")
def proxy_img(url: str):
    if not url: 
        print("[IMG] ❌ Нет URL")
        return Response(status_code=404)
    
    print(f"[IMG] 📥 Запрос картинки: {url}")
    
    try:
        r = client.session.get(url, timeout=10)
        print(f"[IMG] ✅ Статус: {r.status_code}")
        print(f"[IMG] 📦 Размер: {len(r.content)} байт")
        
        content_type = r.headers.get("content-type", "image/jpeg")
        print(f"[IMG] 🎨 Тип: {content_type}")
        
        return Response(content=r.content, media_type=content_type)
    except Exception as e:
        print(f"[IMG] ❌ Ошибка: {e}")
        return Response(status_code=404)
# -----------------------------------------

@app.post("/api/add")
def add_item(req: AddRequest):
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.add_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/delete")
def delete_item(req: DeleteRequest):
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.remove_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    success = client.toggle_watch(req.global_id, req.referer)
    return {"success": success}

class MoveRequest(BaseModel):
    post_id: str
    from_category: str
    to_category: str

@app.post("/api/move")
def move_item(req: MoveRequest):
    # Сначала добавляем в новую категорию
    to_cat_id = CAT_WATCHING
    if req.to_category == "later": to_cat_id = CAT_LATER
    elif req.to_category == "watched": to_cat_id = CAT_WATCHED
    
    success_add = client.add_favorite(req.post_id, to_cat_id)
    if not success_add:
        return {"success": False, "error": "Failed to add to new category"}
    
    # Потом удаляем из старой категории
    from_cat_id = CAT_WATCHING
    if req.from_category == "later": from_cat_id = CAT_LATER
    elif req.from_category == "watched": from_cat_id = CAT_WATCHED
    
    success_remove = client.remove_favorite(req.post_id, from_cat_id)
    return {"success": success_add and success_remove}

# --- СТАТИКА ---
if not os.path.exists("static"):
    os.makedirs("static")

@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    response = FileResponse(f"static/{file_path}")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@app.get("/")
def serve_webapp():
    response = FileResponse("static/index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)