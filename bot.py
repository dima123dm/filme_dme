import asyncio
import json
import logging
import os
import time
import math
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from dotenv import load_dotenv

from rezka_client import RezkaClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- КОНФИГУРАЦИЯ ---
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN") 
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://127.0.0.1:8080")
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
STATE_FILE = "series_state.json"

if not BOT_TOKEN:
    logger.error("❌ Ошибка: Не задан TELEGRAM_BOT_TOKEN в .env")

client = RezkaClient()
bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()

# --- СОСТОЯНИЕ (База данных в файле) ---
def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения состояния: {e}")

# --- START ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    global TELEGRAM_CHAT_ID
    user_id = str(message.from_user.id)
    
    env_id = os.getenv("TELEGRAM_CHAT_ID")
    if env_id and user_id != str(env_id):
        return

    if not TELEGRAM_CHAT_ID:
        TELEGRAM_CHAT_ID = user_id
        logger.info(f"✅ Chat ID установлен: {TELEGRAM_CHAT_ID}")
    
    url_no_cache = f"{WEBAPP_URL}?v={int(time.time())}"
    
    # КЛАВИАТУРА ГЛАВНОГО МЕНЮ
    keyboard = [
        [types.InlineKeyboardButton(text="🎬 Открыть HDRezka", web_app=WebAppInfo(url=url_no_cache))],
        [types.InlineKeyboardButton(text="📑 Мои сериалы (Настройки)", callback_data="my_list_1")]
    ]
    
    await message.answer(
        "👋 Привет! Я буду присылать уведомления о новых сериях.\n"
        "Нажми кнопку ниже, чтобы открыть приложение или настроить озвучки.",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard)
    )

# --- СПИСОК СЕРИАЛОВ (С ПАГИНАЦИЕЙ) ---
@dp.callback_query(F.data.startswith("my_list_"))
async def show_watchlist(callback: types.CallbackQuery):
    page = int(callback.data.split("_")[2])
    
    await callback.answer("Загружаю список...")
    
    try:
        # Получаем список "Смотрю"
        items = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
        
        if not items:
            await callback.message.answer("Список 'Смотрю' пуст или ошибка доступа.")
            return

        # Обновляем стейт URL-ами, чтобы потом работали настройки
        state = load_state()
        changed = False
        for item in items:
            iid = str(item["id"])
            if iid not in state:
                state[iid] = {}
            # Всегда обновляем актуальные данные
            if state[iid].get("url") != item["url"]:
                state[iid]["url"] = item["url"]
                state[iid]["title"] = item["title"]
                changed = True
        
        if changed:
            save_state(state)

        # Пагинация (по 10 штук)
        items_per_page = 10
        total_pages = math.ceil(len(items) / items_per_page)
        start = (page - 1) * items_per_page
        end = start + items_per_page
        current_items = items[start:end]
        
        kb = []
        for item in current_items:
            # Кнопка с названием сериала ведет в настройки этого сериала
            kb.append([InlineKeyboardButton(text=f"🎬 {item['title']}", callback_data=f"sett_{item['id']}")])
            
        # Кнопки навигации
        nav_row = []
        if page > 1:
            nav_row.append(InlineKeyboardButton(text="⬅️ Назад", callback_data=f"my_list_{page-1}"))
        if page < total_pages:
            nav_row.append(InlineKeyboardButton(text="Вперед ➡️", callback_data=f"my_list_{page+1}"))
            
        if nav_row:
            kb.append(nav_row)
            
        kb.append([InlineKeyboardButton(text="Закрыть", callback_data="close_settings")])
        
        text = f"📑 <b>Ваши сериалы ({len(items)}):</b>\nСтраница {page}/{total_pages}\n<i>Нажмите на сериал для настройки озвучки</i>"
        
        # Если это первое сообщение - отправляем новое, иначе редактируем
        if callback.message.text and "Ваши сериалы" in callback.message.text:
            await callback.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")
        else:
            await callback.message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")
            
    except Exception as e:
        logger.error(f"Error watchlist: {e}")
        await callback.message.answer("Ошибка загрузки списка.")

# --- МЕНЮ НАСТРОЕК ОЗВУЧЕК (ОДИН СЕРИАЛ) ---
@dp.callback_query(F.data.startswith("sett_"))
async def open_settings(callback: types.CallbackQuery):
    post_id = callback.data.split("_")[1]
    
    state = load_state()
    series_data = state.get(post_id, {})
    url = series_data.get("url")
    title = series_data.get("title", "Сериал")
    
    if not url:
        await callback.answer("Ошибка: URL не найден. Обновите список сериалов.", show_alert=True)
        return

    await callback.answer("Загружаю озвучки...")
    
    try:
        # Получаем актуальный список озвучек с сайта
        details = await asyncio.to_thread(client.get_series_details, url)
        translators = details.get("translators", [])
        
        if not translators:
            await callback.message.edit_text(f"🎬 <b>{title}</b>\n❌ Для этого сериала озвучки не найдены (или он не многоголосый).", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Назад к списку", callback_data="my_list_1")]]), parse_mode="HTML")
            return

        kb = []
        user_prefs = series_data.get("prefs", {}) 
        
        # Если настройки пустые, пытаемся найти "активную" озвучку (которая открывается по ссылке)
        # Но для надежности просто показываем всё выключенным, если пользователь не включал
        
        for t in translators:
            t_id = str(t["id"])
            t_name = t["name"]
            
            is_active = user_prefs.get(t_id, False)
            icon = "✅" if is_active else "❌"
            
            kb.append([
                InlineKeyboardButton(
                    text=f"{icon} {t_name}", 
                    callback_data=f"tog_{post_id}_{t_id}"
                )
            ])
            
        kb.append([InlineKeyboardButton(text="🔙 Назад к списку", callback_data="my_list_1")])
        
        await callback.message.edit_text(
            f"⚙️ <b>Настройка уведомлений</b>\n🎬 <b>{title}</b>\n\nВыберите озвучки, за которыми следить (нажмите, чтобы переключить):",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=kb),
            parse_mode="HTML"
        )
        
    except Exception as e:
        logger.error(f"Error settings: {e}")
        await callback.message.edit_text("Ошибка при загрузке настроек.")

