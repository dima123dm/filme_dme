(function () {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div class="items items--vertical"></div>');
        var currentModal = null; // Храним ссылку на модалку

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
            if (currentModal) {
                Lampa.Modal.close();
                currentModal = null;
            }
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
            // Закрываем предыдущую модалку если есть
            if (currentModal) {
                Lampa.Modal.close();
                currentModal = null;
            }

            var scrollContainer = $('<div class="tmdb-scroll-container"></div>').css({
                maxHeight: '70vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '10px'
            });

            currentModal = Lampa.Modal.open({
                title: 'Выберите правильный вариант',
                html: scrollContainer,
                onBack: function() {
                    console.log('[Rezka] 🔙 Закрытие');
                    Lampa.Modal.close();
                    currentModal = null;
                    Lampa.Controller.toggle('content');
                }
            });

            if (!results.length) {
                scrollContainer.append('<div style="padding:20px;text-align:center;color:#999">Ничего не найдено</div>');
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
                    padding: '12px',
                    marginBottom: '8px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    alignItems: 'flex-start',
                    transition: 'background 0.2s'
                });

                card.hover(
                    function() { $(this).css('background', 'rgba(255,255,255,0.15)'); },
                    function() { $(this).css('background', 'rgba(255,255,255,0.1)'); }
                );

                if (poster) {
                    var posterEl = $('<div></div>').css({
                        width: '60px',
                        height: '90px',
                        backgroundImage: 'url(' + poster + ')',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: '4px',
                        marginRight: '12px',
                        flexShrink: 0
                    });
                    card.append(posterEl);
                }

                var infoEl = $('<div></div>').css({ flex: 1 });
                infoEl.append('<div style="font-weight:bold;margin-bottom:5px;font-size:15px;color:#fff">' + title + ' (' + year + ')</div>');
                infoEl.append('<div style="font-size:12px;color:#aaa;line-height:1.4">' + 
                    (overview.length > 120 ? overview.substring(0, 120) + '...' : overview) + 
                '</div>');

                card.append(infoEl);

                // ✅ ИСПРАВЛЕНО: Правильное закрытие модалки
                var handleSelect = function(e) {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    
                    console.log('[Rezka] 📌 Выбрано:', title, item.id);
                    
                    // Удаляем все обработчики
                    card.off('hover:enter click');
                    
                    // Закрываем модалку
                    Lampa.Modal.close();
                    currentModal = null;
                    
                    // Открываем карточку
                    setTimeout(function() {
                        onSelect(item);
                    }, 200);
                };

                card.on('hover:enter', handleSelect);
                card.on('click', handleSelect);

                scrollContainer.append(card);

                if (index === 0) {
                    Lampa.Controller.collectionSet(scrollContainer);
                    Lampa.Controller.collectionFocus(card[0], scrollContainer);
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
            var body = $('<div class="category-full__body"></div>').css({
                display: 'flex',
                flexWrap: 'wrap',
                gap: '15px',
                padding: '20px'
            });

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

                // ✅ КАРТОЧКА
                var card = $('<div class="card selector card--collection"></div>');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '150px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s'
                });

                card.hover(
                    function() { $(this).css('transform', 'scale(1.05)'); },
                    function() { $(this).css('transform', 'scale(1)'); }
                );

                var cardView = $('<div class="card__view"></div>').css({
                    position: 'relative'
                });
                
                // ✅ ПОСТЕР
                if (posterUrl) {
                    var cardImg = $('<div class="card__img"></div>').css({
                        backgroundImage: 'url(' + posterUrl + ')',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        paddingBottom: '150%',
                        borderRadius: '8px',
                        position: 'relative'
                    });
                    
                    // ✅ СТАТУС ВНИЗУ ПОСТЕРА
                    if (item.status) {
                        var statusDiv = $('<div></div>').text(item.status).css({
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            right: '0',
                            padding: '5px 8px',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                            fontSize: '11px',
                            textAlign: 'center',
                            color: '#fff',
                            fontWeight: 'bold'
                        });
                        cardImg.append(statusDiv);
                    }
                    
                    cardView.append(cardImg);
                }
                
                // ✅ НАЗВАНИЕ ПОД ПОСТЕРОМ
                var cardTitle = $('<div class="card__title"></div>').text(titleClean).css({
                    marginTop: '8px',
                    fontSize: '13px',
                    textAlign: 'center',
                    lineHeight: '1.3',
                    height: '35px',
                    overflow: 'hidden'
                });
                cardView.append(cardTitle);
                
                card.append(cardView);

                // ========================================
                // КЛИК
                // ========================================
                function handleClick(e) {
                    if (e) e.preventDefault();
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
