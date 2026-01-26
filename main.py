import os
import asyncio
import urllib.parse
from contextlib import asynccontextmanager
from typing import Optional, List

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

# Импортируем бота (Rezka)
from bot import client, bot, dp, check_updates_task

load_dotenv()

# Настройки категорий
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск бота
    polling_task = None
    update_task = None
    if bot:
        print("🚀 Запуск Telegram бота...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    # Остановка
    print("🛑 Остановка сервисов...")
    if polling_task: polling_task.cancel()
    if update_task: update_task.cancel()
    if bot: await bot.session.close()
    try:
        client.session.close()
    except: pass

app = FastAPI(lifespan=lifespan)

# Разрешаем CORS для локальных тестов
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- МОДЕЛИ ДАННЫХ ---
class AddRequest(BaseModel):
    post_id: str
    category: str

class WatchRequest(BaseModel):
    global_id: str
    referer: Optional[str] = None

class DeleteRequest(BaseModel):
    post_id: str
    category: str

# --- ЛОГИКА ПОИСКА KINOGO (ИЗ SERVER.PY, НО ASYNC) ---
async def search_kinogo_server(query: str):
    print(f"🔍 [Server] Поиск Kinogo через Playwright: {query}")
    async with async_playwright() as p:
        # Запускаем браузер headless (без окна)
        browser = await p.chromium.launch(
            headless=True, 
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        try:
            page = await browser.new_page()
            # Идем на главную
            await page.goto("https://kinogo.inc/", timeout=30000, wait_until="domcontentloaded")
            
            # Ищем поле поиска (как в твоем server.py)
            search_input = page.locator('input[name="story"], input[type="text"][placeholder*="поиск"], .search input').first
            if await search_input.count() > 0:
                await search_input.fill(query)
                await page.wait_for_timeout(500)
                await search_input.press('Enter')
                
                # Ждем результаты
                await page.wait_for_timeout(3000)
                
                # Парсим результаты
                html = await page.content()
                soup = BeautifulSoup(html, 'html.parser')
                items = soup.select('.shortstory')
                
                results = []
                for item in items:
                    try:
                        # Логика извлечения ссылки (адаптирована из server.py)
                        title_tag = item.select_one('h2.zagolovki a') or item.select_one('.shortstorytitle a')
                        if not title_tag: continue
                        
                        link = title_tag.get('href')
                        title = title_tag.get_text(strip=True)
                        
                        # Исправляем относительные ссылки
                        if link and not link.startswith('http'):
                            link = 'https://kinogo.inc' + link if link.startswith('/') else 'https://kinogo.inc/' + link
                            
                        # Постер
                        img_tag = item.select_one('.shortimg img') or item.select_one('img')
                        poster = ""
                        if img_tag:
                            poster = img_tag.get('src') or img_tag.get('data-src') or ""
                            if poster and not poster.startswith('http'):
                                poster = 'https://kinogo.inc' + poster

                        results.append({
                            "title": title,
                            "url": link,
                            "poster": poster
                        })
                    except Exception: 
                        continue
                return results
            else:
                print("⚠️ Поле поиска не найдено")
                return []
        except Exception as e:
            print(f"❌ Ошибка поиска: {e}")
            return []
        finally:
            await browser.close()

# --- API ENDPOINTS ---

@app.get("/api/kinogo/search")
async def kinogo_search_api(q: str):
    """API для поиска, вызывает браузер на сервере"""
    results = await search_kinogo_server(q)
    return results

# ... (Остальные эндпоинты Rezka без изменений) ...
@app.get("/api/watching")
def get_watching(): return client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)

@app.get("/api/later")
def get_later(): return client.get_category_items_paginated(CAT_LATER, MAX_PAGES)

@app.get("/api/watched")
def get_watched(): return client.get_category_items_paginated(CAT_WATCHED, MAX_PAGES)

@app.get("/api/details")
def get_details(url: str): return client.get_series_details(url)

@app.get("/api/search")
def search(q: str): return client.search(q)

@app.post("/api/add")
def add_item(req: AddRequest):
    cat = CAT_WATCHING
    if req.category == "later": cat = CAT_LATER
    elif req.category == "watched": cat = CAT_WATCHED
    return {"success": client.add_favorite(req.post_id, cat)}

@app.post("/api/delete")
def delete_item(req: DeleteRequest):
    cat = CAT_WATCHING
    if req.category == "later": cat = CAT_LATER
    elif req.category == "watched": cat = CAT_WATCHED
    return {"success": client.remove_favorite(req.post_id, cat)}

@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    return {"success": client.toggle_watch(req.global_id, req.referer)}

# Статика
if not os.path.exists("static"): os.makedirs("static")

@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    return FileResponse(f"static/{file_path}", headers={"Cache-Control": "no-cache"})

@app.get("/")
def serve_index():
    return FileResponse("static/index.html", headers={"Cache-Control": "no-cache"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)