import os
import re
import json
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
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password},
                                headers=headers)
            if r.json().get('success'):
                self.is_logged_in = True
                return True
        except: pass
        return False

    def _parse_episodes_from_html(self, soup):
        seasons = {}
        # Ищем все элементы списка
        items = soup.find_all("li", class_="b-simple_episode__item")
        
        if not items: return None

        for item in items:
            try:
                # 1. Базовые параметры
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                title = item.text.strip()
                
                # 2. Ищем Глобальный ID и Статус просмотра
                # Сначала пробуем на самом LI
                global_id = item.get("data-id")
                is_watched = "watched" in item.get("class", []) or "b-watched" in item.get("class", [])

                # 3. ЕСЛИ НЕ НАШЛИ -> Ищем во внутреннем теге <i> (твой случай!)
                # <i class="watch-episode-action watched" data-id="...">
                action_icon = item.find(class_="watch-episode-action")
                
                if action_icon:
                    # Если ID не было на LI, берем с иконки
                    if not global_id:
                        global_id = action_icon.get("data-id")
                    
                    # Проверяем статус watched на иконке
                    if "watched" in action_icon.get("class", []):
                        is_watched = True

                # Еще один вариант (старый дизайн): <span class="b-ico">
                if not is_watched and item.find(class_="b-ico"):
                    is_watched = True

                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "title": title, "episode": e_id, 
                    "global_id": global_id, "watched": is_watched
                })
            except Exception as e:
                print(f"Error parsing item: {e}")
                continue
        
        return seasons

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

    def get_series_details(self, url):
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            post_id = None
            if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")
            else:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            # Strategy A: HTML
            seasons = self._parse_episodes_from_html(soup)
            if seasons:
                return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}

            # Strategy B: API
            translator_id = None
            active = soup.find(class_="b-translator__item active")
            if active: translator_id = active.get("data-translator_id")
            else:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: translator_id = match.group(1)

            if post_id:
                payload = {"id": post_id, "action": "get_episodes"}
                if translator_id: payload["translator_id"] = translator_id
                
                r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                data = r_ajax.json()
                if data.get('success'):
                    html = data.get('seasons') or data.get('episodes')
                    seasons = self._parse_episodes_from_html(BeautifulSoup(html, 'html.parser'))
                    if seasons:
                        return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}

            return {"error": "Серии не найдены", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()