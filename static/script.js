/* */
const tg = window.Telegram.WebApp;
tg.expand();

let currentCategory = 'watching';
let art = null;
let currentMovieTitle = "";

// --- ОБЫЧНЫЕ ФУНКЦИИ (Rezka) ---

async function switchTab(cat, btn) {
    currentCategory = cat;
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadGrid(cat);
}

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

async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    currentMovieTitle = title;
    
    closePlayer(); // Сброс плеера
    document.getElementById('det-controls').style.display = 'none';
    const list = document.getElementById('det-list');
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#888">Загрузка...</div>';
    
    // Чистим франшизы
    document.getElementById('det-franchises').innerHTML = '';

    currentDetailsUrl = url;
    try {
        const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.post_id) {
            currentPostId = data.post_id;
            document.getElementById('det-controls').style.display = 'flex';
        }
        if (data.poster) document.getElementById('det-img').src = data.poster;
        
        list.innerHTML = '';
        
        // Рендер франшиз (если есть)
        if (data.franchises && data.franchises.length > 0) {
            const fContainer = document.getElementById('det-franchises');
            const fTitle = document.createElement('div');
            fTitle.className = 'season-title';
            fTitle.innerText = 'Связанные части';
            fContainer.appendChild(fTitle);
            
            const fScroll = document.createElement('div');
            fScroll.className = 'franchise-scroll';
            data.franchises.forEach(f => {
                const item = document.createElement('div');
                item.className = 'franchise-card';
                item.onclick = () => openDetails(f.url, f.title, f.poster);
                item.innerHTML = `<img src="${f.poster}"><div class="f-info"><div class="f-title">${f.title}</div></div>`;
                fScroll.appendChild(item);
            });
            fContainer.appendChild(fScroll);
        }

        // Рендер серий
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
                        <span style="flex:1;">${ep.title}</span>
                        <div class="check ${ep.watched ? 'active' : ''}" onclick="toggle('${ep.global_id}', this)"></div>
                    `;
                    row.querySelector('.check').rowElement = row;
                    list.appendChild(row);
                });
            });
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center;">Ошибка загрузки</div>';
    }
}

function closeDetails() {
    closePlayer();
    document.getElementById('details').classList.remove('open');
}

// --- ЛОГИКА KINOGO ---

// 1. Поиск (Через сервер, как в server.py)
async function startOnlineView() {
    if (!currentMovieTitle) return;
    
    const btn = document.querySelector('.btn-play-online');
    const originalText = btn.innerText;
    btn.innerText = "🔍 Поиск на сервере...";
    
    // Убираем лишнее из названия (год, англ название) для лучшего поиска
    let cleanTitle = currentMovieTitle.split('(')[0].split('/')[0].trim();
    
    try {
        // ОБРАЩАЕМСЯ К НАШЕМУ СЕРВЕРУ (FastAPI + Playwright)
        const res = await fetch(`/api/kinogo/search?q=${encodeURIComponent(cleanTitle)}`);
        const results = await res.json();
        
        if (!results || results.length === 0) {
            // Если не нашли, пробуем ручной ввод
            let manual = prompt("Сервер не нашел фильм. Введите название для поиска (Kinogo):", cleanTitle);
            if (manual) {
                const res2 = await fetch(`/api/kinogo/search?q=${encodeURIComponent(manual)}`);
                const results2 = await res2.json();
                if (results2.length > 0) {
                    processSearchResult(results2[0], btn, originalText);
                } else {
                    alert("Ничего не найдено.");
                    btn.innerText = originalText;
                }
            } else {
                btn.innerText = originalText;
            }
            return;
        }
        
        // Берем первый результат
        processSearchResult(results[0], btn, originalText);
        
    } catch (e) {
        alert("Ошибка связи с сервером поиска.");
        btn.innerText = originalText;
    }
}

async function processSearchResult(item, btn, originalText) {
    console.log("Найден фильм:", item.title, item.url);
    btn.innerText = "⏳ Загрузка плеера...";
    
    // 2. Просмотр (Напрямую с клиента, чтобы не блокировало видео)
    // Мы получили ссылку от сервера, теперь парсим её сами
    await loadKinogoPageClient(item.url);
    
    btn.innerText = originalText;
}

// Эта функция работает В БРАУЗЕРЕ (Украина)
async function loadKinogoPageClient(url) {
    try {
        // ВАЖНО: Тут нужно расширение CORS, так как запрос идет на kinogo.inc
        const res = await fetch(url);
        const text = await res.text();
        
        // Показываем плеер
        document.getElementById('player-container').style.display = 'block';
        document.getElementById('translation-box').style.display = 'block';
        
        // Ищем m3u8 в коде страницы
        const m3u8Match = text.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
        
        if (m3u8Match && m3u8Match[1]) {
            let streamUrl = m3u8Match[1];
            initPlayer(streamUrl);
        } else {
            alert("Плеер найден, но прямая ссылка скрыта. Попробуйте другой фильм или включите VPN/CORS.");
        }
        
        // Тут можно добавить логику парсинга озвучек, если нужно
        const select = document.getElementById('translation-select');
        select.innerHTML = '<option>Kinogo (Default)</option>';
        
    } catch (e) {
        alert("Ошибка загрузки страницы Kinogo! Убедитесь, что у вас включено расширение 'Allow CORS' в браузере.");
        console.error(e);
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
        pip: true,
        lang: 'ru'
    });
    
    // Скролл к плееру
    document.getElementById('player-container').scrollIntoView({ behavior: 'smooth' });
}

function closePlayer() {
    if (art) {
        art.destroy();
        art = null;
    }
    document.getElementById('player-container').style.display = 'none';
    document.getElementById('translation-box').style.display = 'none';
}

function changeTranslation(val) {
    console.log("Смена озвучки пока не реализована в клиенте");
}

// ... (остальные функции для работы с закладками и поиском Rezka без изменений)
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
    loadGrid(currentCategory);
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
    loadGrid(currentCategory);
}

async function toggle(gid, btn) {
    tg.HapticFeedback.impactOccurred('medium');
    const row = btn.rowElement;
    if (btn.classList.contains('active')) {
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
    document.getElementById('q').focus();
}

let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
    if (val.length === 0) { document.getElementById('search-results').innerHTML = ''; return; }
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
                </div>`;
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