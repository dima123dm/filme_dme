(function () {
    'use strict';

    // ВАШ API
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96'; // Публичный ключ TMDB

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
                    console.error('[Rezka] Ошибка загрузки:', err);
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

        // ========================================
        // TMDB API: Поиск напрямую
        // ========================================
        function searchTMDB(title, year, mediaType, callback) {
            var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                      '?api_key=' + TMDB_API_KEY + 
                      '&language=ru-RU&query=' + encodeURIComponent(title);
            
            if (year) {
                url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            console.log('[Rezka] 🔍 Поиск в TMDB:', title, year);
            
            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'json',
                success: function(data) {
                    console.log('[Rezka] ✅ Результаты TMDB:', data.results.length);
                    callback(data.results || []);
                },
                error: function(err) {
                    console.error('[Rezka] ❌ Ошибка TMDB:', err);
                    callback([]);
                }
            });
        }

        // ========================================
        // Показываем список для выбора
        // ========================================
        function showSelectionModal(results, mediaType, onSelect) {
            Lampa.Modal.open({
                title: 'Выберите правильный вариант',
                html: $('<div class="tmdb-select-list"></div>'),
                onBack: function() {
                    Lampa.Modal.close();
                    Lampa.Controller.toggle('content');
                },
                onSelect: function() {}
            });

            var list = $('.tmdb-select-list');
            list.empty();

            if (!results.length) {
                list.append('<div style="padding:20px;text-align:center;color:#999">Ничего не найдено</div>');
                return;
            }

            results.forEach(function(item, index) {
                var title = item.title || item.name;
                var year = (item.release_date || item.first_air_date || '').substring(0, 4);
                var poster = item.poster_path 
                    ? 'https://image.tmdb.org/t/p/w200' + item.poster_path 
                    : '';
                var overview = item.overview || 'Нет описания';
                
                var card = $('<div class="tmdb-select-item selector"></div>');
                card.css({
                    display: 'flex',
                    padding: '10px',
                    marginBottom: '10px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    alignItems: 'center'
                });

                var posterEl = $('<img>').attr('src', poster).css({
                    width: '60px',
                    height: '90px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    marginRight: '15px'
                });

                var infoEl = $('<div></div>').css({ flex: 1 });
                infoEl.append('<div style="font-weight:bold;margin-bottom:5px">' + title + ' (' + year + ')</div>');
                infoEl.append('<div style="font-size:12px;color:#999;line-height:1.4">' + 
                    (overview.length > 150 ? overview.substring(0, 150) + '...' : overview) + 
                '</div>');

                card.append(posterEl);
                card.append(infoEl);

                card.on('hover:enter', function() {
                    onSelect(item);
                    Lampa.Modal.close();
                });

                list.append(card);

                // Первый элемент активен
                if (index === 0) {
                    Lampa.Controller.collectionSet(list);
                    Lampa.Controller.collectionFocus(card[0], list);
                }
            });
        }

        // ========================================
        // Открываем карточку в Лампе
        // ========================================
        function openLampaCard(tmdbId, mediaType) {
            console.log('[Rezka] 🎬 Открываем карточку:', tmdbId, mediaType);
            
            Lampa.Activity.push({
                url: 'http://lampa.mx/?card=' + tmdbId + '&media=' + mediaType + '&source=tmdb',
                component: 'full',
                id: tmdbId,
                method: mediaType,
                source: 'tmdb',
                card: {
                    id: tmdbId,
                    source: 'tmdb'
                }
            });
        }

        // ========================================
        // Рендерим список карточек
        // ========================================
        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                // Очистка названия
                var rawTitle = item.title || '';
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                
                var titleSimple = rawTitle.split('/')[0].trim();
                var titleNoYear = titleSimple.replace(/\(\d{4}\)/g, '').trim();
                var titleClean = titleNoYear.split(':')[0].trim();

                // Определяем тип
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // Картинка через прокси
                var posterUrl = item.poster 
                    ? MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) + '&t=' + Date.now()
                    : '';

                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: titleClean,
                    original_title: rawTitle,
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '140px', 
                    cursor: 'pointer',
                    marginBottom: '20px'
                });

                // ========================================
                // КЛИК НА КАРТОЧКУ
                // ========================================
                function handleClick() {
                    console.log('[Rezka] 🎯 Клик на:', titleClean);
                    Lampa.Loading.start(function() {});

                    // Ищем в TMDB
                    searchTMDB(titleClean, year, mediaType, function(results) {
                        Lampa.Loading.stop();

                        if (!results.length) {
                            // Ничего не найдено
                            Lampa.Noty.show('Ничего не найдено в TMDB');
                            return;
                        }

                        // Проверяем точное совпадение по году
                        var exactMatch = null;
                        if (year) {
                            exactMatch = results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                                return rYear === year;
                            });
                        }

                        if (exactMatch) {
                            // Нашли точное совпадение → сразу открываем
                            console.log('[Rezka] ✅ Точное совпадение:', exactMatch.id);
                            openLampaCard(exactMatch.id, mediaType);
                        } else if (results.length === 1) {
                            // Один результат → открываем
                            console.log('[Rezka] ✅ Один результат:', results[0].id);
                            openLampaCard(results[0].id, mediaType);
                        } else {
                            // Несколько результатов → показываем выбор
                            console.log('[Rezka] 📋 Показываем список');
                            showSelectionModal(results, mediaType, function(selected) {
                                openLampaCard(selected.id, mediaType);
                            });
                        }
                    });
                }

                card.on('hover:enter', handleClick);
                card.on('click', handleClick);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // ========================================
    // Регистрация плагина
    // ========================================
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            console.log('[Rezka] ✅ Плагин загружен');
            
            // Добавляем пункт меню
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            
            // Обработчик клика
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ 
                    component: 'my_rezka', 
                    page: 1 
                });
            });
            
            // Регистрируем компонент
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            
            console.log('[Rezka] 📌 Меню добавлено');
        }
    });
})();
