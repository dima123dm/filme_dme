(function () {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div class="rezka-container"></div>');
        var isModalOpen = false;
        var currentCategory = 'watching'; // watching, later, watched
        var currentItems = [];
        var currentLongPressItem = null;

        // ========================================
        // СТРУКТУРА: Табы + Контейнер карточек
        // ========================================
        comp.create = function () {
            // Создаем табы
            var tabsHtml = $('<div class="rezka-tabs"></div>');
            tabsHtml.css({
                display: 'flex',
                gap: '10px',
                padding: '20px 20px 10px 20px',
                borderBottom: '2px solid #333'
            });

            var tabs = [
                { id: 'watching', label: '▶ Смотрю', icon: '▶' },
                { id: 'later', label: '⏳ Позже', icon: '⏳' },
                { id: 'watched', label: '✅ Архив', icon: '✅' }
            ];

            tabs.forEach(function(tab) {
                var btn = $('<button class="rezka-tab selector"></button>');
                btn.attr('data-category', tab.id);
                btn.text(tab.label);
                btn.css({
                    flex: '1',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: tab.id === currentCategory ? '#e50914' : '#2a2a2a',
                    color: '#fff',
                    transition: 'all 0.3s'
                });

                btn.on('hover:enter click', function(e) {
                    if (e) e.preventDefault();
                    var category = $(this).attr('data-category');
                    comp.switchCategory(category);
                });

                tabsHtml.append(btn);
            });

            comp.html.append(tabsHtml);

            // Контейнер для контента
            var contentContainer = $('<div class="rezka-content"></div>');
            comp.html.append(contentContainer);

            comp.loadCategory(currentCategory);
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
        // ПЕРЕКЛЮЧЕНИЕ КАТЕГОРИИ
        // ========================================
        comp.switchCategory = function(category) {
            if (category === currentCategory) return;
            
            currentCategory = category;
            
            // Обновляем стили табов
            comp.html.find('.rezka-tab').each(function() {
                var isActive = $(this).attr('data-category') === category;
                $(this).css('backgroundColor', isActive ? '#e50914' : '#2a2a2a');
            });

            comp.loadCategory(category);
        };

        // ========================================
        // ЗАГРУЗКА КАТЕГОРИИ
        // ========================================
        comp.loadCategory = function(category) {
            var contentContainer = comp.html.find('.rezka-content');
            contentContainer.empty();

            var loader = $('<div class="empty__descr">Загрузка...</div>');
            contentContainer.append(loader);

            var endpoint = '/api/' + category;
            
            $.ajax({
                url: MY_API_URL + endpoint,
                method: 'GET',
                dataType: 'json',
                success: function(items) {
                    loader.remove();
                    currentItems = items;
                    if (items && items.length) {
                        comp.renderItems(items, category, contentContainer);
                    } else {
                        contentContainer.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(err) {
                    loader.text('Ошибка связи с сервером');
                    console.error('[Rezka] Ошибка загрузки:', err);
                }
            });
        };

        // ========================================
        // TMDB API - Поиск по двум названиям
        // ========================================
        function searchTMDBBoth(titleRu, titleEn, year, mediaType, callback) {
            var allResults = [];
            var seenIds = new Set();
            var completed = 0;
            var toSearch = [];
            
            if (titleEn) toSearch.push(titleEn);
            if (titleRu) toSearch.push(titleRu);
            
            if (toSearch.length === 0) {
                callback([]);
                return;
            }
            
            console.log('[Rezka] 🔍 Поиск по:', toSearch, 'год:', year);
            
            function checkComplete() {
                completed++;
                if (completed === toSearch.length) {
                    console.log('[Rezka] ✅ Всего найдено уникальных:', allResults.length);
                    callback(allResults);
                }
            }
            
            toSearch.forEach(function(searchTitle) {
                var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_API_KEY + 
                          '&language=ru-RU&query=' + encodeURIComponent(searchTitle);
                
                if (year) {
                    url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                }
                
                $.ajax({
                    url: url,
                    method: 'GET',
                    dataType: 'json',
                    success: function(data) {
                        if (data.results) {
                            data.results.forEach(function(item) {
                                if (!seenIds.has(item.id)) {
                                    seenIds.add(item.id);
                                    allResults.push(item);
                                }
                            });
                        }
                        checkComplete();
                    },
                    error: function() {
                        checkComplete();
                    }
                });
            });
        }

        // ========================================
        // Модалка выбора TMDB
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
        // Модалка выставления серий
        // ========================================
        function showEpisodesModal(item, category) {
            if (isModalOpen) return;
            
            isModalOpen = true;
            console.log('[Rezka] 📺 Открываем выбор серий');
            Lampa.Loading.start(function() {});

            $.ajax({
                url: MY_API_URL + '/api/details',
                method: 'GET',
                data: { url: item.url },
                dataType: 'json',
                success: function(details) {
                    Lampa.Loading.stop();
                    
                    if (!details || !details.seasons) {
                        Lampa.Noty.show('❌ Не удалось загрузить информацию о сериях');
                        isModalOpen = false;
                        return;
                    }
                    
                    var seasons = details.seasons;
                    var seasonKeys = Object.keys(seasons).sort(function(a, b) {
                        return parseInt(a) - parseInt(b);
                    });
                    
                    if (seasonKeys.length === 0) {
                        Lampa.Noty.show('❌ Серии не найдены');
                        isModalOpen = false;
                        return;
                    }
                    
                    // Сначала выбираем сезон
                    var seasonItems = [];
                    seasonKeys.forEach(function(seasonKey) {
                        var episodes = seasons[seasonKey];
                        var watchedCount = episodes.filter(function(ep) { return ep.watched; }).length;
                        var totalCount = episodes.length;
                        
                        seasonItems.push({
                            title: 'Сезон ' + seasonKey + ' (' + watchedCount + '/' + totalCount + ')',
                            value: seasonKey,
                            episodes: episodes
                        });
                    });
                    
                    Lampa.Select.show({
                        title: 'Выберите сезон',
                        items: seasonItems,
                        onSelect: function(selectedSeason) {
                            showEpisodesList(item, selectedSeason.value, selectedSeason.episodes);
                        },
                        onBack: function() {
                            isModalOpen = false;
                        }
                    });
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌ Ошибка связи с сервером');
                    isModalOpen = false;
                }
            });
        }

        function showEpisodesList(item, seasonKey, episodes) {
            var episodeItems = [];
            
            // Добавляем опцию "Отметить все"
            episodeItems.push({
                title: '✅ Отметить все серии как просмотренные',
                value: 'mark_all',
                season: seasonKey
            });
            
            // Добавляем каждую серию
            episodes.sort(function(a, b) {
                return parseInt(a.episode) - parseInt(b.episode);
            });
            
            episodes.forEach(function(ep) {
                var icon = ep.watched ? '✅' : '▫️';
                episodeItems.push({
                    title: icon + ' Серия ' + ep.episode + ': ' + (ep.title || ''),
                    value: ep.episode,
                    season: seasonKey,
                    episode: ep,
                    watched: ep.watched
                });
            });
            
            Lampa.Select.show({
                title: 'Выберите серию (Сезон ' + seasonKey + ')',
                items: episodeItems,
                onSelect: function(selected) {
                    if (selected.value === 'mark_all') {
                        markAllEpisodes(item, selected.season);
                    } else {
                        markSingleEpisode(item, selected.season, selected.value, selected.watched);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        }

        function markSingleEpisode(item, season, episode, currentlyWatched) {
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/episode/mark',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    url: item.url,
                    season: season,
                    episode: episode
                }),
                success: function(res) {
                    Lampa.Loading.stop();
                    if (res.success) {
                        var status = currentlyWatched ? 'Отменена' : 'Просмотрена';
                        Lampa.Noty.show('✅ Серия ' + episode + ': ' + status);
                        isModalOpen = false;
                        // Перезагружаем список
                        comp.loadCategory(currentCategory);
                    } else {
                        Lampa.Noty.show('❌ Ошибка обновления');
                        isModalOpen = false;
                    }
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌ Ошибка связи с сервером');
                    isModalOpen = false;
                }
            });
        }

        function markAllEpisodes(item, season) {
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/episode/mark-range',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    url: item.url,
                    season: season,
                    from_episode: 1,
                    to_episode: 999
                }),
                success: function(res) {
                    Lampa.Loading.stop();
                    if (res.success) {
                        Lampa.Noty.show('✅ Отмечено серий: ' + res.marked);
                        isModalOpen = false;
                        // Перезагружаем список
                        comp.loadCategory(currentCategory);
                    } else {
                        Lampa.Noty.show('❌ Ошибка обновления');
                        isModalOpen = false;
                    }
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌ Ошибка связи с сервером');
                    isModalOpen = false;
                }
            });
        }

        // ========================================
        // Модалка управления фильмом
        // ========================================
        function showManageModal(item, category) {
            if (isModalOpen) return;
            
            isModalOpen = true;
            console.log('[Rezka] 🎛️ Открываем меню управления');

            var items = [];
            
            // Кнопки перемещения в другие категории
            if (category !== 'watching') {
                items.push({
                    title: '▶ Переместить в "Смотрю"',
                    value: 'move_watching'
                });
            }
            if (category !== 'later') {
                items.push({
                    title: '⏳ Переместить в "Позже"',
                    value: 'move_later'
                });
            }
            if (category !== 'watched') {
                items.push({
                    title: '✅ Переместить в "Архив"',
                    value: 'move_watched'
                });
            }

            // Кнопка удаления
            items.push({
                title: '🗑️ Удалить из всех папок',
                value: 'delete'
            });

            Lampa.Select.show({
                title: 'Управление: ' + (item.title || '').split('/')[0].trim(),
                items: items,
                onSelect: function(selected) {
                    isModalOpen = false;
                    handleManageAction(selected.value, item, category);
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        }

        // ========================================
        // Обработка действий управления
        // ========================================
        function handleManageAction(action, item, fromCategory) {
            var postId = extractPostId(item.url);
            if (!postId) {
                Lampa.Noty.show('❌ Ошибка: не удалось определить ID фильма');
                return;
            }

            if (action === 'delete') {
                Lampa.Loading.start(function() {});
                $.ajax({
                    url: MY_API_URL + '/api/delete',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        post_id: postId,
                        category: fromCategory
                    }),
                    success: function(res) {
                        Lampa.Loading.stop();
                        if (res.success) {
                            Lampa.Noty.show('✅ Удалено');
                            comp.loadCategory(fromCategory);
                        } else {
                            Lampa.Noty.show('❌ Ошибка удаления');
                        }
                    },
                    error: function() {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('❌ Ошибка связи с сервером');
                    }
                });
            } else if (action.startsWith('move_')) {
                var toCategory = action.replace('move_', '');
                Lampa.Loading.start(function() {});
                $.ajax({
                    url: MY_API_URL + '/api/move',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        post_id: postId,
                        from_category: fromCategory,
                        to_category: toCategory
                    }),
                    success: function(res) {
                        Lampa.Loading.stop();
                        if (res.success) {
                            Lampa.Noty.show('✅ Перемещено');
                            comp.loadCategory(fromCategory);
                        } else {
                            Lampa.Noty.show('❌ Ошибка перемещения');
                        }
                    },
                    error: function() {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('❌ Ошибка связи с сервером');
                    }
                });
            }
        }

        // ========================================
        // Извлечение post_id из URL
        // ========================================
        function extractPostId(url) {
            if (!url) return null;
            var match = url.match(/\/(\d+)-/);
            return match ? match[1] : null;
        }

        // ========================================
        // Открытие карточки TMDB
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
        // РЕНДЕР КАРТОЧЕК
        // ========================================
        comp.renderItems = function (items, category, container) {
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
                
                var titleRuClean = titleRu.split(':')[0].trim();

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
                // ОБРАБОТКА КЛИКОВ
                // ========================================
                var longPressTimer = null;
                var isLongPress = false;
                var longPressStage = 0; // 0 = нет, 1 = управление, 2 = серии

                card.on('hover:focus', function() {
                    isLongPress = false;
                    longPressStage = 0;
                    currentLongPressItem = item;
                    
                    // Первое долгое нажатие (1 сек) - меню управления
                    longPressTimer = setTimeout(function() {
                        longPressStage = 1;
                        Lampa.Noty.show('📂 Меню управления');
                        
                        // Второе долгое нажатие (еще 1.5 сек) - выставление серий
                        longPressTimer = setTimeout(function() {
                            if (isTv) {
                                longPressStage = 2;
                                Lampa.Noty.show('📺 Выставление серий');
                                showEpisodesModal(item, category);
                            } else {
                                longPressStage = 1;
                                showManageModal(item, category);
                            }
                        }, 1500);
                    }, 1000);
                });

                card.on('hover:blur', function() {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    
                    // Если отпустили на первой стадии - показываем меню управления
                    if (longPressStage === 1) {
                        isLongPress = true;
                        showManageModal(item, category);
                    }
                    
                    if (longPressStage !== 2) {
                        longPressStage = 0;
                    }
                });

                function handleClick(e) {
                    if (e) e.preventDefault();
                    
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    
                    if (isLongPress) {
                        isLongPress = false;
                        return; // Уже показали меню управления
                    }
                    
                    if (isModalOpen) {
                        console.log('[Rezka] ⚠️ Модалка уже открыта');
                        return;
                    }
                    
                    console.log('[Rezka] 🎯 Клик:', titleRu);
                    Lampa.Loading.start(function() {});

                    searchTMDBBoth(titleRuClean, titleEn, year, mediaType, function(results) {
                        Lampa.Loading.stop();

                        if (!results.length) {
                            Lampa.Noty.show('Ничего не найдено в TMDB');
                            return;
                        }

                        // Ищем точное совпадение по году
                        var exactMatch = null;
                        if (year) {
                            exactMatch = results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                                return rYear === year;
                            });
                        }

                        if (exactMatch) {
                            console.log('[Rezka] ✅ Совпадение по году:', exactMatch.id);
                            openLampaCard(exactMatch.id, mediaType);
                        } else if (results.length === 1) {
                            console.log('[Rezka] ✅ Один результат');
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

            container.append(grid);
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
