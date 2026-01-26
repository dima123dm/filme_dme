(function () {
    'use strict';

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
                // 1. Подготовка названий
                let fullTitle = item.title || '';
                let year = '';
                const yearMatch = fullTitle.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    fullTitle = fullTitle.replace(` (${year})`, '');
                }
                let parts = fullTitle.split(' / ');
                let titleRu = parts[0].trim();
                let titleEn = parts[1] ? parts[1].trim() : titleRu;
                titleEn = titleEn.split(':')[0].trim();

                // 2. Тип контента
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // 3. Картинка
                let posterUrl = 'https://via.placeholder.com/300x450?text=' + encodeURIComponent(titleEn);
                if (item.poster && item.poster.startsWith('http')) {
                    let myProxyUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    posterUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(myProxyUrl);
                }

                // Карточка в списке
                var card = Lampa.Template.get('card', {
                    title: titleEn,
                    original_title: titleRu,
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- ЛОГИКА ОТКРЫТИЯ ---
                function findAndOpen() {
                    Lampa.Loading.start(function() { Lampa.Loading.stop(); });
                    Lampa.Noty.show('Поиск: ' + titleEn);

                    var query = titleEn; 
                    var searchMethod = 'search/' + mediaType; 
                    
                    var onSuccess = function(data) {
                        // Сразу убираем лоадер, чтобы он не висел
                        Lampa.Loading.stop();

                        if (data.results && data.results.length > 0) {
                            // Ищем совпадение по году
                            var bestMatch = data.results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                return rYear == year;
                            });
                            var result = bestMatch || data.results[0];

                            // ВАЖНО: Формируем "чистый" объект для открытия
                            // Именно так работает ссылка ?card=...
                            var activityObject = {
                                component: 'full',
                                id: result.id,
                                method: mediaType,
                                source: 'tmdb', // Обязательно указываем источник
                                card: {
                                    id: result.id,
                                    title: result.title || result.name,
                                    original_title: result.original_title || result.original_name,
                                    release_date: result.release_date || result.first_air_date,
                                    poster_path: result.poster_path,
                                    overview: result.overview,
                                    vote_average: result.vote_average,
                                    source: 'tmdb' // И внутри карточки тоже
                                }
                            };

                            // Небольшая задержка чтобы интерфейс не залип
                            setTimeout(function() {
                                Lampa.Activity.push(activityObject);
                            }, 10);

                        } else {
                            Lampa.Noty.show('Не найдено в TMDB');
                            Lampa.Activity.push({ component: 'search', search: query });
                        }
                    };

                    var onError = function(err) {
                        Lampa.Loading.stop();
                        console.log('TMDB Error', err);
                        Lampa.Activity.push({ component: 'search', search: query });
                    };

                    // Вызов API
                    if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.get === 'function') {
                        Lampa.TMDB.get(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.api === 'function') {
                        Lampa.TMDB.api(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else if (typeof Lampa.Api !== 'undefined' && typeof Lampa.Api.tmdb === 'function') {
                        Lampa.Api.tmdb(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else {
                        Lampa.Loading.stop();
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