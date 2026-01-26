# ... (начало файла bot.py такое же) ...

# --- ФОНОВАЯ ЗАДАЧА ---
async def check_updates_task():
    """Периодически проверяет выход новых серий."""
    if not bot:
        return

    logger.info("⏳ Фоновая проверка обновлений запущена...")
    try:
        await asyncio.sleep(5)  # Ждем старта

        while True:
            # --- ВАЖНО: ПРОВЕРКА ОТМЕНЫ ---
            # Это позволяет прервать цикл при Ctrl+C
            await asyncio.sleep(0.1) 
            
            try:
                if not TELEGRAM_CHAT_ID:
                    await asyncio.sleep(30)
                    continue

                if not CAT_WATCHING:
                    logger.warning("⚠️ Не задан REZKA_CAT_WATCHING")
                    await asyncio.sleep(60)
                    continue

                logger.info("🔄 Проверка новых серий...")
                state = load_state()
                
                watchlist = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
                
                for item in watchlist:
                    # Даем шанс прерваться внутри цикла проверки
                    await asyncio.sleep(0.1) 
                    
                    try:
                        url = item.get("url")
                        title = item.get("title")
                        item_id = item.get("id")
                        
                        if not url or not item_id: continue

                        details = await asyncio.to_thread(client.get_series_details, url)
                        if not details or "seasons" not in details:
                            continue

                        seasons = details["seasons"]
                        max_season = -1
                        max_episode = -1
                        
                        for s_id, eps in seasons.items():
                            if not eps: continue
                            try:
                                s_num = int(s_id)
                            except: s_num = 0
                            
                            if eps:
                                last_ep = eps[-1]
                                try:
                                    e_num = int(last_ep["episode"])
                                except: e_num = 0
                                
                                if s_num > max_season:
                                    max_season = s_num
                                    max_episode = e_num
                                elif s_num == max_season and e_num > max_episode:
                                    max_episode = e_num

                        if max_season == -1: continue

                        current_tag = f"S{max_season}E{max_episode}"
                        prev_tag = state.get(str(item_id))
                        
                        if not prev_tag:
                            state[str(item_id)] = current_tag
                        elif prev_tag != current_tag:
                            msg = (
                                f"🔥 <b>Вышла новая серия!</b>\n\n"
                                f"🎬 <b>{title}</b>\n"
                                f"Сезон {max_season}, Серия {max_episode}\n\n"
                                f"<a href='{url}'>Смотреть на сайте</a>"
                            )
                            try:
                                await bot.send_message(TELEGRAM_CHAT_ID, msg, parse_mode="HTML")
                                logger.info(f"🔔 Уведомление: {title} {current_tag}")
                                state[str(item_id)] = current_tag
                            except Exception as e:
                                logger.error(f"Ошибка отправки: {e}")

                    except asyncio.CancelledError:
                        raise  # Пробрасываем выход наверх
                    except Exception as e:
                        logger.error(f"Ошибка проверки {item.get('title')}: {e}")
                        continue
                    
                    await asyncio.sleep(2)

                save_state(state)
                # logger.info("✅ Проверка завершена.")

            except asyncio.CancelledError:
                raise # Пробрасываем выход
            except Exception as e:
                logger.error(f"Глобальная ошибка проверки: {e}")

            # Проверка раз в 20 минут
            await asyncio.sleep(1200)

    except asyncio.CancelledError:
        logger.info("🛑 Фоновая задача проверки остановлена.")