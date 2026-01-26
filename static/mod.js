(function () {
    'use strict';

    // ВАШ API
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

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
            var modal = Lampa.Modal.open({
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

                // ✅ ИСПРАВЛЕНО: Закрываем модалку ПЕРЕД открытием карточки
                card.on('hover:enter', function() {
                    console.log('[Rezka] 📌 Выбрано:', title, item.id);
                    Lampa.Modal.close(); // ← СНАЧАЛА ЗАКРЫВАЕМ
                    setTimeout(function() {
                        onSelect(item); // ← ПОТОМ ОТКРЫВАЕМ
                    }, 100);
                });

                list.append(card);

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
                console.log('[Rezka] 🎨 Рендер карточки:', item.title);
                console.log('[Rezka] 📸 Оригинальная картинка:', item.poster);
                
                // ✅ РАСШИРЕННАЯ ОЧИСТКА НАЗВАНИЯ (как в боте)
                var rawTitle = item.title || '';
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                
                // Убираем год
                var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
                // Берем только русское название (до слеша)
                var titleRu = titleNoYear.split('/')[0].trim();
                // Убираем все до двоеточия для сериалов типа "911: Одинокая звезда"
                var titleClean = titleRu.split(':')[0].trim();

                console.log('[Rezka] 📝 Обработка названия:');
                console.log('   Исходное:', rawTitle);
                console.log('   Без года:', titleNoYear);
                console.log('   Русское:', titleRu);
                console.log('   Чистое:', titleClean);

                // Определяем тип
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // ✅ ДЕТАЛЬНЫЙ ДЕБАГ КАРТИНОК
                var posterUrl = '';
                if (item.poster) {
                    posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    console.log('[Rezka] 🖼️ Картинка #1 - Исходный URL:', item.poster);
                    console.log('[Rezka] 🖼️ Картинка #2 - Проксированный URL:', posterUrl);
                    console.log('[Rezka] 🖼️ Картинка #3 - Полный путь:', posterUrl);
                } else {
                    console.warn('[Rezka] ⚠️ Нет URL постера для:', item.title);
                }

                // ✅ КАРТОЧКА С ДОПОЛНИТЕЛЬНОЙ ИНФОРМАЦИЕЙ
                var cardData = {
                    title: titleClean,
                    original_title: rawTitle,
                    release_year: year,
                    img: posterUrl
                };

                // Добавляем статус серии (если есть)
                if (item.status) {
                    cardData.number_of_seasons = item.status; // "1 сезон, 9 серия"
                }

                console.log('[Rezka] 🎴 Данные карточки:', cardData);

                var card = Lampa.Template.get('card', cardData);

                card.addClass('card--collection');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '140px', 
                    cursor: 'pointer',
                    marginBottom: '20px'
                });

                // ✅ ДОБАВЛЯЕМ СТАТУС ПОД НАЗВАНИЕМ (как в боте)
                if (item.status) {
                    var statusDiv = $('<div class="card__episode"></div>').text(item.status);
                    statusDiv.css({
                        position: 'absolute',
                        bottom: '30px',
                        left: '10px',
                        right: '10px',
                        padding: '5px',
                        background: 'rgba(0,0,0,0.8)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        textAlign: 'center',
                        color: '#fff'
                    });
                    card.find('.card__view').append(statusDiv);
                }

                // ✅ ПРОВЕРКА ЗАГРУЗКИ КАРТИНКИ
                var imgElement = card.find('img.card__img');
                if (imgElement.length) {
                    console.log('[Rezka] 🖼️ Картинка #4 - IMG элемент найден');
                    console.log('[Rezka] 🖼️ Картинка #5 - SRC установлен:', imgElement.attr('src'));
                    
                    imgElement.on('load', function() {
                        console.log('[Rezka] ✅ Картинка загружена успешно:', titleClean);
                    });
                    
                    imgElement.on('error', function() {
                        console.error('[Rezka] ❌ Ошибка загрузки картинки:', titleClean);
                        console.error('[Rezka] ❌ URL:', posterUrl);
                        console.error('[Rezka] ❌ Оригинал:', item.poster);
                    });
                } else {
                    console.warn('[Rezka] ⚠️ IMG элемент не найден в карточке');
                }

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
                            console.log('[Rezka] ✅ Точное совпадение:', exactMatch.id);
                            openLampaCard(exactMatch.id, mediaType);
                        } else if (results.length === 1) {
                            console.log('[Rezka] ✅ Один результат:', results[0].id);
                            openLampaCard(results[0].id, mediaType);
                        } else {
                            console.log('[Rezka] 📋 Показываем список из', results.length, 'вариантов');
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
            
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ 
                    component: 'my_rezka', 
                    page: 1 
                });
            });
            
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            
            console.log('[Rezka] 📌 Меню добавлено');
        }
    });
})();
