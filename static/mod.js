(function () {
    'use strict';

    // === НАСТРОЙКИ ОТЛАДКИ ===
    var DEBUG_MODE = true; // Включает уведомления на экране
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    // =========================

    function log(msg, type) {
        console.log('[Rezka Debug] ' + msg);
        if (DEBUG_MODE) {
            // type: undefined = info (white), 'error' = red
            Lampa.Noty.show(msg, {time: 3000, type: type});
        }
    }

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка списка...</div>');
            comp.html.append(loader);

            log('Запрос к API: ' + MY_API_URL);

            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                timeout: 10000, // 10 секунд таймаут
                success: function(items) {
                    loader.remove();
                    if (items && items.length) {
                        log('Загружено элементов: ' + items.length);
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(xhr, status, error) {
                    loader.remove();
                    var errMsg = 'Ошибка API: ' + status + ' ' + error;
                    comp.html.append('<div class="empty__descr" style="color:red">' + errMsg + '</div>');
                    log(errMsg, 'error');
                    console.error('Full Error:', xhr);
                }
            });
            return comp.html;
        };

        comp.start = function () {
            Lampa.Controller.toggle('content');
        };

        comp.pause = function () {};
        comp.destroy = function () {
            comp.html.remove();
        };

        comp.render = function () {
            return comp.html;
        };

        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю (Debug)</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                // 1. Парсинг
                let fullTitle = item.title || 'Без названия';
                let year = '';
                const yearMatch = fullTitle.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    fullTitle = fullTitle.replace(` (${year})`, '');
                }
                
                let parts = fullTitle.split(' / ');
                let titleRu = parts[0].trim();
                let titleEn = parts[1] ? parts[1].trim() : titleRu;
                titleEn = titleEn.split(':')[0].trim(); // Убираем лишнее

                // 2. Тип
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // 3. Картинка
                let posterUrl = 'https://via.placeholder.com/300x450?text=' + encodeURIComponent(titleEn);
                
                if (item.poster && item.poster.startsWith('http')) {
                    // Формируем прокси-ссылку
                    let myProxy = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    // Оборачиваем в weserv для HTTPS
                    posterUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(myProxy) + '&w=300&h=450&fit=cover';
                }

                var card = Lampa.Template.get('card', {
                    title: titleEn,
                    original_title: titleRu,
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- ЛОГИКА ОТКРЫТИЯ С ДЕБАГОМ ---
                function findAndOpen() {
                    log('Нажат: ' + titleEn);
                    
                    // Защита от вечной загрузки
                    var loadTimer = setTimeout(function() {
                        Lampa.Loading.stop();
                        log('Таймаут поиска! Отмена.', 'error');
                    }, 8000);

                    Lampa.Loading.start(function() { 
                        Lampa.Loading.stop();
                        clearTimeout(loadTimer);
                    });

                    // Проверка наличия TMDB API
                    if (typeof Lampa.TMDB === 'undefined') {
                        clearTimeout(loadTimer);
                        Lampa.Loading.stop();
                        log('ОШИБКА: Lampa.TMDB не найден!', 'error');
                        return;
                    }

                    var query = titleEn;
                    var searchParams = {
                        query: query,
                        page: 1,
                        language: 'ru-RU'
                    };

                    log('Ищу в TMDB (' + mediaType + ')...');

                    // Универсальная функция запроса
                    var apiMethod = Lampa.TMDB.get || Lampa.TMDB.api || Lampa.Api.tmdb;

                    apiMethod('search/' + mediaType, searchParams, function(data) {
                        clearTimeout(loadTimer);
                        Lampa.Loading.stop();

                        if (data.results && data.results.length > 0) {
                            // Ищем точное совпадение по году
                            var bestMatch = data.results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                return rYear == year;
                            });
                            
                            var result = bestMatch || data.results[0];
                            
                            log('Найден ID: ' + result.id);

                            // !!! ВАЖНО: Добавляем source: 'tmdb' везде
                            result.source = 'tmdb';

                            var activity = {
                                component: 'full',
                                id: result.id,
                                method: mediaType,
                                source: 'tmdb',
                                card: result
                            };

                            try {
                                Lampa.Activity.push(activity);
                            } catch (e) {
                                log('Ошибка открытия: ' + e.message, 'error');
                            }

                        } else {
                            log('TMDB ничего не нашел.', 'error');
                            // Открываем обычный поиск как запасной вариант
                            Lampa.Activity.push({ component: 'search', search: query });
                        }
                    }, function(err) {
                        clearTimeout(loadTimer);
                        Lampa.Loading.stop();
                        log('Ошибка запроса TMDB!', 'error');
                        console.error('TMDB Error:', err);
                    });
                }

                card.on('hover:enter', findAndOpen);
                card.on('click', findAndOpen);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // Регистрация
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 20H14V4H10V20ZM4 20H8V12H4V20ZM16 9V20H20V9H16Z"/></svg></div>' +
                    '<div class="menu__text">Rezka Debug</div></li>'
                );
            }
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', page: 1 });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            
            log('Плагин загружен (v Debug)', 'info');
        }
    });
})();