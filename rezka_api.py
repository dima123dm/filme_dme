import os
import re
import json
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

class RezkaClient:
    def __init__(self):
        # Маскировка под Chrome
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin = "https://hdrezka.me"

    def auth(self):
        if self.is_logged_in: return True
        try:
            print("🔑 Авторизация...")
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password},
                                headers=headers)
            if r.json().get('success'):
                self.is_logged_in = True
                print("✅ Вход выполнен")
                return True
        except: pass
        print("❌ Ошибка входа")
        return False

    def _is_watched(self, tag):
        """Проверка галочки (все варианты)"""
        # 1. Класс на самом элементе
        classes = tag.get("class", [])
        if "watched" in classes or "b-watched" in classes:
            return True
        
        # 2. Класс внутри (на иконке)
        # <i class="watch-episode-action watched">
        icon = tag.find(class_=lambda x: x and ("watch-episode-action" in x or "b-ico" in x))
        if icon:
            icon_classes = icon.get("class", [])
            if "watched" in icon_classes or "b-watched" in icon_classes:
                return True
                
        return False

    def _parse_html_list(self, html_content):
        """Разбирает HTML, который прислал API"""
        soup = BeautifulSoup(html_content, 'html.parser')
        seasons = {}
        
        # Ищем все li (серии)
        items = soup.find_all("li", class_="b-simple_episode__item")
        
        for item in items:
            try:
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                title = item.text.strip()
                
                # ID для галочки
                global_id = item.get("data-id")
                # Если нет на li, ищем внутри
                if not global_id:
                    inner = item.find(attrs={"data-id": True})
                    if inner: global_id = inner.get("data-id")

                # Статус
                is_watched = self._is_watched(item)

                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "title": title, "episode": e_id, 
                    "global_id": global_id, "watched": is_watched
                })
            except: continue
            
        return seasons

    def get_series_details(self, url):
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 Анализ страницы: {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # 1. Постер HD
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            # 2. Ищем ID поста
            post_id = None
            if soup.find(id="post_id"): 
                post_id = soup.find(id="post_id").get("value")
            else:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            if not post_id:
                return {"error": "Не удалось найти ID сериала", "poster": hq_poster}

            # 3. Ищем ID Озвучки (Translator ID)
            translator_id = None
            
            # Сначала ищем активную (ту, которая выбрана у тебя в профиле или по умолчанию)
            active_trans = soup.find(class_="b-translator__item active")
            if active_trans:
                translator_id = active_trans.get("data-translator_id")
                print(f"🎙 Нашел активную озвучку ID: {translator_id}")
            
            # Если активной нет (бывает, если озвучка всего одна), ищем в скриптах
            if not translator_id:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: 
                    translator_id = match.group(1)
                    print(f"🎙 Нашел скрытую озвучку ID: {translator_id}")

            # 4. ДЕЛАЕМ ЗАПРОС К API ЗА ВСЕМИ СЕЗОНАМИ
            # Даже если translator_id нет (null), API может вернуть дефолтную озвучку
            print(f"🚀 Запрашиваю полный список серий через API (ID: {post_id})...")
            
            payload = {
                "id": post_id,
                "translator_id": translator_id if translator_id else "238", # 238 часто default
                "action": "get_episodes"
            }
            
            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
            data = r_ajax.json()
            
            if data.get('success'):
                # API возвращает HTML со ВСЕМИ сезонами
                html = data.get('seasons') or data.get('episodes')
                seasons = self._parse_html_list(html)
                
                if seasons:
                    print(f"✅ Успех! Загружено сезонов: {len(seasons)}")
                    return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}
            
            # Если API не сработал (например, это фильм), пробуем парсить саму страницу
            print("⚠️ API не вернул серий. Пробую парсить страницу (возможно это фильм)...")
            seasons = self._parse_html_list(r.text)
            if seasons:
                 return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}

            return {"error": "Серии не найдены", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            print(f"CRITICAL ERROR: {e}")
            return {"error": str(e)}

    # --- Остальные методы без изменений ---
    def get_category_items(self, cat_id):
        if not self.auth(): return []
        try:
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
                            "title": title, "url": url
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

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()