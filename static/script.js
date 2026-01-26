/* */
const tg = window.Telegram.WebApp;
tg.expand();

let currentCategory = 'watching';
// Глобальный объект плеера
let art = null;
// Базовый домен для парсинга (если заблокируют, поменяй тут)
const KINOGO_BASE = "https://kinogo.inc";

// Переключение вкладок
async function switchTab(cat, btn) {
    currentCategory = cat;
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadGrid(cat);
}

// Загрузка сетки
async function loadGrid(cat) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка...</div>';
    try {
        const res = await fetch(`/api/${cat}`);
        const data = await res.json();
        grid.innerHTML = '';
        if (!data || data.length === 0) {
            grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Список пуст</div>';
            return;
        }
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'card';
            div.onclick = () => openDetails(item.url, item.title, item.poster);
            div.innerHTML = `
                <div class="card-badge">${item.status || 'Фильм'}</div>
                <img src="${item.poster}" loading="lazy">
                <div class="card-content">
                    <div class="card-title">${item.title}</div>
                    <div class="card-sub">HDRezka</div>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (e) {
        grid.innerHTML = '<div style="grid-column:span 2; text-align:center;">Ошибка соединения</div>';
    }
}

let currentPostId = null;
let currentDetailsUrl = null;
let currentMovieTitle = ""; // Сохраняем название для поиска

// Открытие деталей
async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    currentMovieTitle = title; // Запоминаем название

    // Скрываем плеер при открытии нового фильма
    closePlayer();
    
    document.getElementById('det-controls').style.display = 'none';
    const franchiseContainer = document.getElementById('det-franchises');
    if (franchiseContainer) franchiseContainer.innerHTML = '';

    currentDetailsUrl = url;
    const list = document.getElementById('det-list');
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#888">Загрузка серий (Rezka)...</div>';
    
    try {
        const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.post_id) {
            currentPostId = data.post_id;
            document.getElementById('det-controls').style.display = 'flex';
        }
        if (data.poster) document.getElementById('det-img').src = data.poster;
        
        list.innerHTML = '';
        if (data.error) {
            list.innerHTML = `<div style="text-align:center; padding:20px;">${data.error}</div>`;
        }

        if (data.franchises && data.franchises.length > 0) {
            if (franchiseContainer) {
                const fTitle = document.createElement('div');
                fTitle.className = 'season-title';
                fTitle.innerText = 'Связанные проекты';
                franchiseContainer.appendChild(fTitle);
                const fScroll = document.createElement('div');
                fScroll.className = 'franchise-scroll';
                data.franchises.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'franchise-card';
                    item.onclick = () => openDetails(f.url, f.title, f.poster);
                    item.innerHTML = `
                        <img src="${f.poster}">
                        <div class="f-info">
                            <div class="f-title">${f.title}</div>
                            <div class="f-year">${f.info || ''}</div>
                        </div>
                    `;
                    fScroll.appendChild(item);
                });
                franchiseContainer.appendChild(fScroll);
            }
        }

        if (data.seasons) {
            Object.keys(data.seasons).forEach(s => {
                const h = document.createElement('div');
                h.className = 'season-title';
                h.innerText = s + ' сезон';
                list.appendChild(h);
                data.seasons[s].forEach(ep => {
                    const row = document.createElement('div');
                    row.className = `ep-row ${ep.watched ? 'watched' : ''}`;
                    row.innerHTML = `
                        <span style="flex:1; padding-right:10px;">${ep.title}</span>
                        <div class="check ${ep.watched ? 'active' : ''}" onclick="toggle('${ep.global_id}', this)"></div>
                    `;
                    row.querySelector('.check').rowElement = row;
                    list.appendChild(row);
                });
            });
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">Ошибка загрузки</div>';
    }
}

// Закрыть модальное окно
function closeDetails() {
    closePlayer();
    document.getElementById('details').classList.remove('open');
}

// --- ЛОГИКА ОНЛАЙН ПРОСМОТРА (CLIENT SIDE) ---

function closePlayer() {
    if (art) {
        art.destroy();
        art = null;
    }
    document.getElementById('player-container').style.display = 'none';
    document.getElementById('translation-box').style.display = 'none';
    document.getElementById('translation-select').innerHTML = '<option value="">Выберите озвучку...</option>';
}

// Главная функция запуска (вызывается кнопкой "Смотреть")
async function startOnlineView() {
    if (!currentMovieTitle) return;
    
    const btn = document.querySelector('.btn-play-online');
    const originalText = btn.innerText;
    btn.innerText = "🔍 Поиск...";
    
    try {
        // 1. Ищем на Kinogo по названию
        // Очищаем название от лишнего (например, года)
        const cleanTitle = currentMovieTitle.split('(')[0].trim();
        const searchUrl = `${KINOGO_BASE}/index.php?do=search&subaction=search&story=${encodeURIComponent(cleanTitle)}`;
        
        const res = await fetch(searchUrl);
        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        // Берем первый результат
        const firstLink = doc.querySelector('.shortstorytitle a');
        if (!firstLink) {
            alert('Не найдено на Kinogo :(');
            btn.innerText = originalText;
            return;
        }
        
        const movieUrl = firstLink.href;
        btn.innerText = "⏳ Загрузка...";
        
        // 2. Загружаем страницу фильма
        await loadKinogoPage(movieUrl);
        
    } catch (e) {
        alert('Ошибка доступа к Kinogo. Убедитесь, что включено расширение CORS!');
        console.error(e);
    } finally {
        btn.innerText = originalText;
    }
}

async function loadKinogoPage(url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        
        // Показываем контейнеры
        document.getElementById('player-container').style.display = 'block';
        document.getElementById('translation-box').style.display = 'block';
        
        // Ищем m3u8
        const m3u8Match = text.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
        
        if (m3u8Match && m3u8Match[1]) {
            let streamUrl = m3u8Match[1];
            // Запускаем плеер
            initPlayer(streamUrl);
        } else {
            // Если m3u8 не нашли сразу, возможно он в iframe (пока простая логика)
            alert('Прямая ссылка не найдена. Возможно, нужна более сложная логика парсинга.');
        }
        
        // Попытка найти озвучки (примерная логика, зависит от верстки)
        // На Kinogo озвучки часто просто вкладками или в JS. 
        // Здесь мы пока просто оставим плеер, так как парсинг озвучек требует сложного разбора DOM.
        const select = document.getElementById('translation-select');
        select.innerHTML = '<option selected>По умолчанию (Kinogo)</option>';
        
    } catch (e) {
        console.error(e);
        alert('Ошибка загрузки страницы фильма');
    }
}

function initPlayer(url) {
    if (art) art.destroy();
    
    art = new Artplayer({
        container: '#artplayer',
        url: url,
        type: 'm3u8',
        customType: {
            m3u8: function (video, url) {
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            },
        },
        fullscreen: true,
        autoplay: true,
        setting: true,
        pip: true
    });
    
    // Скролл к плееру
    document.getElementById('player-container').scrollIntoView({ behavior: 'smooth' });
}

function changeTranslation(val) {
    // Заглушка, если реализуешь парсинг озвучек
    console.log("Смена озвучки:", val);
}

// --- КОНЕЦ ЛОГИКИ ОНЛАЙН ПРОСМОТРА ---

async function moveMovie(category) {
    if (!currentPostId) return;
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: category })
    });
    alert('Перенесено!');
    closeDetails();
    switchTab(currentCategory, document.querySelector('.tab-btn.active'));
}

async function deleteMovie() {
    if (!currentPostId) return;
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: currentCategory })
    });
    alert('Удалено!');
    closeDetails();
    switchTab(currentCategory, document.querySelector('.tab-btn.active'));
}

async function toggle(gid, btn) {
    tg.HapticFeedback.impactOccurred('medium');
    const row = btn.rowElement;
    const isActive = btn.classList.contains('active');
    if (isActive) {
        btn.classList.remove('active');
        row.classList.remove('watched');
    } else {
        btn.classList.add('active');
        row.classList.add('watched');
    }
    await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_id: gid, referer: currentDetailsUrl })
    });
}

function openSearch(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('grid').style.display = 'none';
    document.getElementById('search-ui').style.display = 'block';
    const input = document.getElementById('q');
    input.focus();
    input.value = ''; 
    document.getElementById('search-results').innerHTML = '';
}

let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
    if (val.length === 0) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    searchTimer = setTimeout(async () => {
        if (val.length < 3) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `
                <div class="search-title">${item.title}</div>
                <div class="search-actions">
                    <button class="btn-action btn-watch" onclick="addFav('${item.id}', 'watching')">+ Смотрю</button>
                    <button class="btn-action btn-later" onclick="addFav('${item.id}', 'later')">+ Позже</button>
                    <button class="btn-action btn-done" onclick="addFav('${item.id}', 'watched')">✔ Архив</button>
                </div>
            `;
            list.appendChild(div);
        });
    }, 600);
}

async function addFav(id, cat) {
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: id, category: cat })
    });
    alert('Добавлено!');
}

loadGrid('watching');