# --- ПЕРЕКЛЮЧЕНИЕ ОЗВУЧКИ ---
@dp.callback_query(F.data.startswith("tog_"))
async def toggle_voice(callback: types.CallbackQuery):
    _, post_id, t_id = callback.data.split("_")
    
    state = load_state()
    if post_id not in state: state[post_id] = {}
    if "prefs" not in state[post_id]: state[post_id]["prefs"] = {}

    # Инвертируем
    current_val = state[post_id]["prefs"].get(t_id, False)
    new_val = not current_val
    state[post_id]["prefs"][t_id] = new_val
    
    save_state(state)
    
    # Обновляем кнопку без перерисовки всего сообщения
    current_kb = callback.message.reply_markup.inline_keyboard
    new_kb = []
    
    for row in current_kb:
        new_row = []
        for btn in row:
            if btn.callback_data == callback.data:
                text = btn.text
                if new_val:
                    new_text = "✅" + text[1:] # Меняем крестик на галочку
                else:
                    new_text = "❌" + text[1:]
                new_row.append(InlineKeyboardButton(text=new_text, callback_data=btn.callback_data))
            else:
                new_row.append(btn)
        new_kb.append(new_row)
            
    await callback.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=new_kb))
    await callback.answer(f"{'Включено' if new_val else 'Выключено'}")

@dp.callback_query(F.data == "close_settings")
async def close_settings_handler(callback: types.CallbackQuery):
    await callback.message.delete()

# --- ФОНОВАЯ ЗАДАЧА ---
async def check_updates_task():
    if not bot: return

    logger.info("⏳ Фоновая проверка обновлений запущена (интервал 15 мин)...")
    await asyncio.sleep(5)

    while True:
        try:
            if not TELEGRAM_CHAT_ID:
                await asyncio.sleep(30)
                continue

            logger.info("🔄 Начало проверки новых серий...")
            state = load_state()
            
            # Получаем список "Смотрю"
            watchlist = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
            
            for item in watchlist:
                try:
                    url = item.get("url")
                    title = item.get("title")
                    item_id = str(item.get("id"))
                    
                    if not url or not item_id: continue

                    if item_id not in state:
                        state[item_id] = {"title": title, "url": url, "progress": {}, "prefs": {}}
                    
                    # Обновляем
                    state[item_id]["url"] = url
                    state[item_id]["title"] = title
                    
                    prefs = state[item_id].get("prefs", {})
                    
                    # Если пользователь ничего не выбрал - пропускаем (не спамим)
                    if not prefs:
                        continue
                    
                    # Итерируемся по включенным озвучкам
                    for t_id, is_enabled in prefs.items():
                        if not is_enabled: continue
                        
                        await asyncio.sleep(1.0)
                        
                        # Загружаем серии конкретной озвучки
                        seasons_data = await asyncio.to_thread(client.get_episodes_for_translator, item_id, t_id)
                        
                        max_s = -1
                        max_e = -1
                        
                        for s_num, eps in seasons_data.items():
                            if not eps: continue
                            try: s_int = int(s_num)
                            except: continue
                            
                            last_ep_obj = eps[-1]
                            try: e_int = int(last_ep_obj["episode"])
                            except: continue
                            
                            if s_int > max_s:
                                max_s = s_int
                                max_e = e_int
                            elif s_int == max_s and e_int > max_e:
                                max_e = e_int
                        
                        if max_s == -1: continue
                        
                        last_tag = f"S{max_s}E{max_e}"
                        
                        # Проверяем прогресс
                        if "progress" not in state[item_id]: state[item_id]["progress"] = {}
                        current_progress = state[item_id]["progress"].get(t_id)
                        
                        if current_progress and current_progress != last_tag:
                            # Уведомление!
                            msg = (
                                f"🔥 <b>Новая серия!</b>\n"
                                f"🎬 <b>{title}</b>\n"
                                f"🎙 Озвучка ID: {t_id}\n"
                                f"Сезон {max_s}, Серия {max_e}\n"
                                f"<a href='{url}'>Смотреть</a>"
                            )
                            
                            kb = InlineKeyboardMarkup(inline_keyboard=[
                                [InlineKeyboardButton(text="⚙️ Озвучки", callback_data=f"sett_{item_id}")]
                            ])
                            
                            try:
                                await bot.send_message(TELEGRAM_CHAT_ID, msg, parse_mode="HTML", reply_markup=kb)
                                logger.info(f"🔔 Notify: {title} {last_tag}")
                            except Exception as e:
                                logger.error(f"Send error: {e}")
                        
                        # Сохраняем (даже если первый раз, чтобы не спамить старыми сериями)
                        state[item_id]["progress"][t_id] = last_tag

                except Exception as ex:
                    logger.error(f"Error checking item {item.get('title')}: {ex}")
                    continue

            save_state(state)
            logger.info("✅ Проверка завершена.")
            await asyncio.sleep(900)

        except Exception as e:
            logger.error(f"Global Loop Error: {e}")
            await asyncio.sleep(60)