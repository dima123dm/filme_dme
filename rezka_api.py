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
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password})
            if r.json().get('success'):
                self.is_logged_in = True
                return True
        except: pass
        return False

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
        """Поиск фильмов"""
        if not self.auth(): return []
        try:
            # Используем быстрый поиск API
            r = self.session.post(f"{self.origin}/engine/ajax/search.php", data={"q": query})
            soup = BeautifulSoup(r.content, 'html.parser')
            results = []
            
            # Парсим выпадающий список
            for item in soup.select('.b-search__section_list li'):
                try:
                    link = item.find('a')
                    title_block = item.find('span', class_='enty')
                    if not title_block: continue
                    
                    title = title_block.get_text().strip()
                    url = link.attrs['href']
                    
                    # ID иногда нет в быстром поиске, но он есть в ссылке
                    # .../12345-name.html
                    match = re.search(r'/(\d+)-', url)
                    post_id = match.group(1) if match else None

                    if post_id:
                        results.append({
                            "id": post_id,
                            "title": title,
                            "url": url,
                            # В быстром поиске нет картинок, поставим заглушку или можно парсить страницу
                            "poster": "https://statichdrezka.ac/templates/hdrezka/images/noposter.png" 
                        })
                except: continue
            return results
        except Exception as e:
            print(f"Search error: {e}")
            return []

    def add_favorite(self, post_id, cat_id):
        """Добавить в избранное"""
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/ajax/favorites/", data={
                "post_id": post_id,
                "cat_id": cat_id,
                "action": "add_post"
            })
            return r.json().get('success', False)
        except: return False

    def get_series_episodes(self, url):
        """Парсит сезоны, серии и HD постер"""
        if not self.auth(): return {}
        try:
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # 1. Ищем HD Постер (в боковой колонке ссылка на картинку)
            hq_poster = ""
            side_cover = soup.find(class_="b-sidecover")
            if side_cover:
                link_tag = side_cover.find('a')
                if link_tag: hq_poster = link_tag.get('href')
                else: 
                    img_tag = side_cover.find('img')
                    if img_tag: hq_poster = img_tag.get('src')

            # 2. Ищем ID сериала (3 способа)
            post_id = None
            if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")
            if not post_id:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)
            if not post_id:
                # Из URL
                match = re.search(r'/(\d+)-', url)
                if match: post_id = match.group(1)

            # 3. Ищем ID озвучки
            translator_id = None
            active_trans = soup.find(class_="b-translator__item active")
            if active_trans:
                translator_id = active_trans.get("data-translator_id")
            
            # Если нет активной (одна озвучка), ищем в JS
            if not translator_id:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: translator_id = match.group(1)
                
            # Если это фильм (нет серий), API вернет ошибку, но это норм
            if not post_id: return {"error": "Не удалось найти ID"}

            # Запрашиваем список серий
            # Если translator_id нет, пробуем без него (иногда работает дефолт)
            payload = {"id": post_id, "action": "get_episodes"}
            if translator_id: payload["translator_id"] = translator_id

            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
            data = r_ajax.json()
            
            if not data.get('success'): 
                # Возможно это фильм или еще не вышел
                return {"error": "Серии не найдены (возможно фильм)", "poster": hq_poster}
            
            html = data.get('seasons') or data.get('episodes')
            ep_soup = BeautifulSoup(html, 'html.parser')
            
            seasons = {}
            for item in ep_soup.find_all(class_="b-simple_episode__item"):
                s_id = item.get("data-season_id")
                e_id = item.get("data-episode_id")
                ep_id_global = item.get("data-id")
                is_watched = "watched" in item.get("class", [])
                
                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "episode": e_id,
                    "global_id": ep_id_global,
                    "watched": is_watched,
                    "title": item.text.strip()
                })
                
            return {"seasons": seasons, "poster": hq_poster}

        except Exception as e:
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()