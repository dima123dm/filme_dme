(function () {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div class="items items--lines"></div>');
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
        function searchTMDB(searchTitle, year, mediaType, callback) {
            var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                      '?api_key=' + TMDB_API_KEY + 
                      '&language=ru-RU&query=' + encodeURIComponent(searchTitle);
            
            if (year) {
                url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            console.log('[Rezka] 🔍 Поиск:', searchTitle, 'год:', year);
            
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
        // Проверка схожести названий
        // ========================================
        function isTitleSimilar(title1, title2) {
            var t1 = title1.toLowerCase().trim();
            var t2 = title2.toLowerCase().trim();
            
            // Убираем спецсимволы
            t1 = t1.replace(/[:\-—–]/g, ' ').replace(/\s+/g, ' ').trim();
            t2 = t2.replace(/[:\-—–]/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Точное совпадение
            if (t1 === t2) return true;
            
            // Одно название содержит другое
            if (t1.indexOf(t2) !== -1 || t2.indexOf(t1) !== -1) return true;
            
            // Проверяем первые слова (для "Doctor Who" vs "Doctor Cha")
            var words1 = t1.split(' ');
            var words2 = t2.split(' ');
            
            // Если оба названия из 2+ слов, проверяем оба слова
            if (words1.length >= 2 && words2.length >= 2) {
                return words1[0] === words2[0] && words1[1] === words2[1];
            }
            
            return false;
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
                var overview = (item.overview || 'Нет описания').substring(0, 150);
                
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
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '20px',
                padding: '20px',
                width: '100%'
            });

            items.forEach(function (item) {
                var rawTitle = item.title || '';
                
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                
                var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
                
                var parts = titleNoYear.split('/');
                var titleRu = parts[0].trim();
                var titleEn = parts[1] ? parts[1].trim() : '';
                
                var titleForSearch = titleEn || titleRu.split(':')[0].trim();

                console.log('[Rezka] 📝', titleRu);
                console.log('[Rezka] 🔍', titleForSearch, year);

                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                var posterUrl = '';
                if (item.poster) {
                    posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                }

                var card = $('<div class="rezka-card selector"></div>');
                card.css({
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    backgroundColor: '#1a1a1a'
                });

                card.hover(
                    function() { 
                        $(this).css({
                            'transform': 'scale(1.05)',
                            'box-shadow': '0 8px 20px rgba(0,0,0,0.5)'
                        }); 
                    },
                    function() { 
                        $(this).css({
                            'transform': 'scale(1)',
                            'box-shadow': 'none'
                        }); 
                    }
                );

                var posterDiv = $('<div class="rezka-poster"></div>');
                posterDiv.css({
                    width: '100%',
                    paddingBottom: '150%',
                    position: 'relative',
                    backgroundImage: posterUrl ? 'url(' + posterUrl + ')' : 'none',
                    backgroundColor: '#2a2a2a',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                });

                if (item.status) {
                    var statusBadge = $('<div class="rezka-status"></div>');
                    statusBadge.text(item.status);
                    statusBadge.css({
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        right: '0',
                        padding: '5px 8px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.7))',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        zIndex: '2'
                    });
                    posterDiv.append(statusBadge);
                }

                card.append(posterDiv);

                var titleDiv = $('<div class="rezka-title"></div>');
                titleDiv.text(titleRu);
                titleDiv.css({
                    padding: '10px 8px',
                    fontSize: '13px',
                    lineHeight: '1.3',
                    color: '#fff',
                    textAlign: 'center',
                    minHeight: '50px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                });

                card.append(titleDiv);

                // ========================================
                // КЛИК (обычный и долгий)
                // ========================================
                var longPressTimer = null;
                var isLongPress = false;

                // ✅ ДОЛГОЕ НАЖАТИЕ (удерживание)
                card.on('hover:focus', function() {
                    isLongPress = false;
                    longPressTimer = setTimeout(function() {
                        isLongPress = true;
                        console.log('[Rezka] 🔒 Долгое нажатие - принудительный выбор');
                        Lampa.Noty.show('Выбор из списка');
                    }, 800); // 800ms удерживания
                });

                card.on('hover:blur', function() {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });

                // ✅ ОБЫЧНЫЙ КЛИК
                function handleClick(e) {
                    if (e) e.preventDefault();
                    
                    // Очищаем таймер
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    
                    if (isModalOpen) {
                        console.log('[Rezka] ⚠️ Модалка уже открыта');
                        return;
                    }
                    
                    var forceSelect = isLongPress;
                    isLongPress = false;
                    
                    console.log('[Rezka] 🎯 Клик:', titleRu, forceSelect ? '(принудительный выбор)' : '');
                    Lampa.Loading.start(function() {});

                    searchTMDB(titleForSearch, year, mediaType, function(results) {
                        Lampa.Loading.stop();

                        if (!results.length) {
                            Lampa.Noty.show('Ничего не найдено в TMDB');
                            return;
                        }

                        // ✅ Если долгое нажатие - сразу показываем список
                        if (forceSelect) {
                            console.log('[Rezka] 📋 Принудительный выбор из списка');
                            showSelectionModal(results, mediaType, function(selected) {
                                openLampaCard(selected.id, mediaType);
                            });
                            return;
                        }

                        // ✅ Ищем точное совпадение по году И названию
                        var exactMatch = null;
                        if (year) {
                            exactMatch = results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                                var rTitle = r.title || r.name;
                                
                                // Год совпадает И название похоже
                                return rYear === year && isTitleSimilar(titleForSearch, rTitle);
                            });
                        }

                        if (exactMatch) {
                            console.log('[Rezka] ✅ Точное совпадение:', exactMatch.title || exactMatch.name);
                            openLampaCard(exactMatch.id, mediaType);
                        } else if (results.length === 1) {
                            console.log('[Rezka] ✅ Один результат:', results[0].id);
                            openLampaCard(results[0].id, mediaType);
                        } else {
                            console.log('[Rezka] 📋 Несколько вариантов');
                            showSelectionModal(results, mediaType, function(selected) {
                                openLampaCard(selected.id, mediaType);
                            });
                        }
                    });
                }

                card.on('hover:enter', handleClick);
                card.on('click', handleClick);

                grid.append(card);
            });

            comp.html.append(grid);
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
