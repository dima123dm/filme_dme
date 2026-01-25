import os
import re
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

class RezkaClient:
    def __init__(self):
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin = "https://hdrezka.me"

    def auth(self):
        if self.is_logged_in: return True
        try:
            print("🔑 Пробую авторизоваться...")
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password})
            res = r.json()
            if res.get('success'):
                self.is_logged_in = True
                print("✅ Успешно!")
                return True
            print(f"❌ Ошибка входа: {res.get('message')}")
        except Exception as e:
            print(f"Ошибка соединения: {e}")
        return False

    def get_category_items(self, cat_id):
        if not self.auth(): return []
        try:
            print(f"📂 Загружаю категорию {cat_id}")
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, 'html.parser')
            items = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = item.find(class_="b-content__inline_item-link").find("a")
                    img = item.find(class_="b-content__inline_item-cover").find("img")
                    status = item.find(class_="info")
                    
                    items.append({
                        "id": item.get("data-id"),
                        "title": link.text.strip(),
                        "url": link.get("href"),
                        "poster": img.get("src") if img else "",
                        "status": status.text.strip() if status else ""
                    })
                except: continue
            return items
        except: return []

    def search(self, query):
        if not self.auth(): return []
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/search.php", data={"q": query})
            soup = BeautifulSoup(r.content, 'html.parser')
            results = []
            for item in soup.select('.b-search__section_list li'):
                try:
                    link = item.find('a')
                    title = item.find('span', class_='enty').get_text().strip()
                    url = link.attrs['href']
                    match = re.search(r'/(\d+)-', url)
                    if match:
                        results.append({
                            "id": match.group(1),
                            "title": title,
                            "url": url,
                            # Заглушка, так как в быстром поиске нет картинок
                            "poster": "https://static.hdrezka.ac/templates/hdrezka/images/noposter.png"
                        })
                except: continue
            return results
        except: return []

    def add_favorite(self, post_id, cat_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/ajax/favorites/", data={
                "post_id": post_id, "cat_id": cat_id, "action": "add_post"
            })
            return r.json().get('success', False)
        except: return False

    def get_series_episodes(self, url):
        """Парсит страницу сериала и достает список серий"""
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 Парсинг страницы: {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # 1. Ищем HD Постер
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            # 2. Ищем ID поста
            post_id = None
            if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")
            if not post_id:
                # Fallback: ищем в JS коде
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            # 3. Ищем ID озвучки (translator_id)
            translator_id = None
            # Сначала пробуем активную кнопку
            active = soup.find(class_="b-translator__item active")
            if active: translator_id = active.get("data-translator_id")
            
            # Если кнопок нет, ищем скрытый ID в JS
            if not translator_id:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: translator_id = match.group(1)

            if not post_id: return {"error": "Не удалось найти ID сериала"}

            # 4. Запрашиваем точный список серий через API Резки
            payload = {
                "id": post_id,
                "translator_id": translator_id if translator_id else "238", # 238 - дефолт (оригинал) иногда помогает
                "action": "get_episodes"
            }
            
            print(f"📡 Запрос серий API: {payload}")
            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
            data = r_ajax.json()

            if not data.get('success'):
                return {"error": "Это фильм или серии не найдены", "poster": hq_poster}

            # 5. Разбираем HTML с сериями
            html_content = data.get('seasons') or data.get('episodes')
            ep_soup = BeautifulSoup(html_content, 'html.parser')
            
            seasons = {}
            # Важно: ищем по классу из твоего файла
            items = ep_soup.find_all("li", class_="b-simple_episode__item")
            
            for item in items:
                s_id = item.get("data-season_id")
                e_id = item.get("data-episode_id")
                # Глобальный ID для галочки (из твоего файла data-id="558366")
                global_id = item.get("data-id") 
                
                # Проверяем, просмотрено ли (класс 'b-watched' или внутри есть галочка)
                is_watched = "watched" in item.get("class", [])
                
                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "title": item.text.strip(),
                    "episode": e_id,
                    "global_id": global_id,
                    "watched": is_watched
                })

            return {"seasons": seasons, "poster": hq_poster}

        except Exception as e:
            print(f"Error parsing: {e}")
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            # Тот самый URL, который мы нашли в Network
            url = f"{self.origin}/engine/ajax/schedule_watched.php"
            r = self.session.post(url, data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()