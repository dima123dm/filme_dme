import os
import re
import time
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
            print("🔑 Auth...")
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password},
                                headers=headers)
            if r.json().get('success'):
                self.is_logged_in = True
                print("✅ Auth Success")
                return True
        except: pass
        return False

    def _is_watched_check(self, element):
        """Проверка статуса просмотра"""
        if not element: return False
        classes = element.get("class", [])
        if "watched" in classes or "b-watched" in classes: return True
        action = element.find(attrs={"class": lambda x: x and ("watch-episode-action" in x or "b-ico" in x)})
        if action:
            if "watched" in action.get("class", []): return True
        return False

    def _parse_schedule_table(self, soup):
        """Парсинг таблицы"""
        seasons = {}
        table = soup.find("table", class_="b-post__schedule_table")
        if not table: return {}

        for tr in table.find_all("tr"):
            td_1 = tr.find(class_="td-1")
            if not td_1: continue
            
            text = td_1.text.strip()
            s_id = "1"
            e_id = "1"
            
            match = re.search(r'(\d+)\s*сезон\s*(\d+)\s*серия', text)
            if match:
                s_id = match.group(1)
                e_id = match.group(2)
            else:
                match_ep = re.search(r'(\d+)\s*серия', text)
                if match_ep: e_id = match_ep.group(1)
            
            # Нормализация (1 вместо 01)
            s_id = str(int(s_id))
            e_id = str(int(e_id))

            global_id = td_1.get("data-id")
            action_icon = tr.find(attrs={"class": lambda x: x and "watch-episode-action" in x})
            if action_icon and action_icon.get("data-id"):
                global_id = action_icon.get("data-id")
            
            if not global_id: continue

            is_watched = self._is_watched_check(tr)

            if s_id not in seasons: seasons[s_id] = []
            
            exists = False
            for ep in seasons[s_id]:
                if ep['episode'] == e_id: exists = True
            
            if not exists:
                seasons[s_id].append({
                    "title": text, "episode": e_id, 
                    "global_id": global_id, "watched": is_watched
                })
        return seasons

    def _parse_html_list(self, html_content):
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Словарь для уникальных серий: key="s_id:e_id", value=EpisodeData
        # Это предотвращает дубликаты при парсинге
        unique_episodes = {}
        
        # Ищем контейнеры (ul)
        containers = soup.find_all("ul", class_=lambda x: x and ("simple_episodes__list" in x or "b-simple_episodes__list" in x))
        if not containers:
            # Если контейнеров нет, ищем ID списков (например id="simple-episodes-list-1")
            containers = soup.find_all("ul", id=re.compile(r"simple-episodes-list"))
        
        # Если всё равно нет, берем всё (для API ответов)
        if not containers:
            containers = [soup]

        items_found = 0
        for cont in containers:
            # Пытаемся определить сезон по ID контейнера (ul id="simple-episodes-list-2")
            container_s_id = None
            if hasattr(cont, 'get') and cont.get('id'):
                match_s = re.search(r'list-(\d+)', cont.get('id'))
                if match_s: container_s_id = match_s.group(1)

            li_items = cont.find_all("li", class_="b-simple_episode__item")
            items_found += len(li_items)

            for item in li_items:
                try:
                    # 1. Определяем Сезон
                    s_id = item.get("data-season_id")
                    if not s_id: s_id = container_s_id # Берем от родителя
                    if not s_id: s_id = "1" # Фолбек
                    
                    # 2. Определяем Серию
                    e_id = item.get("data-episode_id")
                    if not e_id: continue # Без номера серии нельзя

                    # Нормализация
                    s_id = str(int(s_id))
                    e_id = str(int(e_id))

                    title = item.text.strip()
                    global_id = item.get("data-id")
                    if not global_id:
                        inner = item.find(attrs={"data-id": True})
                        if inner: global_id = inner.get("data-id")

                    if not global_id: continue

                    is_watched = self._is_watched_check(item)

                    # Сохраняем (перезаписываем, если уже есть - это обновляет статус)
                    unique_episodes[f"{s_id}:{e_id}"] = {
                        "s_id": s_id,
                        "title": title, "episode": e_id, 
                        "global_id": global_id, "watched": is_watched
                    }
                except: continue
        
        print(f"  📺 Найдено {len(unique_episodes)} уникальных серий")
        return unique_episodes

    def get_series_details(self, url):
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"\n🔎 {url}")
            r = self.session.get(url)
            html_text = r.text
            soup = BeautifulSoup(html_text, 'html.parser')
            
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            post_id = None
            match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', html_text)
            if match_pid: post_id = match_pid.group(1)
            else: 
                if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")

            # 1. Таблица (Резерв)
            table_seasons = self._parse_schedule_table(soup)
            
            # 2. Плеер (Собираем все серии в общую кучу)
            # Мы используем плоский словарь all_unique_episodes, чтобы не дублировать
            all_unique_episodes = {} 

            if post_id:
                translator_id = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid: translator_id = match_tid.group(1)
                else:
                    active = soup.find(class_="b-translator__item active")
                    if active: translator_id = active.get("data-translator_id")

                # Ищем сезоны
                season_ids = re.findall(r'data-tab_id=["\'](\d+)["\']', html_text)
                season_ids = sorted(list(set(season_ids)), key=lambda x: int(x) if x.isdigit() else 0)
                season_ids = [s for s in season_ids if s.isdigit() and int(s) < 200]

                if season_ids:
                    print(f"📋 Сезоны: {season_ids}")
                    for season_id in season_ids:
                        payload = {
                            "id": post_id, 
                            "translator_id": translator_id if translator_id else "238",
                            "season": season_id,
                            "action": "get_episodes"
                        }
                        try:
                            time.sleep(0.05)
                            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                            data = r_ajax.json()
                            if data.get('success'):
                                html = data.get('episodes') or data.get('seasons')
                                # Парсим и сливаем в общий котел
                                new_eps = self._parse_html_list(html)
                                all_unique_episodes.update(new_eps)
                        except: pass
                else:
                    print("🚀 Качаю всё сразу...")
                    payload = {"id": post_id, "translator_id": translator_id or "238", "action": "get_episodes"}
                    try:
                        r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                        data = r_ajax.json()
                        if data.get('success'):
                            html = data.get('episodes') or data.get('seasons')
                            new_eps = self._parse_html_list(html)
                            all_unique_episodes.update(new_eps)
                    except: pass

            # Фолбек на страницу
            if not all_unique_episodes:
                print("⚠️ API пуст, беру страницу...")
                new_eps = self._parse_html_list(html_text)
                all_unique_episodes.update(new_eps)

            # 3. Преобразуем плоский словарь обратно в структуру сезонов
            final_seasons_dict = {}
            
            # Сначала заполняем из Плеера
            for key, ep_data in all_unique_episodes.items():
                s_id = ep_data['s_id']
                if s_id not in final_seasons_dict: final_seasons_dict[s_id] = []
                
                # Удаляем служебное поле s_id перед добавлением
                clean_ep = ep_data.copy()
                del clean_ep['s_id']
                final_seasons_dict[s_id].append(clean_ep)

            # 4. Объединение с таблицей (Таблица главнее по статусу)
            if table_seasons:
                print("🔄 Объединение с таблицей...")
                for s_id, t_eps in table_seasons.items():
                    if s_id not in final_seasons_dict:
                        final_seasons_dict[s_id] = t_eps
                        continue
                    
                    for t_ep in t_eps:
                        found = False
                        for p_ep in final_seasons_dict[s_id]:
                            # Сравниваем как строки
                            if str(p_ep['episode']) == str(t_ep['episode']):
                                found = True
                                if t_ep['watched']: p_ep['watched'] = True
                                if not p_ep['global_id']: p_ep['global_id'] = t_ep['global_id']
                                break
                        if not found:
                             final_seasons_dict[s_id].append(t_ep)

            # Сортировка
            sorted_seasons = {}
            # Сортируем ключи сезонов (1, 2, 3...)
            sorted_keys = sorted(final_seasons_dict.keys(), key=lambda x: int(x) if x.isdigit() else 999)
            
            for s in sorted_keys:
                eps = final_seasons_dict[s]
                # Сортируем серии внутри сезона (1, 2, 3...)
                eps.sort(key=lambda x: int(x['episode']) if x['episode'].isdigit() else 999)
                sorted_seasons[s] = eps

            if sorted_seasons:
                return {"seasons": sorted_seasons, "poster": hq_poster, "post_id": post_id}
            
            return {"error": "Нет серий", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            return {"error": str(e)}

    # Стандартные методы
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
                        results.append({"id": match.group(1), "title": title, "url": url})
                except: continue
            return results
        except: return []

    def add_favorite(self, post_id, cat_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/ajax/favorites/", data={"post_id": post_id, "cat_id": cat_id, "action": "add_post"})
            return r.json().get('success', False)
        except: return False

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()