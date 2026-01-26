(function() {
    'use strict';
    
    var API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[REZKA] Plugin loading...');
    
    function RezkaComponent(object) {
        var component = this;
        var container = document.createElement('div');
        container.className = 'items items--lines';
        
        this.create = function() {
            console.log('[REZKA] Creating component');
            container.innerHTML = '';
            
            var loader = document.createElement('div');
            loader.className = 'empty__descr';
            loader.textContent = 'Загрузка...';
            container.appendChild(loader);
            
            var xhr = new XMLHttpRequest();
            xhr.open('GET', API_URL + '/api/watching', true);
            xhr.timeout = 15000;
            
            xhr.onload = function() {
                try {
                    if (loader.parentNode) {
                        loader.parentNode.removeChild(loader);
                    }
                    
                    if (xhr.status === 200) {
                        var items = JSON.parse(xhr.responseText);
                        console.log('[REZKA] Loaded:', items.length, 'items');
                        
                        if (items && items.length > 0) {
                            component.renderItems(items);
                        } else {
                            var empty = document.createElement('div');
                            empty.className = 'empty__descr';
                            empty.textContent = 'Список пуст';
                            container.appendChild(empty);
                        }
                        
                        if (Lampa.Controller) {
                            Lampa.Controller.toggle('content');
                        }
                    } else {
                        var error = document.createElement('div');
                        error.className = 'empty__descr';
                        error.textContent = 'Ошибка: ' + xhr.status;
                        container.appendChild(error);
                    }
                } catch(e) {
                    console.error('[REZKA] Error:', e);
                    var error = document.createElement('div');
                    error.className = 'empty__descr';
                    error.textContent = 'Ошибка загрузки';
                    container.appendChild(error);
                }
            };
            
            xhr.onerror = function() {
                console.error('[REZKA] Network error');
                if (loader.parentNode) {
                    loader.textContent = 'Ошибка сети';
                }
            };
            
            xhr.ontimeout = function() {
                console.error('[REZKA] Timeout');
                if (loader.parentNode) {
                    loader.textContent = 'Превышено время ожидания';
                }
            };
            
            xhr.send();
            
            return container;
        };
        
        this.renderItems = function(items) {
            console.log('[REZKA] Rendering', items.length, 'cards');
            
            var grid = document.createElement('div');
            grid.className = 'rezka-grid';
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:20px;padding:20px;width:100%';
            
            for (var i = 0; i < items.length; i++) {
                var card = component.createCard(items[i]);
                grid.appendChild(card);
            }
            
            container.appendChild(grid);
        };
        
        this.createCard = function(item) {
            var title = item.title || '';
            var poster = item.poster ? API_URL + '/api/img?url=' + encodeURIComponent(item.poster) : '';
            
            // Парсинг
            var yearMatch = title.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleClean = title.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleClean.split('/');
            var titleRu = parts[0].trim();
            var titleEn = parts[1] ? parts[1].trim() : '';
            
            var isTV = /\/series\/|\/cartoons\//.test(item.url || '');
            var mediaType = isTV ? 'tv' : 'movie';
            
            // Карточка
            var card = document.createElement('div');
            card.className = 'rezka-card selector';
            card.style.cssText = 'position:relative;cursor:pointer;border-radius:10px;overflow:hidden;background-color:#1a1a1a';
            
            // Постер
            var posterDiv = document.createElement('div');
            posterDiv.style.cssText = 'width:100%;padding-bottom:150%;position:relative;' + 
                                     (poster ? 'background-image:url(' + poster + ');' : '') +
                                     'background-color:#2a2a2a;background-size:cover;background-position:center';
            
            // Статус
            if (item.status) {
                var badge = document.createElement('div');
                badge.textContent = item.status;
                badge.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:5px;background:rgba(0,0,0,0.9);color:#fff;font-size:11px;text-align:center';
                posterDiv.appendChild(badge);
            }
            
            card.appendChild(posterDiv);
            
            // Название
            var titleDiv = document.createElement('div');
            titleDiv.textContent = titleRu;
            titleDiv.style.cssText = 'padding:10px;font-size:13px;color:#fff;text-align:center;min-height:50px';
            card.appendChild(titleDiv);
            
            // Клик
            var clickHandler = function() {
                console.log('[REZKA] Click:', titleRu);
                component.openCard(titleRu, titleEn, year, mediaType);
            };
            
            card.addEventListener('click', clickHandler);
            
            // Для пульта ТВ
            card.addEventListener('hover:enter', clickHandler);
            
            return card;
        };
        
        this.openCard = function(titleRu, titleEn, year, mediaType) {
            console.log('[REZKA] Opening:', titleRu);
            
            if (Lampa.Loading) {
                Lampa.Loading.start(function() {});
            }
            
            var searchUrl = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_KEY + 
                          '&language=ru-RU&query=' + encodeURIComponent(titleRu);
            
            if (year) {
                searchUrl += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            var xhr = new XMLHttpRequest();
            xhr.open('GET', searchUrl, true);
            
            xhr.onload = function() {
                if (Lampa.Loading) {
                    Lampa.Loading.stop();
                }
                
                try {
                    if (xhr.status === 200) {
                        var data = JSON.parse(xhr.responseText);
                        if (data.results && data.results.length > 0) {
                            var tmdbId = data.results[0].id;
                            console.log('[REZKA] Found TMDB ID:', tmdbId);
                            
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
                        } else {
                            if (Lampa.Noty) {
                                Lampa.Noty.show('Не найдено в TMDB');
                            }
                        }
                    }
                } catch(e) {
                    console.error('[REZKA] TMDB error:', e);
                    if (Lampa.Noty) {
                        Lampa.Noty.show('Ошибка поиска');
                    }
                }
            };
            
            xhr.onerror = function() {
                if (Lampa.Loading) {
                    Lampa.Loading.stop();
                }
                if (Lampa.Noty) {
                    Lampa.Noty.show('Ошибка подключения');
                }
            };
            
            xhr.send();
        };
        
        this.start = function() {
            console.log('[REZKA] Start');
            if (Lampa.Controller) {
                Lampa.Controller.toggle('content');
            }
        };
        
        this.pause = function() {};
        this.stop = function() {};
        this.destroy = function() {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        };
        
        this.render = function() {
            return container;
        };
        
        return this;
    }
    
    // Регистрация
    function init() {
        console.log('[REZKA] Init called');
        
        if (!window.Lampa) {
            console.error('[REZKA] Lampa not found!');
            return;
        }
        
        // Регистрируем компонент
        Lampa.Component.add('my_rezka', RezkaComponent);
        console.log('[REZKA] Component registered');
        
        // Добавляем в меню
        setTimeout(function() {
            var menuList = document.querySelector('.menu .menu__list');
            if (!menuList) {
                console.error('[REZKA] Menu not found');
                return;
            }
            
            var existingItem = document.querySelector('[data-action="my_rezka_open"]');
            if (existingItem) {
                console.log('[REZKA] Menu item already exists');
                return;
            }
            
            console.log('[REZKA] Adding menu item');
            
            var menuItem = document.createElement('li');
            menuItem.className = 'menu__item selector';
            menuItem.setAttribute('data-action', 'my_rezka_open');
            menuItem.innerHTML = 
                '<div class="menu__ico">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M12 2L2 7L12 12L22 7L12 2Z"/>' +
                '<path d="M2 17L12 22L22 17"/>' +
                '<path d="M2 12L12 17L22 12"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu__text">Rezka</div>';
            
            menuList.appendChild(menuItem);
            
            // Обработчик клика
            menuItem.addEventListener('click', function(e) {
                console.log('[REZKA] Menu clicked');
                e.preventDefault();
                e.stopPropagation();
                Lampa.Activity.push({
                    component: 'my_rezka',
                    page: 1
                });
            });
            
            // Для пульта
            menuItem.addEventListener('hover:enter', function(e) {
                console.log('[REZKA] Menu enter');
                e.preventDefault();
                e.stopPropagation();
                Lampa.Activity.push({
                    component: 'my_rezka',
                    page: 1
                });
            });
            
            console.log('[REZKA] Menu item added');
        }, 1000);
    }
    
    // Запуск
    if (window.Lampa) {
        if (Lampa.Listener) {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    console.log('[REZKA] App ready');
                    init();
                }
            });
        } else {
            setTimeout(init, 2000);
        }
    } else {
        console.error('[REZKA] Lampa not available');
    }
    
    console.log('[REZKA] Plugin loaded');
})();
