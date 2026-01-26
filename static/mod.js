(function () {
    'use strict';

    // ВАШ API (проверьте IP и порт)
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка списка...</div>');
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
                    loader.text('Ошибка связи с сервером');
                    console.error('Rezka Error:', err);
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
                // --- 1. ПАРСИМ НАЗВАНИЯ ---
                let fullTitle = item.title || '';
                let year = '';
                
                // Выдергиваем год из скобок (2023)
                const yearMatch = fullTitle.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    fullTitle = fullTitle.replace(` (${year})`, '');
                }

                // Разбиваем "Название RU / Название EN"
                let parts = fullTitle.split(' / ');
                let titleRu = parts[0].trim();
                // Если есть английское название, берем его, иначе русское
                let titleEn = parts[1] ? parts[1].trim() : titleRu;

                // Убираем лишний мусор из английского названия (на всякий случай)
                titleEn = titleEn.split(':')[0].trim();

                // --- 2. ОПРЕДЕЛЯЕМ ТИП ---
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // --- 3. КАРТИНКИ (HTTP -> HTTPS) ---
                let posterUrl = 'https://via.placeholder.com/300x450?text=' + encodeURIComponent(titleEn);
                if (item.poster && item.poster.startsWith('http')) {
                    // Проксируем через ваш сервер, а потом через weserv для SSL
                    let myProxyUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    posterUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(myProxyUrl);
                }

                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: titleRu,
                    original_title: titleEn, // Показываем англ название как оригинал
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- 4. УМНЫЙ ПОИСК И ОТКРЫТИЕ ---
                function findAndOpen() {
                    Lampa.Loading.start(function() { Lampa.Loading.stop(); });

                    // Используем АНГЛИЙСКОЕ название для поиска, как вы просили
                    var query = titleEn; 
                    var searchMethod = 'search/' + mediaType; // search/movie или search/tv
                    var params = {
                        query: query,
                        page: 1,
                        language: 'ru-RU' // Ищем английское название, но описание просим на русском
                    };

                    // Функция успеха
                    var onSuccess = function(data) {
                        Lampa.Loading.stop();
                        if (data.results && data.results.length > 0) {
                            // Ищем точное совпадение по году
                            var bestMatch = data.results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                return rYear == year;
                            });

                            // Если по году не нашли, берем первый результат
                            var result = bestMatch || data.results[0];

                            // ОТКРЫВАЕМ СРАЗУ КАРТОЧКУ
                            Lampa.Activity.push({
                                component: 'full',
                                id: result.id,
                                method: mediaType,
                                card: result,
                                source: 'tmdb'
                            });
                        } else {
                            // Ничего не нашли -> открываем обычный поиск
                            Lampa.Noty.show('Не найдено в TMDB, открываю поиск');
                            Lampa.Activity.push({ component: 'search', search: query });
                        }
                    };

                    // Функция ошибки
                    var onError = function(err) {
                        Lampa.Loading.stop();
                        console.log('API Error fallback', err);
                        Lampa.Activity.push({ component: 'search', search: query });
                    };

                    // --- ХАК ДЛЯ РАЗНЫХ ВЕРСИЙ ЛАМПЫ ---
                    // Пробуем разные способы вызова API, так как Lampa.TMDB.get у вас нет
                    if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.get === 'function') {
                        // Стандартный способ
                        Lampa.TMDB.get(searchMethod, params, onSuccess, onError);
                    } else if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.api === 'function') {
                        // Старый способ
                        Lampa.TMDB.api(searchMethod, params, onSuccess, onError);
                    } else if (typeof Lampa.Api !== 'undefined' && typeof Lampa.Api.tmdb === 'function') {
                        // Через Api
                        Lampa.Api.tmdb(searchMethod, params, onSuccess, onError);
                    } else {
                        // Если совсем ничего нет, открываем просто поиск
                        console.warn('Ни один метод TMDB API не найден');
                        Lampa.Activity.push({ component: 'search', search: query });
                    }
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