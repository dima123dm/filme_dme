(function () {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div class="items items--vertical"></div>');
        var isModalOpen = false;

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
            isModalOpen = false;
            comp.html.remove();
        };
        comp.render = function () {
            return comp.html;
        };

        // ========================================
        // TMDB API
        // ========================================
        function searchTMDB(title, year, mediaType, callback) {
            var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                      '?api_key=' + TMDB_API_KEY + 
                      '&language=ru-RU&query=' + encodeURIComponent(title);
            
            if (year) {
                url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            console.log('[Rezka] 🔍 Поиск:', title, year);
            
            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'json',
                success: function(data) {
                    console.log('[Rezka] ✅ Найдено:', data.results.length);
                    callback(data.results || []);
                },
                error: function(err) {
                    console.error('[Rezka] ❌ Ошибка TMDB:', err);
                    callback([]);
                }
            });
        }

        // ========================================
        // Модалка выбора
        // ========================================
        function showSelectionModal(results, mediaType, onSelect) {
            if (isModalOpen) {
                console.log('[Rezka] ⚠️ Модалка уже открыта');
                return;
            }
            
            isModalOpen = true;
            console.log('[Rezka] 📋 Открываем модалку');

            var items = [];
            results.forEach(function(item) {
                var title = item.title || item.name;
                var year = (item.release_date || item.first_air_date || '').substring(0, 4);
                var poster = item.poster_path 
                    ? 'https://image.tmdb.org/t/p/w200' + item.poster_path 
                    : '';
                var overview = (item.overview || 'Нет описания').substring(0, 120);
                
                items.push({
                    title: title + ' (' + year + ')',
                    description: overview,
                    image: poster,
                    tmdb_id: item.id,
                    tmdb_data: item
                });
            });

            Lampa.Select.show({
                title: 'Выберите правильный вариант',
                items: items,
                onSelect: function(selectedItem) {
                    console.log('[Rezka] ✅ Выбрано:', selectedItem.title);
                    isModalOpen = false;
                    onSelect(selectedItem.tmdb_data);
                },
                onBack: function() {
                    console.log('[Rezka] 🔙 Назад');
                    isModalOpen = false;
                }
            });
        }

        // ========================================
        // Открытие карточки
        // ========================================
        function openLampaCard(tmdbId, mediaType) {
            console.log('[Rezka] 🎬 Открываем:', tmdbId, mediaType);
            
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
        // Рендер карточек
        // ========================================
        comp.renderItems = function (items) {
            var body = $('<div class="items-line"></div>');

            items.forEach(function (item) {
                var rawTitle = item.title || '';
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                
                var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
                var titleRu = titleNoYear.split('/')[0].trim();
                var titleClean = titleRu.split(':')[0].trim();

                console.log('[Rezka] 📝', rawTitle, '→', titleClean);

                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                var posterUrl = '';
                if (item.poster) {
                    posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                }

                // Используем стандартный шаблон Lampa
                var cardData = {
                    title: titleClean,
                    original_title: rawTitle,
                    release_year: year,
                    img: posterUrl
                };

                var card = Lampa.Template.get('card', cardData);
                card.addClass('card--collection');

                // Добавляем статус
                if (item.status) {
                    var statusBadge = $('<div class="card__quality"></div>')
                        .text(item.status)
                        .css({
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            right: '0',
                            padding: '4px',
                            background: 'rgba(0,0,0,0.8)',
                            fontSize: '11px',
                            textAlign: 'center',
                            borderRadius: '0 0 8px 8px'
                        });
                    card.find('.card__view').append(statusBadge);
                }

                // Обработчик клика
                function handleClick(e) {
                    if (e) e.preventDefault();
                    if (isModalOpen) return; // Блокируем повторные клики
                    
                    console.log('[Rezka] 🎯 Клик:', titleClean);
                    Lampa.Loading.start(function() {});

                    searchTMDB(titleClean, year, mediaType, function(results) {
                        Lampa.Loading.stop();

                        if (!results.length) {
                            Lampa.Noty.show('Ничего не найдено в TMDB');
                            return;
                        }

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

            comp.html.append(body);
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
            
            console.log('[Rezka] 📌 Готово');
        }
    });
})();
