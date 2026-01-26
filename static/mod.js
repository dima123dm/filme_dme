(function () {
    'use strict';

    // ВНИМАНИЕ: Если сервер без SSL, используйте http. 
    // Если Лампа открыта через https, картинки с http могут блокироваться браузером.
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080'; 
    // Обратите внимание: я добавил порт :8080 и протокол http, так как uvicorn обычно там

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            comp.html.append(loader);

            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                success: function(items) {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(err) {
                    loader.text('Ошибка сети. Проверьте http/https. Ошибка: ' + (err.statusText || 'n/a'));
                    console.error('[Rezka Plugin] Error loading:', err);
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
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                let title = item.title || '';
                let year = '';
                
                // Извлекаем год
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();
                
                // Определяем тип (tv или movie)
                // Rezka обычно имеет /series/ или /cartoons/ в URL для сериалов
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // Картинка через прокси
                let imgUrl = '';
                if (item.poster && item.poster.startsWith('http')) {
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                } else {
                    imgUrl = 'https://via.placeholder.com/300x450/333/fff?text=' + encodeURIComponent(cleanTitle);
                }

                var card = Lampa.Template.get('card', {
                    title: title,
                    original_title: cleanTitle,
                    release_year: item.status || year || '',
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- ЛОГИКА ОТКРЫТИЯ ---
                function openItem() {
                    // Показываем лоадер
                    Lampa.Loading.start(function() { Lampa.Loading.stop(); });

                    // Функция для открытия полной карточки
                    function openFull(cardData) {
                        Lampa.Loading.stop();
                        Lampa.Activity.push({
                            component: 'full',
                            id: cardData.id,
                            method: mediaType, // tv или movie
                            card: cardData,
                            source: 'tmdb'
                        });
                    }

                    // Функция для открытия поиска (если не нашли ID)
                    function openSearch() {
                        Lampa.Loading.stop();
                        Lampa.Activity.push({
                            component: 'search',
                            search: cleanTitle,
                            search_one: cleanTitle,
                            search_two: year,
                            clarification: true
                        });
                    }

                    // Используем Lampa.TMDB.get (самый надежный способ)
                    if (typeof Lampa.TMDB !== 'undefined' && Lampa.TMDB.get) {
                        Lampa.TMDB.get('search/' + mediaType, {
                            query: cleanTitle,
                            language: 'ru-RU',
                            page: 1
                        }, function(data) {
                            if (data.results && data.results.length) {
                                // Ищем совпадение по году (+- 1 год)
                                var hit = data.results.find(function(r) {
                                    var rDate = r.release_date || r.first_air_date || '0000';
                                    var rYear = parseInt(rDate.substring(0, 4));
                                    var targetYear = parseInt(year);
                                    
                                    if (isNaN(targetYear)) return true; // Если года нет, берем первый
                                    return Math.abs(rYear - targetYear) <= 1;
                                });

                                // Если точного совпадения по году нет, берем первый результат
                                if (!hit) hit = data.results[0];
                                
                                openFull(hit);
                            } else {
                                console.log('[Rezka] TMDB returned no results');
                                openSearch();
                            }
                        }, function(err) {
                            console.error('[Rezka] TMDB Search Error:', err);
                            openSearch();
                        });
                    } else {
                        // Если TMDB API недоступен в этой версии Лампы
                        console.warn('[Rezka] Lampa.TMDB not found');
                        openSearch();
                    }
                }

                card.on('hover:enter', openItem);
                card.on('click', openItem);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', page: 1 });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();