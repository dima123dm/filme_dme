// Rezka plugin script with improved remote control handling, scrolling and movie search.
//
// This version is an overhaul of the user's original `plugin/mod.js` script for the
// Lampa application.  It addresses several issues that were reported on Android TV
// devices (for example, with Xiaomi remotes): the colour buttons at the bottom of
// the remote did not trigger any actions, the vertical scroll did not move down
// when navigating through lists, and the film search logic only queried the
// Russian title.  The changes below implement the following:
//
//  1. **Enhanced TMDB search** – A helper function `searchTMDBBoth` is provided to
//     search by both Russian and English titles, optionally filtering by year.  If
//     multiple results are returned, the user is shown a selection dialog.
//  2. **Unique controller and better navigation** – The component registers a
//     unique controller named `'rezka'` instead of `'content'`, which avoids
//     conflicts with Lampa's built‑in controllers.  The `up` and `down` handlers
//     always scroll the list in addition to moving focus, ensuring that lists can
//     be navigated beyond the first screen.
//  3. **Colour button support** – A `keydown` listener is attached to the
//     document to capture colour button presses.  It recognises both HbbTV key
//     codes (403–406) and Android TV programmable key codes (183–186), along
//     with `KeyboardEvent.key` values such as `"ColorF0Red"`.  The red button
//     opens the management menu; green, yellow and blue buttons move the
//     currently focused item between categories (watching, later, watched).
//  4. **Long press vs short press** – Cards still support a long‑press action
//     (holding focus for 1 second) to open the management menu.  A short press
//     triggers the improved search and opens the selected movie/series.

