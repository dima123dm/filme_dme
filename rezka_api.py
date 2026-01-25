import os
import re
import time
import json
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()


class RezkaClient:
    """
    Класс-клиент для работы с сайтом Rezka (HDRezka).

    В оригинальной реализации существовал дефект, из‑за которого
    метод _parse_schedule_table анализировал только первую таблицу
    расписания (class="b-post__schedule_table") на странице сериала.
    На HDRezka же график выхода серий может состоять из нескольких
    таблиц: отдельно для текущего сезона и скрытых блоков для
    предыдущих. Из‑за этого статус «просмотрено» корректно
    определялся только для последних серий, а для эпизодов
    предыдущих сезонов считался неопределённым. В этой версии
    исправлена логика: разбираются все таблицы расписания, а для
    каждой строки корректно извлекаются сезон и номер серии.
    """

    def __init__(self):
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin = "https://hdrezka.me"

    def auth(self):
        """Аутентификация на сайте."""
        if self.is_logged_in:
            return True
        try:
            print(" Auth...")
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(
                f"{self.origin}/ajax/login/",
                data={"login_name": self.login, "login_password": self.password},
                headers=headers,
            )
            if r.json().get("success"):
                self.is_logged_in = True
                print("✅ Auth Success")
                return True
        except Exception:
            pass
        return False

    def _is_watched_check(self, element):
        """Проверка статуса просмотра для HTML‑элемента серии."""
        if not element:
            return False
        classes = element.get("class", [])
        # Некоторые строки таблицы помечаются классами watched / b-watched
        if "watched" in classes or "b-watched" in classes:
            return True
        # Также иконка может иметь класс watched
        action = element.find(
            attrs={"class": lambda x: x and ("watch-episode-action" in x or "b-ico" in x)}
        )
        if action:
            if "watched" in action.get("class", []):
                return True
        return False

    def _parse_schedule_table(self, soup: BeautifulSoup) -> dict:
        """
        Парсинг всех таблиц расписания на странице. Возвращает словарь
        сезонов со списками эпизодов, где каждому эпизоду назначается
        статус просмотра и глобальный идентификатор.

        Ранее разбиралась только одна таблица, что приводило к
        пропуску серий из скрытых блоков расписания. Теперь
        обходим все таблицы class="b-post__schedule_table".
        """
        seasons: dict[str, list] = {}
        # На странице может быть несколько таблиц: для текущего сезона и скрытые для предыдущих
        tables = soup.find_all("table", class_="b-post__schedule_table")
        for table in tables:
            for tr in table.find_all("tr"):
                td_1 = tr.find(class_="td-1")
                if not td_1:
                    continue
                text = td_1.get_text(strip=True)
                # Инициализируем сезон и эпизод по умолчанию
                s_id = "1"
                e_id = "1"
                # Пытаемся извлечь сезон и серию из текста, например: '2 сезон 5 серия'
                match = re.search(r"(\d+)\s*сезон\s*(\d+)\s*серия", text, re.IGNORECASE)
                if match:
                    s_id = match.group(1)
                    e_id = match.group(2)
                else:
                    # Иногда указано только '15 серия'
                    match_ep = re.search(r"(\d+)\s*серия", text, re.IGNORECASE)
                    if match_ep:
                        e_id = match_ep.group(1)
                # Нормализуем, убирая ведущие нули
                try:
                    s_id = str(int(s_id))
                except Exception:
                    pass
                try:
                    e_id = str(int(e_id))
                except Exception:
                    pass
                # Получаем глобальный идентификатор. Он может быть и в td, и в иконке
                global_id = td_1.get("data-id")
                action_icon = tr.find(
                    attrs={"class": lambda x: x and "watch-episode-action" in x}
                )
                if action_icon and action_icon.get("data-id"):
                    global_id = action_icon.get("data-id")
                # Пропускаем, если id не найден
                if not global_id:
                    continue
                is_watched = self._is_watched_check(tr)
                # Инициализируем список сезонов
                if s_id not in seasons:
                    seasons[s_id] = []
                # Проверяем существование эпизода, чтобы не создавать дубликаты
                exists = any(ep["episode"] == e_id for ep in seasons[s_id])
                if not exists:
                    seasons[s_id].append(
                        {
                            "title": text,
                            "episode": e_id,
                            "global_id": global_id,
                            "watched": is_watched,
                        }
                    )
        return seasons

    def _parse_html_list(self, html_content: str) -> dict:
        """
        Парсинг плоского списка серий из API cdn_series. Метод собирает
        уникальные эпизоды (ключ "s_id:e_id") и присваивает статус
        просмотра, если в списке есть соответствующие классы.
        """
        soup = BeautifulSoup(html_content, "html.parser")
        unique_episodes: dict[str, dict] = {}
        # Ищем контейнеры списков эпизодов
        containers = soup.find_all(
            "ul",
            class_=lambda x: x
            and ("simple_episodes__list" in x or "b-simple_episodes__list" in x),
        )
        if not containers:
            containers = soup.find_all("ul", id=re.compile(r"simple-episodes-list"))
        if not containers:
            containers = [soup]
        for cont in containers:
            # Определяем сезон по id контейнера, например simple-episodes-list-2
            container_s_id = None
            if hasattr(cont, "get") and cont.get("id"):
                match_s = re.search(r"list-(\d+)", cont.get("id"))
                if match_s:
                    container_s_id = match_s.group(1)
            li_items = cont.find_all("li", class_="b-simple_episode__item")
            for item in li_items:
                try:
                    # id сезона
                    s_id = item.get("data-season_id") or container_s_id or "1"
                    # id серии
                    e_id = item.get("data-episode_id")
                    if not e_id:
                        continue
                    s_id = str(int(s_id))
                    e_id = str(int(e_id))
                    title = item.get_text(strip=True)
                    global_id = item.get("data-id")
                    if not global_id:
                        inner = item.find(attrs={"data-id": True})
                        if inner:
                            global_id = inner.get("data-id")
                    if not global_id:
                        continue
                    is_watched = self._is_watched_check(item)
                    unique_episodes[f"{s_id}:{e_id}"] = {
                        "s_id": s_id,
                        "title": title,
                        "episode": e_id,
                        "global_id": global_id,
                        "watched": is_watched,
                    }
                except Exception:
                    continue
        print(f"   Найдено {len(unique_episodes)} уникальных серий")
        return unique_episodes

    def get_series_details(self, url: str) -> dict:
        """
        Возвращает подробную информацию о сериале: постер и список сезонов с эпизодами.

        Для каждого эпизода определяется статус просмотра на основе расписания
        (приоритетнее) и данных API cdn_series. Структура результата:

        {
            "seasons": {"1": [...], "2": [...]},
            "poster": "...url...",
            "post_id": "..."
        }
        """
        if not self.auth():
            return {"error": "Auth failed"}
        try:
            print(f"\n {url}")
            r = self.session.get(url)
            html_text = r.text
            soup = BeautifulSoup(html_text, "html.parser")
            # Получаем постер в высоком разрешении
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find("a"):
                    hq_poster = side.find("a").get("href")
                elif side.find("img"):
                    hq_poster = side.find("img").get("src")
            # Определяем post_id
            post_id = None
            match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', html_text)
            if match_pid:
                post_id = match_pid.group(1)
            elif soup.find(id="post_id"):
                post_id = soup.find(id="post_id").get("value")
            # Парсим расписание (таблица)
            table_seasons = self._parse_schedule_table(soup)
            all_unique_episodes: dict[str, dict] = {}
            if post_id:
                translator_id = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid:
                    translator_id = match_tid.group(1)
                else:
                    active = soup.find(class_="b-translator__item active")
                    if active:
                        translator_id = active.get("data-translator_id")
                # Список id сезонов, которые можно запросить через ajax/get_cdn_series
                season_ids = re.findall(r'data-tab_id=["\'](\d+)["\']', html_text)
                season_ids = sorted(
                    list(set(season_ids)), key=lambda x: int(x) if x.isdigit() else 0
                )
                # Фильтруем только разумные id
                season_ids = [s for s in season_ids if s.isdigit() and int(s) < 200]
                if season_ids:
                    print(f" Сезоны: {season_ids}")
                    for season_id in season_ids:
                        payload = {
                            "id": post_id,
                            "translator_id": translator_id if translator_id else "238",
                            "season": season_id,
                            "action": "get_episodes",
                        }
                        try:
                            time.sleep(0.05)
                            r_ajax = self.session.post(
                                f"{self.origin}/ajax/get_cdn_series/", data=payload
                            )
                            data = r_ajax.json()
                            if data.get("success"):
                                html = data.get("episodes") or data.get("seasons")
                                new_eps = self._parse_html_list(html)
                                all_unique_episodes.update(new_eps)
                        except Exception:
                            continue
                else:
                    print(" Качаю всё сразу...")
                    payload = {
                        "id": post_id,
                        "translator_id": translator_id or "238",
                        "action": "get_episodes",
                    }
                    try:
                        r_ajax = self.session.post(
                            f"{self.origin}/ajax/get_cdn_series/", data=payload
                        )
                        data = r_ajax.json()
                        if data.get("success"):
                            html = data.get("episodes") or data.get("seasons")
                            new_eps = self._parse_html_list(html)
                            all_unique_episodes.update(new_eps)
                    except Exception:
                        pass
            # Фолбек: если ajax ответ пуст, парсим с html страницы
            if not all_unique_episodes:
                print("⚠️ API пуст, беру страницу...")
                new_eps = self._parse_html_list(html_text)
                all_unique_episodes.update(new_eps)
            # Объединяем cdn-эпизоды со статусами из таблицы
            final_seasons_dict: dict[str, list] = {}
            # Сначала из cdn (player)
            for _, ep_data in all_unique_episodes.items():
                s_id = ep_data["s_id"]
                if s_id not in final_seasons_dict:
                    final_seasons_dict[s_id] = []
                clean_ep = ep_data.copy()
                # удаляем служебное поле s_id, он не нужен в конечном ответе
                del clean_ep["s_id"]
                final_seasons_dict[s_id].append(clean_ep)
            # Затем обновляем статусами из расписания: таблица имеет приоритет
            if table_seasons:
                print(" Объединение с таблицей...")
                for s_id, t_eps in table_seasons.items():
                    if s_id not in final_seasons_dict:
                        final_seasons_dict[s_id] = list(t_eps)
                        continue
                    for t_ep in t_eps:
                        found = False
                        for p_ep in final_seasons_dict[s_id]:
                            if str(p_ep["episode"]) == str(t_ep["episode"]):
                                found = True
                                if t_ep["watched"]:
                                    p_ep["watched"] = True
                                if not p_ep["global_id"]:
                                    p_ep["global_id"] = t_ep["global_id"]
                                break
                        if not found:
                            final_seasons_dict[s_id].append(t_ep)
            # Сортируем сезоны и серии внутри
            sorted_seasons: dict[str, list] = {}
            sorted_keys = sorted(
                final_seasons_dict.keys(), key=lambda x: int(x) if x.isdigit() else 999
            )
            for s in sorted_keys:
                eps = final_seasons_dict[s]
                eps.sort(key=lambda x: int(x["episode"]) if x["episode"].isdigit() else 999)
                sorted_seasons[s] = eps
            if sorted_seasons:
                return {"seasons": sorted_seasons, "poster": hq_poster, "post_id": post_id}
            return {"error": "Нет серий", "poster": hq_poster, "post_id": post_id}
        except Exception as e:
            return {"error": str(e)}

    # Методы для категорий, поиска и добавления/переключения статуса
    def get_category_items(self, cat_id: str) -> list:
        if not self.auth():
            return []
        try:
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, "html.parser")
            items = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = item.find(class_="b-content__inline_item-link").find("a")
                    img = item.find(class_="b-content__inline_item-cover").find("img")
                    status = item.find(class_="info")
                    items.append(
                        {
                            "id": item.get("data-id"),
                            "title": link.get_text(strip=True),
                            "url": link.get("href"),
                            "poster": img.get("src") if img else "",
                            "status": status.get_text(strip=True) if status else "",
                        }
                    )
                except Exception:
                    continue
            return items
        except Exception:
            return []

    def search(self, query: str) -> list:
        if not self.auth():
            return []
        try:
            r = self.session.post(
                f"{self.origin}/engine/ajax/search.php", data={"q": query}
            )
            soup = BeautifulSoup(r.content, "html.parser")
            results = []
            for item in soup.select(".b-search__section_list li"):
                try:
                    link = item.find("a")
                    title = item.find("span", class_="enty").get_text().strip()
                    url = link.attrs["href"]
                    match = re.search(r"/(\d+)-", url)
                    if match:
                        results.append({"id": match.group(1), "title": title, "url": url})
                except Exception:
                    continue
            return results
        except Exception:
            return []

    def add_favorite(self, post_id: str, cat_id: str) -> bool:
        if not self.auth():
            return False
        try:
            r = self.session.post(
                f"{self.origin}/ajax/favorites/",
                data={"post_id": post_id, "cat_id": cat_id, "action": "add_post"},
            )
            return r.json().get("success", False)
        except Exception:
            return False

    def toggle_watch(self, global_id: str) -> bool:
        if not self.auth():
            return False
        try:
            r = self.session.post(
                f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id}
            )
            return r.status_code == 200
        except Exception:
            return False


client = RezkaClient()