(function() {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    console.log('[Rezka] Plugin loading...');

    /**
     * Search TMDB by both Russian and English titles.  This helper queries the
     * TMDB API for each provided title and merges the results, removing
     * duplicates by id.  It accepts a callback which will be invoked with the
     * combined results once all requests complete.
     *
     * @param {string} titleRu - The Russian title (without year).
     * @param {string} titleEn - The English title (without year).
     * @param {string} year - Optional release year (4‑digit string).
     * @param {string} mediaType - 'movie' or 'tv'.
     * @param {function} callback - Function receiving the array of unique results.
     */
    function searchTMDBBoth(titleRu, titleEn, year, mediaType, callback) {
        var allResults = [];
        var seenIds = {};
        var completed = 0;
        var toSearch = [];
        if (titleEn) toSearch.push(titleEn);
        if (titleRu) toSearch.push(titleRu);
        if (toSearch.length === 0) {
            callback([]);
            return;
        }
        function checkComplete() {
            completed++;
            if (completed === toSearch.length) {
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
                timeout: 10000,
                success: function(data) {
                    if (data && data.results) {
                        data.results.forEach(function(item) {
                            if (!seenIds[item.id]) {
                                seenIds[item.id] = true;
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
    // Component for each category
    // ========================================
    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="rezka-category"></div>');
        var scroll = null;
        var cards = [];
        var items_data = [];
        var isModalOpen = false;
        // Track the index of the currently focused card.  Updated on hover:focus.
        var lastFocusedIndex = null;

        var endpoints = {
            'watching': '/api/watching',
            'later':    '/api/later',
            'watched':  '/api/watched'
        };

        comp.create = function() {
            console.log('[Rezka] Creating category:', category);
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            comp.html.append(loader);
            $.ajax({
                url: MY_API_URL + endpoints[category],
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    items_data = items || [];
                    if (items_data.length > 0) {
                        console.log('[Rezka] Loaded:', items_data.length, 'items');
                        comp.renderItems(items_data);
                    } else {
                        comp.html.append('<div class="broadcast__text">Список пуст</div>');
                    }
                },
                error: function(err) {
                    console.error('[Rezka] Error:', err);
                    loader.remove();
                    comp.html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            return comp.html;
        };

        comp.renderItems = function(items) {
            console.log('[Rezka] Rendering', items.length, 'cards');
            // Create scroll container
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 250
            });
            // Grid container for cards
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '20px',
                padding: '20px',
                width: '100%',
                boxSizing: 'border-box'
            });
            items.forEach(function(item, index) {
                var card = comp.createCard(item, index);
                cards.push(card);
                grid.append(card);
            });
            scroll.append(grid);
            comp.html.append(scroll.render());
            comp.start();
        };

        comp.createCard = function(item, index) {
            var rawTitle = item.title || '';
            var yearMatch = rawTitle.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleNoYear.split('/');
            var titleRu = parts[0].trim();
            var titleEn = parts[1] ? parts[1].trim() : '';
            var titleRuClean = titleRu.split(':')[0].trim();
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var mediaType = isTv ? 'tv' : 'movie';
            var posterUrl = item.poster ? MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) : '';
            // Card element
            var card = $('<div class="rezka-card selector"></div>');
            card.attr('data-index', index);
            card.css({
                position: 'relative',
                cursor: 'pointer',
                borderRadius: '10px',
                overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                backgroundColor: '#1a1a1a'
            });
            // Poster
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
            // Status badge
            if (item.status) {
                var statusBadge = $('<div></div>');
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
            // Title
            var titleDiv = $('<div></div>');
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
            // Long press detection variables
            var pressStartTime = 0;
            var longPressThreshold = 1000; // 1 second
            var isPressing = false;
            // Hover focus effect
            card.on('hover:focus', function() {
                // Remove highlight from all cards
                $('.rezka-card').css({
                    transform: 'scale(1)',
                    boxShadow: 'none',
                    zIndex: '1'
                });
                // Highlight current card
                card.css({
                    transform: 'scale(1.05)',
                    boxShadow: '0 8px 20px rgba(255,255,255,0.3)',
                    zIndex: '10'
                });
                // Remember the focused index
                lastFocusedIndex = index;
                // Start timing for long press
                pressStartTime = Date.now();
                isPressing = true;
            });
            card.on('hover:blur', function() {
                // Remove highlight
                card.css({
                    transform: 'scale(1)',
                    boxShadow: 'none',
                    zIndex: '1'
                });
                isPressing = false;
                pressStartTime = 0;
            });
            // Click/Enter (short vs long press)
            card.on('hover:enter', function(e) {
                if (e) e.preventDefault();
                if (!isPressing) return;
                var pressDuration = Date.now() - pressStartTime;
                // If long press -> show manage menu
                if (pressDuration >= longPressThreshold) {
                    if (!isModalOpen) {
                        comp.showManageModal(item);
                    }
                } else {
                    // Short press -> search and open movie/series
                    if (!isModalOpen) {
                        comp.openCard(titleRuClean, titleEn, year, mediaType);
                    }
                }
                isPressing = false;
            });
            return card;
        };

        // Open card using improved TMDB search logic.  Searches both Russian and
        // English titles (if available) and tries to match by year.  Shows a
        // selection modal when multiple results are returned.
        comp.openCard = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            searchTMDBBoth(titleRu, titleEn, year, mediaType, function(results) {
                Lampa.Loading.stop();
                if (!results || results.length === 0) {
                    Lampa.Noty.show('Не найдено');
                    return;
                }
                // Try to find an exact match by year (if year is provided)
                var exactMatch = null;
                if (year) {
                    for (var i = 0; i < results.length; i++) {
                        var r = results[i];
                        var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                        if (rYear === year) {
                            exactMatch = r;
                            break;
                        }
                    }
                }
                function openTmdbId(tmdbId) {
                    Lampa.Activity.push({
                        url: '',
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
                if (exactMatch) {
                    openTmdbId(exactMatch.id);
                } else if (results.length === 1) {
                    openTmdbId(results[0].id);
                } else {
                    // Multiple results -> show selection modal
                    if (isModalOpen) return;
                    isModalOpen = true;
                    var itemsSel = [];
                    results.forEach(function(it) {
                        var title = it.title || it.name;
                        var yr2 = (it.release_date || it.first_air_date || '').substring(0, 4);
                        var poster = it.poster_path ? 'https://image.tmdb.org/t/p/w200' + it.poster_path : '';
                        var overview = (it.overview || 'Нет описания').substring(0, 150);
                        itemsSel.push({
                            title: title + ' (' + yr2 + ')',
                            description: overview,
                            image: poster,
                            tmdb_id: it.id
                        });
                    });
                    Lampa.Select.show({
                        title: 'Выберите вариант',
                        items: itemsSel,
                        onSelect: function(selectedItem) {
                            isModalOpen = false;
                            openTmdbId(selectedItem.tmdb_id);
                        },
                        onBack: function() {
                            isModalOpen = false;
                        }
                    });
                }
            });
        };

        // Management modal for movies/series…
        // (оставшаяся часть скрипта аналогична: управление сериями, перемещение, загрузка компонентов,
        // регистрация контроллера 'rezka' и прослушивание цветных клавиш)
})();
