// This is the complete optimized JavaScript file with improved AI performance and enhanced statistics system

// ============================================================
// ADAPTIVE LAYOUT: device detection
// ------------------------------------------------------------
// Instead of relying only on a CSS width media query, we detect the
// device/viewport here in JS and toggle a class on <html>:
//   device-mobile  -> phone layout (untouched, original design)
//   device-tablet  -> tablet layout (see html.device-tablet CSS rules)
//   device-desktop -> rearranged layout (right-side vertical bar,
//                     board that grows with the screen, etc.)
// Alongside that, we also toggle orientation-portrait / orientation-landscape,
// since a tablet held sideways behaves much more like a small desktop
// (there's room for the right-side vertical bar) than like a tall phone.
// styles.css reacts to these classes (see "html.device-desktop ..." and
// "html.device-tablet.orientation-landscape ..." rules), which is what lets
// the layout fully re-order elements instead of just shrinking/growing
// them. This runs immediately (not inside DOMContentLoaded) so the correct
// classes are set before the game screen is ever shown, and again on every
// resize/rotation so it keeps up if the window is resized or the device is
// rotated.
// ============================================================
(function () {
    var BREAKPOINTS = { tablet: 768, desktop: 1024 };
    var DEVICE_CLASSES = ['device-mobile', 'device-tablet', 'device-desktop'];
    var ORIENTATION_CLASSES = ['orientation-portrait', 'orientation-landscape'];

    function getDeviceClass() {
        var w = window.innerWidth;
        if (w >= BREAKPOINTS.desktop) return 'device-desktop';
        if (w >= BREAKPOINTS.tablet) return 'device-tablet';
        return 'device-mobile';
    }

    function getOrientationClass() {
        return window.innerWidth > window.innerHeight ? 'orientation-landscape' : 'orientation-portrait';
    }

    function applyDeviceClass() {
        var html = document.documentElement;
        var nextDevice = getDeviceClass();
        DEVICE_CLASSES.forEach(function (c) {
            if (c !== nextDevice) html.classList.remove(c);
        });
        if (!html.classList.contains(nextDevice)) html.classList.add(nextDevice);

        var nextOrientation = getOrientationClass();
        ORIENTATION_CLASSES.forEach(function (c) {
            if (c !== nextOrientation) html.classList.remove(c);
        });
        if (!html.classList.contains(nextOrientation)) html.classList.add(nextOrientation);
    }

    // Set it right away (this is an inline-safe, dependency-free IIFE).
    applyDeviceClass();

    // Keep it correct if the window is resized or the device rotated
    // (e.g. a tablet flipped between portrait and landscape).
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyDeviceClass, 150);
    });
    window.addEventListener('orientationchange', applyDeviceClass);

    // Expose for debugging/manual re-check if ever needed elsewhere.
    window.__applyDeviceClass = applyDeviceClass;
})();

// Register the Service Worker that caches the Stockfish engine file, so
// repeat visits load it instantly from disk instead of the network.
// This runs once per page load, outside DOMContentLoaded so it starts as
// early as possible without blocking anything else.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.error('Service worker registration failed (this is non-fatal, the game still works without it):', err);
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // ===== FIX: Register the welcome-page auto-advance timer FIRST, before any other
    // DOM lookups that could throw and prevent this from ever being scheduled. =====
    try {
        const _pages = document.querySelectorAll('.page');
        const _dots = document.querySelectorAll('.dot');
        setTimeout(() => {
            try {
                if (_pages && _pages.length > 1) {
                    _pages.forEach(page => page.classList.remove('active'));
                    _dots.forEach(dot => dot.classList.remove('active'));
                    _pages[1].classList.add('active');
                    document.querySelectorAll('.dot[data-page="1"]').forEach(dot => dot.classList.add('active'));
                    if (typeof updateNavArrows === 'function') updateNavArrows(1);
                    currentPage = 1;
                    if (typeof gameTimer !== 'undefined' && gameTimer) clearInterval(gameTimer);
                }
            } catch (innerErr) {
                console.error('Auto-advance from welcome page failed:', innerErr);
            }
        }, 5000);
    } catch (e) {
        console.error('Could not schedule welcome page auto-advance:', e);
    }

    // Custom alert display function
    function showCustomAlert(message) {
        const modal = document.getElementById('custom-alert-modal');
        const msgEl = document.getElementById('custom-alert-message');
        if (!modal || !msgEl) {
            console.error('Custom alert modal elements missing from HTML; falling back to alert()');
            alert(message);
            return;
        }
        msgEl.textContent = message;
        modal.style.display = 'block';
        // Pause the timer if we are in the game
        if (typeof pauseTimer === 'function') pauseTimer();
    }

    // Close the window when OK is clicked
    const customAlertOkBtn = document.getElementById('custom-alert-ok');
    if (customAlertOkBtn) {
        customAlertOkBtn.addEventListener('click', function() {
            document.getElementById('custom-alert-modal').style.display = 'none';
            if (typeof resumeTimer === 'function') resumeTimer();
        });
    } else {
        console.error('#custom-alert-ok not found in HTML');
    }

    // Close when clicking outside the window
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('custom-alert-modal');
        if (modal && event.target === modal) {
            modal.style.display = 'none';
            if (typeof resumeTimer === 'function') resumeTimer();
        }
    });

    // Function to set app height dynamically to handle mobile browser UI like Pi Browser's
    function setAppHeight() {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.height = `${window.innerHeight}px`;
        }
    }

    // Set initial height and add listeners for changes
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    setAppHeight(); // Set on initial load

    // Core game elements and state variables
    const pages = document.querySelectorAll('.page');
    const dots = document.querySelectorAll('.dot');
    const leftArrow = document.querySelector('.left-arrow');
    const rightArrow = document.querySelector('.right-arrow');
    let currentPage = 0;
   
    // Timer related variables
    let gameTimer = null;
    let playerTime = 0;
    let initialTime = 0; // NEW: Store initial time for each difficulty
    let timeIncrement = 0;
    let currentPlayer = 'white';
    let isTimerPaused = false;
    let lowTimeWarned = false;
    let oneMinuteWarned = false;
    let refillAttentionShown = false;
   
    // Chess game core variables
    let game = new Chess();
    let selectedSquare = null;
    let validMoves = [];
    let moveHistory = [];
    let isImported = false;
    let promotionFrom = null;
    let promotionTo = null;
    let lastKingClickTime = 0;
   
    // User settings object
    let userSettings = {
        language: 'en',
        theme: 'brown',
        pieceSet: 'neo',
        difficulty: 'easy',
        hints: 1,
        undos: 1,
        threats: 1,
        extraTime: 1,
        soundMuted: false
    };

    // ===================================================================
    // PLAYER PROGRESS (unlocked levels/themes) — synced with the server via
    // the player's Pi identity, so it follows them across devices instead
    // of being tied to a single phone's local storage.
    // ===================================================================
    // Only Easy (level), Brown (theme), and Neo (piece set) are unlocked by
    // default. Everything else is premium: levels unlock by beating the
    // previous one for free, or instantly with a Pi payment; themes and
    // piece sets only unlock via a Pi payment (see the dynamic pricing
    // section below).
    let playerProgress = {
        unlockedLevels: ['easy'],
        unlockedThemes: ['brown'],
        unlockedPieceSets: ['neo']
    };
    let piAccessToken = null;
    let piUserUid = null;
    let piUsername = null;

    // Local cache is used immediately on load (works offline / outside Pi
    // Browser) and is overwritten once the server responds with the
    // authoritative, account-linked version.
    function loadPlayerProgressFromLocalCache() {
        try {
            const saved = localStorage.getItem('chessPiProgress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.unlockedLevels)) playerProgress.unlockedLevels = parsed.unlockedLevels;
                if (Array.isArray(parsed.unlockedThemes)) playerProgress.unlockedThemes = parsed.unlockedThemes;
                if (Array.isArray(parsed.unlockedPieceSets)) playerProgress.unlockedPieceSets = parsed.unlockedPieceSets;
            }
        } catch (e) {
            console.error('loadPlayerProgressFromLocalCache failed:', e);
        }
    }

    function savePlayerProgressToLocalCache() {
        try {
            localStorage.setItem('chessPiProgress', JSON.stringify(playerProgress));
        } catch (e) {
            console.error('savePlayerProgressToLocalCache failed:', e);
        }
    }

    // ===================================================================
    // LOCK SYSTEM: only Easy (level) and Brown (theme) are open by default.
    // Levels unlock sequentially by beating the previous one, OR instantly
    // via a Pi payment. Themes only unlock via a Pi payment.
    // ===================================================================
    const LEVEL_SEQUENCE = ['easy', 'medium', 'hard', 'expert'];
    const LOCKABLE_THEMES = ['green', 'pink', 'blue'];
    // Piece sets: Neo (Chess.com's default look) is free/unlocked from the
    // start; Wood, Glass, and Marble are premium. All four are served from
    // Chess.com's own public piece CDN, the same one already used for Neo,
    // so no new asset hosting is needed.
    const LOCKABLE_PIECE_SETS = ['wood', 'glass', 'marble'];

    // ===================================================================
    // DYNAMIC PI PRICING
    // ===================================================================
    // All prices are fixed in USD; the equivalent Pi amount is computed at
    // request time from the live PI/USD market price (fetched from
    // /.netlify/functions/get-pi-price, which itself reads CoinGecko and,
    // if configured, CoinMarketCap). This means the Pi price the player
    // pays always tracks the real market rate instead of being a stale
    // hardcoded number of Pi.
    const UNLOCK_PRICE_USD = 0.70;   // single theme / level / piece-set unlock
    const REFILL_PRICE_USD = 0.01;  // "Refill" feature top-up (no discount ever applies)
    const BUNDLE_DISCOUNT_RATE = 0.15; // 15% off when buying an entire remaining category at once

    let piUsdPrice = null;        // last known PI → USD rate
    let piUsdPriceFetchedAt = 0;  // when it was last fetched (ms epoch)
    const PI_PRICE_CACHE_MS = 5 * 60 * 1000; // reuse a fetched price for 5 minutes
    // Only used the very first time, if the live price endpoint hasn't
    // answered yet by the time a price needs to be shown/charged.
    const PI_PRICE_HARDCODED_FALLBACK = 0.10;

    // Fetches (and caches) the current PI/USD price. Tries, in order:
    //   1) CoinGecko directly from the browser — this is a public, CORS-open
    //      endpoint, so it works no matter where this page is hosted
    //      (GitHub Pages, Netlify, anywhere) since it's not a proxy call.
    //   2) Our own /.netlify/functions/get-pi-price endpoint — only actually
    //      reachable if this site happens to be deployed on Netlify itself;
    //      on GitHub Pages (or any non-Netlify host) this 404s immediately,
    //      which is fine because step 1 already covers it.
    //   3) The last known price, or a conservative hardcoded guess.
    // Safe to call often — it no-ops and returns the cached value if it's
    // still fresh. Never throws.
    async function fetchPiUsdPrice(forceRefresh) {
        const now = Date.now();
        if (!forceRefresh && piUsdPrice && (now - piUsdPriceFetchedAt) < PI_PRICE_CACHE_MS) {
            return piUsdPrice;
        }
        try {
            const response = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd',
                { signal: AbortSignal.timeout(8000) }
            );
            if (!response.ok) throw new Error('CoinGecko returned status ' + response.status);
            const data = await response.json();
            const price = data && data['pi-network'] && data['pi-network'].usd;
            if (typeof price === 'number' && price > 0) {
                piUsdPrice = price;
                piUsdPriceFetchedAt = now;
                return piUsdPrice;
            }
            throw new Error('CoinGecko returned an invalid price');
        } catch (directErr) {
            console.error('fetchPiUsdPrice: direct CoinGecko call failed, trying Netlify function:', directErr);
        }
        try {
            const response = await fetch('/.netlify/functions/get-pi-price', {
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) throw new Error('get-pi-price returned status ' + response.status);
            const data = await response.json();
            if (typeof data.price === 'number' && data.price > 0) {
                piUsdPrice = data.price;
                piUsdPriceFetchedAt = now;
            } else {
                throw new Error('get-pi-price returned an invalid price');
            }
        } catch (err) {
            console.error('fetchPiUsdPrice failed, using last known/fallback price:', err);
            if (!piUsdPrice) {
                piUsdPrice = PI_PRICE_HARDCODED_FALLBACK;
                piUsdPriceFetchedAt = now;
            }
        }
        return piUsdPrice;
    }

    // Converts a USD amount into Pi using the cached rate, rounded to 4
    // decimal places (Pi supports fractional amounts — the existing refill
    // flow already charged 0.10 π). If no price has been fetched yet at all
    // (e.g. called before the app finished its first load), this falls back
    // to the hardcoded rate so the UI never shows something broken like NaN.
    function usdToPi(usdAmount) {
        const rate = piUsdPrice || PI_PRICE_HARDCODED_FALLBACK;
        const piAmount = usdAmount / rate;
        return Math.round(piAmount * 10000) / 10000;
    }

    // Single-item unlock price (theme, level, or piece set), in Pi, at the
    // current market rate.
    function getUnlockPricePi() {
        return usdToPi(UNLOCK_PRICE_USD);
    }
    // Bundle price for buying every remaining locked item in one category
    // (all remaining themes / levels / piece sets) at once: the sum of the
    // per-item USD price, minus the flat bundle discount, converted to Pi.
    function getBundlePricePi(remainingCount) {
        const totalUsd = UNLOCK_PRICE_USD * remainingCount;
        const discountedUsd = totalUsd * (1 - BUNDLE_DISCOUNT_RATE);
        return usdToPi(discountedUsd);
    }
    // "Refill" feature top-up price, in Pi. Flat $0.01 — never discounted,
    // regardless of how it's purchased.
    function getRefillPricePi() {
        return usdToPi(REFILL_PRICE_USD);
    }

    function isLevelUnlocked(level) {
        return playerProgress.unlockedLevels.includes(level);
    }
    function isThemeUnlocked(theme) {
        return playerProgress.unlockedThemes.includes(theme);
    }
    function isPieceSetUnlocked(pieceSet) {
        return playerProgress.unlockedPieceSets.includes(pieceSet);
    }
    function getNextLevel(currentLevel) {
        const idx = LEVEL_SEQUENCE.indexOf(currentLevel);
        if (idx === -1 || idx === LEVEL_SEQUENCE.length - 1) return null;
        return LEVEL_SEQUENCE[idx + 1];
    }
    const LOCKABLE_LEVELS = LEVEL_SEQUENCE.filter(l => l !== 'easy'); // medium, hard, expert

    // A player only ever pays for what's still locked: the bundle price is
    // always "$0.70 × however many items are still locked in this category,
    // minus 15%" — so buying 2 remaining items at once is never worse value
    // than buying 3 would have been.
    function getRemainingLockedThemes() {
        return LOCKABLE_THEMES.filter(t => !isThemeUnlocked(t));
    }
    function getRemainingLockedLevels() {
        return LOCKABLE_LEVELS.filter(l => !isLevelUnlocked(l));
    }
    function getRemainingLockedPieceSets() {
        return LOCKABLE_PIECE_SETS.filter(p => !isPieceSetUnlocked(p));
    }

    // Refreshes the lock icon/dimming on every difficulty & theme card to
    // match the current playerProgress. Safe to call anytime (page load,
    // after a payment, after a win, after the server sync resolves, etc.).
    function renderLockState() {
        document.querySelectorAll('.option-card[data-difficulty]').forEach((card) => {
            const level = card.getAttribute('data-difficulty');
            card.classList.toggle('locked', !isLevelUnlocked(level));
        });
        document.querySelectorAll('.option-card[data-theme]').forEach((card) => {
            const theme = card.getAttribute('data-theme');
            card.classList.toggle('locked', !isThemeUnlocked(theme));
        });
        document.querySelectorAll('.option-card[data-piece-set]').forEach((card) => {
            const pieceSet = card.getAttribute('data-piece-set');
            card.classList.toggle('locked', !isPieceSetUnlocked(pieceSet));
        });

        // Safety net: if the currently-selected difficulty somehow isn't
        // unlocked (e.g. stale saved settings), fall back to Easy so the
        // player can never get stuck on a locked level.
        if (!isLevelUnlocked(userSettings.difficulty)) {
            userSettings.difficulty = 'easy';
        }
        if (!isThemeUnlocked(userSettings.theme)) {
            userSettings.theme = 'brown';
        }
        if (!isPieceSetUnlocked(userSettings.pieceSet)) {
            userSettings.pieceSet = 'neo';
        }
    }

    // Merges newly-unlocked items into playerProgress (no duplicates),
    // updates the local cache immediately, and syncs to the server in the
    // background if we have a verified Pi identity.
    function grantProgress({ levels = [], themes = [], pieceSets = [] } = {}) {
        let changed = false;
        levels.forEach((lvl) => {
            if (!playerProgress.unlockedLevels.includes(lvl)) {
                playerProgress.unlockedLevels.push(lvl);
                changed = true;
            }
        });
        themes.forEach((thm) => {
            if (!playerProgress.unlockedThemes.includes(thm)) {
                playerProgress.unlockedThemes.push(thm);
                changed = true;
            }
        });
        pieceSets.forEach((ps) => {
            if (!playerProgress.unlockedPieceSets.includes(ps)) {
                playerProgress.unlockedPieceSets.push(ps);
                changed = true;
            }
        });
        if (changed) {
            savePlayerProgressToLocalCache();
            syncProgressToServer();
            renderLockState();
        }
        return changed;
    }

    // Fetches the player's server-saved progress (requires a verified Pi
    // identity) and merges it locally. Safe to call even if the player
    // isn't authenticated yet — it just does nothing in that case.
    async function fetchProgressFromServer() {
        if (!piAccessToken) return;
        try {
            const response = await fetch('/.netlify/functions/get-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: piAccessToken }),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error('get-progress returned status ' + response.status);
            const serverProgress = await response.json();

            // Merge (union) with whatever we already have locally, so an
            // unlock made offline/pre-login is never lost.
            (serverProgress.unlockedLevels || []).forEach((lvl) => {
                if (!playerProgress.unlockedLevels.includes(lvl)) playerProgress.unlockedLevels.push(lvl);
            });
            (serverProgress.unlockedThemes || []).forEach((thm) => {
                if (!playerProgress.unlockedThemes.includes(thm)) playerProgress.unlockedThemes.push(thm);
            });
            (serverProgress.unlockedPieceSets || []).forEach((ps) => {
                if (!playerProgress.unlockedPieceSets.includes(ps)) playerProgress.unlockedPieceSets.push(ps);
            });
            savePlayerProgressToLocalCache();
            renderLockState();
            console.log('Player progress loaded from server:', playerProgress);
        } catch (err) {
            console.error('fetchProgressFromServer failed (using local cache only):', err);
        }
    }

    // Pushes the current local progress up to the server. Safe to call
    // anytime; silently does nothing if we don't have a verified identity.
    async function syncProgressToServer() {
        if (!piAccessToken) return;
        try {
            const response = await fetch('/.netlify/functions/save-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: piAccessToken, progress: playerProgress }),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error('save-progress returned status ' + response.status);
            const savedProgress = await response.json();
            // Adopt the server's merged result as the new source of truth.
            playerProgress = {
                unlockedLevels: savedProgress.unlockedLevels || playerProgress.unlockedLevels,
                unlockedThemes: savedProgress.unlockedThemes || playerProgress.unlockedThemes,
                unlockedPieceSets: savedProgress.unlockedPieceSets || playerProgress.unlockedPieceSets
            };
            savePlayerProgressToLocalCache();
            renderLockState();
        } catch (err) {
            console.error('syncProgressToServer failed (progress stays cached locally for now):', err);
        }
    }

    // Silently authenticates with Pi (if available) and pulls the player's
    // saved progress. Wrapped so it never blocks or breaks the game if Pi
    // Browser isn't available (e.g. testing in a regular browser) or the
    // player declines the permission prompt.
    async function initializePiIdentityAndProgress() {
        loadPlayerProgressFromLocalCache(); // instant, works offline
        renderLockState();
        fetchPiUsdPrice().catch(() => {}); // warm the price cache in the background; never blocks init
        try {
            if (typeof Pi === 'undefined') return; // not running inside Pi Browser
            const auth = await Pi.authenticate(['payments'], resolveIncompletePayment);
            if (auth && auth.accessToken && auth.user) {
                piAccessToken = auth.accessToken;
                piUserUid = auth.user.uid;
                piUsername = auth.user.username || null;
                updatePlayerNameDisplay();
                await fetchProgressFromServer();
            }
        } catch (err) {
            console.error('Pi identity init failed (continuing with local progress only):', err);
        }
    }

    // Shows the authenticated Pi Network username in place of "Guest"
    // wherever the player's name is displayed. Falls back to the normal
    // "Guest" translation if no Pi username is available (e.g. testing
    // outside Pi Browser, or the player declined the permission prompt).
    function updatePlayerNameDisplay() {
        const el = document.getElementById('player-text');
        if (el) el.innerHTML = piUsername || i18next.t('whiteLabel');
    }
   
    // Statistics variables
    let gameStats = {
        startTime: null,
        totalMoves: 0,
        hintsUsed: 0,
        undosUsed: 0,
        threatsUsed: 0,
        extraTimeUsed: 0,
        gameResult: '',
        gameDuration: 0,
        difficulty: ''
    };

    // Comprehensive statistics storage - ENHANCED VERSION FROM script (8).js
    let comprehensiveStats = {
        overall: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            winRate: 0,
            totalHintsUsed: 0,
            totalUndosUsed: 0,
            totalThreatsUsed: 0,
            totalExtraTimeUsed: 0,
            currentStreak: 0,
            bestStreak: 0
        },
        byDifficulty: {
            easy: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
            medium: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
            hard: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
            expert: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null }
        },
        currentGame: {
            result: '',
            timeUsed: '',
            moves: 0,
            difficulty: '',
            hintsUsed: 0,
            undosUsed: 0,
            threatsUsed: 0,
            extraTimeUsed: 0
        }
    };
   
    // Sound settings and objects with Lazy Caching (Method 2)
    let isMuted = false;
    const audioCache = {};
    const sounds = new Proxy({}, {
        get: function(target, name) {
            if (!audioCache[name]) {
                audioCache[name] = new Howl({ src: [`sounds/${name}.mp3`] });
            }
            return audioCache[name];
        }
    });
   
    // Initialize i18next for internationalization
    i18next.init({
        lng: userSettings.language,
        fallbackLng: 'en',
        resources: {
            en: {
                translation: {
                    welcomeTitle: "Chess Pi",
                    welcomeSubtitle: "Your mind is the algorithm. The board is your domain. Play, Calculate, Conquer.",
                    chooseTheme: "Choose Your Board Theme",
                    selectLanguage: "Select Your Language",
                    chooseDifficulty: "Choose Difficulty Level",
                    whitesTurn: "White's Turn",
                    blacksTurn: "Bot AI",
                    whiteLabel: "Guest",
                    gameInProgress: "Game in progress",
                    hint: "Hint",
                    undo: "Undo",
                    threats: "Threats",
                    extraTime: "Extra Time",
                    refill: "Refill",
                    help: "Help",
                    exportPGN: "Export PGN",
                    importPGN: "Import PGN",
                    timeLeft: "Time Left"
                }
            },
            ar: {
                translation: {
                    welcomeTitle: "شطرنج باي",
                    welcomeSubtitle: "عقلك هو الخوارزمية. اللوحة هي مجالك. العب، احسب, انتصر.",
                    chooseTheme: "اختر ثيم اللوحة",
                    selectLanguage: "اختر لغتك",
                    chooseDifficulty: "اختر مستوى الصعوبة",
                    whitesTurn: "دور الأبيض",
                    blacksTurn: "بوت AI",
                    whiteLabel: "ضيف",
                    gameInProgress: "اللعبة جارية",
                    hint: "تلميح",
                    undo: "تراجع",
                    threats: "تهديدات",
                    extraTime: "وقت إضافي",
                    refill: "إعادة تعبئة",
                    help: "مساعدة",
                    exportPGN: "تصدير PGN",
                    importPGN: "استيراد PGN",
                    timeLeft: "الوقت المتبقي"
                }
            }
            // Add more languages: fr, es, zh, ru with similar structures
        }
    }).then(() => {
        updateTranslations();
    }).catch(err => console.error('i18next init failed:', err));
   
    // Function to update all translatable elements in the UI
    function updateTranslations() {
        try {
            const q = (sel) => document.querySelector(sel);
            if (q('.welcome-title')) q('.welcome-title').innerHTML = i18next.t('welcomeTitle');
            if (q('.welcome-subtitle')) q('.welcome-subtitle').innerHTML = i18next.t('welcomeSubtitle');
            if (q('.theme-page .page-title')) q('.theme-page .page-title').innerHTML = i18next.t('chooseTheme');
            if (q('.difficulty-page .page-title')) q('.difficulty-page .page-title').innerHTML = i18next.t('chooseDifficulty');
            if (document.getElementById('bot-text')) document.getElementById('bot-text').innerHTML = i18next.t('blacksTurn');
            if (document.getElementById('player-text')) updatePlayerNameDisplay();
            if (document.getElementById('game-status')) document.getElementById('game-status').innerHTML = i18next.t('gameInProgress');
            if (q('.game-timer-label')) q('.game-timer-label').innerHTML = i18next.t('timeLeft');

            // Update control spans
            const setSpan = (sel, key) => { const el = q(sel); if (el) el.innerHTML = i18next.t(key); };
            setSpan('#hint-btn span', 'hint');
            setSpan('#undo-btn span', 'undo');
            setSpan('#threats-btn span', 'threats');
            setSpan('#extra-time-btn span', 'extraTime');
            setSpan('#refill-btn span', 'refill');
            setSpan('#export-pgn-btn span', 'exportPGN');
            setSpan('#import-pgn-btn span', 'importPGN');

            // Update modals and other texts as needed
            if (userSettings.language === 'ar') {
                document.body.dir = 'rtl';
            } else {
                document.body.dir = 'ltr';
            }
        } catch (e) {
            console.error('updateTranslations error:', e);
        }
    }
   
    // Start the welcome page progress bar
    const progressBar = document.getElementById('welcome-progress');
    if (progressBar) {
        progressBar.style.width = '100%';
    } else {
        console.error('#welcome-progress not found in HTML');
    }
   
    // (Redundant safety-net) Automatic transition after 5 seconds — kept in case the
    // early guaranteed timer above was for some reason skipped.
    setTimeout(() => {
        try { switchPage(1); } catch (e) { console.error('switchPage(1) failed:', e); }
    }, 5000);
   
    // Setup navigation dots
    dots.forEach(dot => {
        dot.addEventListener('click', function() {
            const pageIndex = parseInt(this.getAttribute('data-page'));
            switchPage(pageIndex);
        });
    });
   
    // Setup theme selection
    const themeOptions = document.querySelectorAll('.theme-page .option-card');
    themeOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedTheme = this.getAttribute('data-theme');

            if (this.classList.contains('locked')) {
                showUnlockModal('theme', clickedTheme);
                return;
            }

            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            themeOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            userSettings.theme = clickedTheme;
            updateCurrentSettings();
            applyTheme(userSettings.theme);
            setTimeout(() => {
                switchPage(2);
            }, 500);
        });
    });
   
    // Setup piece set selection
    const pieceSetOptions = document.querySelectorAll('.pieceset-page .option-card');
    pieceSetOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedPieceSet = this.getAttribute('data-piece-set');

            if (this.classList.contains('locked')) {
                showUnlockModal('pieceset', clickedPieceSet);
                return;
            }

            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            pieceSetOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            userSettings.pieceSet = clickedPieceSet;
            updateCurrentSettings();
            updateBoard(); // live-preview the new piece set immediately
            setTimeout(() => {
                switchPage(3);
            }, 500);
        });
    });
   
    // Setup difficulty selection
    const difficultyOptions = document.querySelectorAll('.difficulty-page .option-card');
    difficultyOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedDifficulty = this.getAttribute('data-difficulty');

            if (this.classList.contains('locked')) {
                showUnlockModal('level', clickedDifficulty);
                return;
            }

            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            difficultyOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            userSettings.difficulty = clickedDifficulty;
            updateAttemptsBasedOnDifficulty();
            updateCurrentSettings();
            checkRefillButtonState();

            // Prewarm Stockfish as soon as a difficulty is picked (all levels
            // now use it), so it has extra time to finish loading in the
            // background before the bot's first move is actually needed.
            if (typeof StockfishEngine !== 'undefined') {
                try {
                    StockfishEngine.init();
                } catch (e) {
                    console.error('Stockfish prewarm failed:', e);
                }
            }

            setTimeout(() => {
                switchPage(4);
            }, 500);
        });
    });
   
    // Setup navigation arrows
    if (leftArrow) {
        leftArrow.addEventListener('click', function() {
            if (currentPage > 0) {
                switchPage(currentPage - 1);
            }
        });
    } else {
        console.error('.left-arrow not found in HTML');
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', function() {
            if (currentPage < pages.length - 1) {
                switchPage(currentPage + 1);
            }
        });
    } else {
        console.error('.right-arrow not found in HTML');
    }
   
    // Function to update feature attempts based on difficulty level
    function updateAttemptsBasedOnDifficulty() {
        let baseHints, baseUndos, baseThreats, baseExtraTime;
       
        switch (userSettings.difficulty) {
            case 'easy':
                baseHints = 1;
                baseUndos = 1;
                baseThreats = 1;
                baseExtraTime = 0;
                break;
            case 'medium':
                baseHints = 1;
                baseUndos = 1;
                baseThreats = 1;
                baseExtraTime = 1;
                break;
            case 'hard':
                baseHints = 1;
                baseUndos = 1;
                baseThreats = 1;
                baseExtraTime = 1;
                break;
            case 'expert':
                baseHints = 2;
                baseUndos = 2;
                baseThreats = 2;
                baseExtraTime = 2;
                break;
            default:
                baseHints = 1;
                baseUndos = 1;
                baseThreats = 1;
                baseExtraTime = 1;
        }
       
        userSettings.hints = baseHints;
        userSettings.undos = baseUndos;
        userSettings.threats = baseThreats;
        userSettings.extraTime = baseExtraTime;
       
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setText('hints-count', userSettings.hints);
        setText('undos-count', userSettings.undos);
        setText('threats-count', userSettings.threats);
        setText('extra-time-count', userSettings.extraTime);
       
        updateFeatureButtonsState();
    }
   
    // Motivational messages shown next to the Bot AI indicator to nudge the
    // player toward using the Pi refill. A random one is picked each time,
    // and it fades away automatically after a few seconds.
    // Easy mode has no clock and never grants the Extra Time feature at
    // all, so its depleted-message set only ever refers to Hint/Undo/Threats
    // — mentioning "time" there would be misleading.
    const PROMO_MESSAGES_DEPLETED_EASY = [
        "0 hints, 0 undos, 0 threat reveals left! Refill with Pi to keep your edge 🔥",
        "All your help features are used up! Tap Refill to stay in the game 💜",
        "Out of hints, undos, and threats! A quick Pi refill gets you back in action."
    ];
    const PROMO_MESSAGES_DEPLETED = [
        "0 hints, 0 undos, no extra time left! Recharge now and don't miss out!",
        "All boosts used up! Refill with Pi to keep your edge 🔥",
        "Out of hints & undos! Tap Refill to stay in the game 💜",
        "Features depleted! A quick Pi refill gets you back in action."
    ];
    const PROMO_MESSAGES_LOW_TIME = [
        "⏰ Less than a minute left! Grab extra time now!",
        "Clock's almost out! Refill for extra time before it's too late ⏳",
        "Only seconds left — don't let the bot win on time!",
        "Time's nearly up! One tap of Refill buys you more."
    ];

    let promoMessageTimer = null;
    function showPromoMessage(messages) {
        const promoEl = document.getElementById('promo-message');
        if (!promoEl) return;

        const text = messages[Math.floor(Math.random() * messages.length)];
        promoEl.textContent = text;

        // Restart the visible state/timer even if one is already showing.
        if (promoMessageTimer) clearTimeout(promoMessageTimer);
        promoEl.classList.add('visible');
        promoMessageTimer = setTimeout(() => {
            promoEl.classList.remove('visible');
            promoMessageTimer = null;
        }, 5000);
    }
   
    // Function to check and update refill button state
    function checkRefillButtonState() {
        const refillButton = document.getElementById('refill-btn');
        if (!refillButton) return;
       
        const allDepleted = userSettings.hints <= 0 && userSettings.undos <= 0 && userSettings.threats <= 0 && userSettings.extraTime <= 0;

        if (allDepleted) {
            refillButton.classList.remove('disabled');
            refillButton.classList.add('attention');
            if (!refillAttentionShown) {
                refillAttentionShown = true;
                showPromoMessage(userSettings.difficulty === 'easy' ? PROMO_MESSAGES_DEPLETED_EASY : PROMO_MESSAGES_DEPLETED);
            }
        } else {
            refillButton.classList.add('disabled');
            refillButton.classList.remove('attention');
            refillAttentionShown = false;
        }
    }
   
    // Function to update state of feature buttons
    function updateFeatureButtonsState() {
        const hintBtn = document.getElementById('hint-btn');
        const undoBtn = document.getElementById('undo-btn');
        const threatsBtn = document.getElementById('threats-btn');
        const extraTimeBtn = document.getElementById('extra-time-btn');
       
        if (hintBtn) hintBtn.classList.toggle('disabled', userSettings.hints <= 0);
        if (undoBtn) undoBtn.classList.toggle('disabled', userSettings.undos <= 0);
        if (threatsBtn) threatsBtn.classList.toggle('disabled', userSettings.threats <= 0);
       
        // Extra time button is disabled in easy mode or when no extra time is available
        if (extraTimeBtn) {
            if (userSettings.difficulty === 'easy') {
                extraTimeBtn.classList.add('disabled');
                extraTimeBtn.style.display = 'none'; // Hide in easy mode
            } else {
                extraTimeBtn.style.display = 'flex';
                extraTimeBtn.classList.toggle('disabled', userSettings.extraTime <= 0);
            }
        }
       
        checkRefillButtonState();
    }
   
    // Pi SDK Initialization
    try {
        if (typeof Pi !== 'undefined') {
            Pi.init({ version: "2.0", sandbox: false }); // Change sandbox to false for production
        } else {
            console.error('Pi SDK script not loaded — payment features will be unavailable.');
        }
    } catch (e) {
        console.error('Pi.init failed:', e);
    }

    // Start syncing the player's account-linked progress in the background.
    // This never blocks the game — it uses the local cache immediately and
    // upgrades to the server's version whenever it's ready.
    initializePiIdentityAndProgress();

    // Called by the Pi SDK if it finds a payment from a previous session
    // that was never finished. Without resolving it here, Pi Network will
    // keep blocking ALL new payments ("Pending Payment Found") until this
    // one is handled.
    async function resolveIncompletePayment(payment) {
        console.log('Incomplete payment found, attempting to auto-resolve it:', payment);
        const hasTxid = payment && payment.transaction && payment.transaction.txid;

        async function cancelPayment() {
            const response = await fetch('/.netlify/functions/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId: payment.identifier }),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error('Cancel endpoint returned status ' + response.status);
            console.log('Previously pending payment cancelled successfully.');
        }

        try {
            if (hasTxid) {
                // The payment actually went through on-chain — tell our
                // backend to mark it complete.
                const response = await fetch('/.netlify/functions/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentId: payment.identifier,
                        txid: payment.transaction.txid
                    }),
                    signal: AbortSignal.timeout(10000)
                });
                if (!response.ok) throw new Error('Complete endpoint returned status ' + response.status);
                console.log('Previously pending payment completed successfully.');
            } else {
                // No on-chain transaction was ever made for this payment —
                // it was likely already approved in a previous session that
                // got interrupted. Re-approving would fail (Pi rejects a
                // second approval), so we cancel it instead to unblock the
                // account for new payments.
                await cancelPayment();
            }
        } catch (err) {
            console.error('Primary resolution failed, trying cancel as a fallback:', err);
            try {
                await cancelPayment();
            } catch (err2) {
                console.error('Fallback cancel also failed:', err2);
                showCustomAlert('في عملية دفع سابقة عالقة وما قدرنا نحلّها تلقائياً. جرب تسكّر التطبيق وتفتحه من جديد، أو حاول لاحقاً.');
            }
        }
    }

    async function authenticate() {
        const scopes = ['payments'];
        const auth = await Pi.authenticate(scopes, resolveIncompletePayment);
        return auth;
    }

    // Prevents double-tapping "Refill" or "Pay with Pi" from firing two
    // separate Pi.createPayment() calls (which could open two payment
    // prompts, or in the worst case, risk a double charge).
    let isProcessingPayment = false;
    function setPaymentButtonsBusy(busy) {
        [
            document.getElementById('refill-btn'),
            document.getElementById('unlock-pay-btn'),
            document.getElementById('unlock-all-btn')
        ].forEach(el => {
            if (!el) return;
            el.style.pointerEvents = busy ? 'none' : '';
            el.style.opacity = busy ? '0.6' : '';
            if ('disabled' in el) el.disabled = busy;
        });
    }

    async function processPiPayment() {
        if (isProcessingPayment) return;
        isProcessingPayment = true;
        setPaymentButtonsBusy(true);
        try {
            await authenticate();
            // Refresh the Pi/USD rate right before charging so the amount
            // reflects the current market price, not a stale cached one.
            await fetchPiUsdPrice(true);
            const refillPrice = getRefillPricePi();

            const paymentData = {
                amount: refillPrice,
                memo: "features Refill purchase",
                metadata: { productId: "refill" }
            };

            const callbacks = {
                onReadyForServerApproval: async function(paymentId) {
                    console.log("onReadyForServerApproval triggered with paymentId:", paymentId);
                    try {
                        const response = await fetch('/.netlify/functions/approve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId }),
                            signal: AbortSignal.timeout(10000)  // Timeout 10 seconds
                        });
                        if (!response.ok) throw new Error('Approval failed');
                        const data = await response.json();
                        console.log('Approval success:', data);
                    } catch (error) {
                        console.error('Approval error:', error);
                        showCustomAlert('Approval failed: ' + error.message);
                        // Do not resume timer here; it stays paused until user clicks OK
                    }
                },
                onReadyForServerCompletion: async function(paymentId, txid) {
                    console.log("onReadyForServerCompletion triggered with paymentId:", paymentId, "txid:", txid);
                    try {
                        const response = await fetch('/.netlify/functions/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId, txid }),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!response.ok) throw new Error('Completion failed');
                        const data = await response.json();
                        console.log('Completion success:', data);
                        // Refill features
                        updateAttemptsBasedOnDifficulty();
                        updateCurrentSettings();
                        updateFeatureButtonsState();
                        showCustomAlert("Payment successful! All features have been refilled!");
                        // Do not resume timer here; it stays paused until user clicks OK
                    } catch (error) {
                        console.error('Completion error:', error);
                        showCustomAlert('Completion failed: ' + error.message);
                        // Do not resume timer here; it stays paused until user clicks OK
                    } finally {
                        isProcessingPayment = false;
                        setPaymentButtonsBusy(false);
                    }
                },
                onCancel: function(paymentId) {
                    console.log("Payment canceled:", paymentId);
                    showCustomAlert("Payment canceled.");
                    // Do not resume timer here; it stays paused until user clicks OK
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                },
                onError: function(error, payment) {
                    console.error("Payment error:", error, payment);
                    showCustomAlert("Payment error: " + error.message);
                    // Do not resume timer here; it stays paused until user clicks OK
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                }
            };

            pauseTimer();
            Pi.createPayment(paymentData, callbacks);
        } catch (error) {
            console.error("Authentication error:", error);
            showCustomAlert("Authentication failed: " + error.message);
            // Do not resume timer here; it stays paused until user clicks OK
            isProcessingPayment = false;
            setPaymentButtonsBusy(false);
        }
    }

    // Setup refill button to trigger Pi payment
    const refillBtnEl = document.getElementById('refill-btn');
    if (refillBtnEl) {
        refillBtnEl.addEventListener('click', function() {
            if (isAIThinking || isProcessingPayment) return;
            if (userSettings.hints <= 0 && userSettings.undos <= 0 && userSettings.threats <= 0 && userSettings.extraTime <= 0) {
                processPiPayment();
            } else {
                showCustomAlert("You can only use Refill when all features are depleted.");
            }
        });
    }

    // ===================================================================
    // UNLOCK MODAL (paying 10 Pi to unlock a locked level or theme)
    // ===================================================================
    const UNLOCK_DISPLAY_NAMES = {
        medium: 'Medium', hard: 'Hard', expert: 'Expert',
        green: 'Green', pink: 'Pink', blue: 'Blue',
        wood: 'Wood', glass: 'Glass', marble: 'Marble'
    };
    let pendingUnlock = null; // { type: 'level' | 'theme', name: string }

    // Formats a Pi amount for display: up to 4 decimal places, trimmed of
    // trailing zeros (e.g. 1.75, 0.4286, 3).
    function formatPiAmount(amount) {
        return (Math.round(amount * 10000) / 10000).toString();
    }

    async function showUnlockModal(type, name) {
        pendingUnlock = { type, name };
        const modal = document.getElementById('unlock-modal');
        const title = document.getElementById('unlock-modal-title');
        const desc = document.getElementById('unlock-modal-desc');
        const priceText = document.getElementById('unlock-price-text');
        const unlockAllBtn = document.getElementById('unlock-all-btn');
        const unlockAllText = document.getElementById('unlock-all-text');
        if (!modal || !title || !desc || !priceText) return;

        // Make sure we have a reasonably fresh PI/USD rate before showing
        // any price (uses the cached value if it's still fresh, so this is
        // usually instant).
        await fetchPiUsdPrice();

        let price = getUnlockPricePi();
        if (type === 'all-levels') {
            const remaining = getRemainingLockedLevels();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Levels';
            desc.textContent = 'Unlock Medium, Hard, and Expert difficulty all at once with Pi.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else if (type === 'all-themes') {
            const remaining = getRemainingLockedThemes();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Themes';
            desc.textContent = 'Unlock Green, Pink, and Blue board themes all at once with Pi.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else if (type === 'all-piecesets') {
            const remaining = getRemainingLockedPieceSets();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Piece Sets';
            desc.textContent = 'Unlock Wood, Glass, and Marble piece sets all at once with Pi.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else {
            const displayName = UNLOCK_DISPLAY_NAMES[name] || name;
            if (type === 'level') {
                title.textContent = `${displayName} Difficulty is Locked`;
                desc.textContent = `Beat the previous level to unlock ${displayName} for free, or unlock it instantly with Pi.`;
                const remaining = getRemainingLockedLevels();
                if (unlockAllBtn) {
                    // Only worth offering "unlock the rest" when there's
                    // actually more than just this one item left locked.
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-levels';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Levels — ${formatPiAmount(bundlePrice)} π`;
                }
            } else if (type === 'theme') {
                title.textContent = `${displayName} Theme is Locked`;
                desc.textContent = `Unlock the ${displayName} board theme instantly with Pi.`;
                const remaining = getRemainingLockedThemes();
                if (unlockAllBtn) {
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-themes';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Themes — ${formatPiAmount(bundlePrice)} π`;
                }
            } else {
                title.textContent = `${displayName} Piece Set is Locked`;
                desc.textContent = `Unlock the ${displayName} piece set instantly with Pi. It works with any board theme.`;
                const remaining = getRemainingLockedPieceSets();
                if (unlockAllBtn) {
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-piecesets';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Piece Sets — ${formatPiAmount(bundlePrice)} π`;
                }
            }
        }
        priceText.textContent = `Unlock for ${formatPiAmount(price)} \u03C0`;

        modal.style.display = 'block';
    }

    async function processUnlockPayment() {
        if (!pendingUnlock || isProcessingPayment) return;
        isProcessingPayment = true;
        setPaymentButtonsBusy(true);
        const { type, name } = pendingUnlock;
        const isBundle = type === 'all-levels' || type === 'all-themes' || type === 'all-piecesets';

        // Refresh the Pi/USD rate right before charging so the amount
        // reflects the current market price, not whatever was cached when
        // the modal first opened.
        await fetchPiUsdPrice(true);

        // Recompute fresh (never trust a stale displayed price) so the
        // amount actually charged always matches what's really still
        // locked at this exact moment.
        let price = getUnlockPricePi();
        let levelsToGrant = [];
        let themesToGrant = [];
        let pieceSetsToGrant = [];
        if (type === 'all-levels') {
            levelsToGrant = getRemainingLockedLevels();
            price = getBundlePricePi(levelsToGrant.length);
        } else if (type === 'all-themes') {
            themesToGrant = getRemainingLockedThemes();
            price = getBundlePricePi(themesToGrant.length);
        } else if (type === 'all-piecesets') {
            pieceSetsToGrant = getRemainingLockedPieceSets();
            price = getBundlePricePi(pieceSetsToGrant.length);
        } else if (type === 'level') {
            levelsToGrant = [name];
        } else if (type === 'theme') {
            themesToGrant = [name];
        } else if (type === 'pieceset') {
            pieceSetsToGrant = [name];
        }

        // Nothing left to actually unlock (e.g. the player unlocked the
        // rest in another tab/device since this modal was opened) — bail
        // out instead of charging for an empty bundle.
        if (isBundle && levelsToGrant.length === 0 && themesToGrant.length === 0 && pieceSetsToGrant.length === 0) {
            isProcessingPayment = false;
            setPaymentButtonsBusy(false);
            const modal = document.getElementById('unlock-modal');
            if (modal) modal.style.display = 'none';
            showCustomAlert('Everything in that category is already unlocked!');
            return;
        }

        const displayName = isBundle
            ? (type === 'all-levels' ? `${levelsToGrant.length} Remaining Level(s)`
                : type === 'all-themes' ? `${themesToGrant.length} Remaining Theme(s)`
                : `${pieceSetsToGrant.length} Remaining Piece Set(s)`)
            : (UNLOCK_DISPLAY_NAMES[name] || name);

        try {
            await authenticate();

            const itemCount = isBundle ? (levelsToGrant.length || themesToGrant.length || pieceSetsToGrant.length) : 1;
            const usdCharged = isBundle
                ? UNLOCK_PRICE_USD * itemCount * (1 - BUNDLE_DISCOUNT_RATE)
                : UNLOCK_PRICE_USD;
            const paymentData = {
                amount: price,
                memo: `Unlock ${displayName}`,
                metadata: { productId: isBundle ? `unlock_${type}` : `unlock_${type}_${name}`, usdPrice: usdCharged }
            };

            const callbacks = {
                onReadyForServerApproval: async function(paymentId) {
                    console.log('Unlock onReadyForServerApproval:', paymentId);
                    try {
                        const response = await fetch('/.netlify/functions/approve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId }),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!response.ok) throw new Error('Approval failed');
                    } catch (error) {
                        console.error('Unlock approval error:', error);
                        showCustomAlert('Approval failed: ' + error.message);
                    }
                },
                onReadyForServerCompletion: async function(paymentId, txid) {
                    console.log('Unlock onReadyForServerCompletion:', paymentId, txid);
                    try {
                        const response = await fetch('/.netlify/functions/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId, txid }),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!response.ok) throw new Error('Completion failed');

                        if (levelsToGrant.length) grantProgress({ levels: levelsToGrant });
                        if (themesToGrant.length) grantProgress({ themes: themesToGrant });
                        if (pieceSetsToGrant.length) grantProgress({ pieceSets: pieceSetsToGrant });

                        const modal = document.getElementById('unlock-modal');
                        if (modal) modal.style.display = 'none';
                        showCustomAlert(`${displayName} unlocked! Enjoy.`);
                    } catch (error) {
                        console.error('Unlock completion error:', error);
                        showCustomAlert('Completion failed: ' + error.message);
                    } finally {
                        isProcessingPayment = false;
                        setPaymentButtonsBusy(false);
                    }
                },
                onCancel: function(paymentId) {
                    console.log('Unlock payment canceled:', paymentId);
                    showCustomAlert('Payment canceled.');
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                },
                onError: function(error, payment) {
                    console.error('Unlock payment error:', error, payment);
                    showCustomAlert('Payment error: ' + error.message);
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                }
            };

            Pi.createPayment(paymentData, callbacks);
        } catch (error) {
            console.error('Unlock authentication error:', error);
            showCustomAlert('Authentication failed: ' + error.message);
            isProcessingPayment = false;
            setPaymentButtonsBusy(false);
        }
    }

    const unlockPayBtnEl = document.getElementById('unlock-pay-btn');
    if (unlockPayBtnEl) {
        unlockPayBtnEl.addEventListener('click', function() {
            if (isProcessingPayment) return;
            processUnlockPayment();
        });
    }

    const unlockAllBtnEl = document.getElementById('unlock-all-btn');
    if (unlockAllBtnEl) {
        unlockAllBtnEl.addEventListener('click', function() {
            if (isProcessingPayment) return;
            const bundleType = this.dataset.bundleType;
            if (!bundleType) return;
            pendingUnlock = { type: bundleType, name: null };
            processUnlockPayment();
        });
    }

    const unlockCancelBtnEl = document.getElementById('unlock-cancel-btn');
    if (unlockCancelBtnEl) {
        unlockCancelBtnEl.addEventListener('click', function() {
            const modal = document.getElementById('unlock-modal');
            if (modal) modal.style.display = 'none';
            pendingUnlock = null;
        });
    }
   
    // Function to update the mute button's icon to match the current state
    function updateMuteIcon() {
        const muteIcon = document.getElementById('mute-icon');
        if (!muteIcon) return;
        muteIcon.classList.remove('fa-volume-up', 'fa-volume-mute');
        muteIcon.classList.add(isMuted ? 'fa-volume-mute' : 'fa-volume-up');
    }

    // Setup mute button
    const muteBtnEl = document.getElementById('mute-btn');
    if (muteBtnEl) {
        muteBtnEl.addEventListener('click', function() {
            isMuted = !isMuted;
            userSettings.soundMuted = isMuted;
            updateCurrentSettings();
            updateMuteIcon();
        });
    }
   
    // Setup extra time button
    const extraTimeBtnEl = document.getElementById('extra-time-btn');
    if (extraTimeBtnEl) {
        extraTimeBtnEl.addEventListener('click', function() {
            if (isAIThinking) return;
            if (userSettings.difficulty === 'easy') {
                showCustomAlert("Extra Time feature is not available in Easy mode.");
                return;
            }

            if (userSettings.extraTime > 0) {
                // Add extra time based on difficulty
                const extraMinutes = 1; // Each use adds 1 minute
                playerTime += extraMinutes * 60;
                // Keep initialTime (the total time budget) in sync so that
                // "time used" (initialTime - playerTime) still reflects the
                // real elapsed time even after extra time was added —
                // otherwise a game that runs past the default limit thanks
                // to extra time ends up with a wrong (or negative, clamped
                // to 0) time-used value in the statistics.
                initialTime += extraMinutes * 60;
                updateTimerDisplay();
                if (playerTime > 10) lowTimeWarned = false;
                if (playerTime >= 60) oneMinuteWarned = false;

                userSettings.extraTime--;
                document.getElementById('extra-time-count').textContent = userSettings.extraTime;
                updateFeatureButtonsState();
                if (playerTime > 10) sounds.tenseconds.stop();

                // Update statistics
                gameStats.extraTimeUsed++;

                showCustomAlert(`Added ${extraMinutes} minute of extra time!`);
            } else {
                showCustomAlert("You've used all your extra time.");
            }
        });
    }
   
    // Setup features modal
    const featuresModal = document.getElementById('features-modal');
    const featuresBtn = document.getElementById('features-btn');
    const featuresClose = document.querySelector('.features-close');
   
    if (featuresBtn) {
        featuresBtn.addEventListener('click', function() {
            pauseTimer();
            if (featuresModal) featuresModal.style.display = 'block';
        });
    }
   
    if (featuresClose) {
        featuresClose.addEventListener('click', function() {
            if (featuresModal) featuresModal.style.display = 'none';
            resumeTimer();
        });
    }
   
    window.addEventListener('click', function(event) {
        if (featuresModal && event.target == featuresModal) {
            featuresModal.style.display = 'none';
            resumeTimer();
        }
    });
   
    // Setup advice modal
    const adviceModal = document.getElementById('advice-modal');
    const adviceBtn = document.getElementById('advice-btn');
    const adviceClose = document.querySelector('.advice-close');
   
    if (adviceBtn) {
        adviceBtn.addEventListener('click', function() {
            pauseTimer();
            showThreatInfoPanel(lastThreatReport);
            if (adviceModal) adviceModal.style.display = 'block';
        });
    }
   
    if (adviceClose) {
        adviceClose.addEventListener('click', function() {
            if (adviceModal) adviceModal.style.display = 'none';
            resumeTimer();
        });
    }
   
    window.addEventListener('click', function(event) {
        if (adviceModal && event.target == adviceModal) {
            adviceModal.style.display = 'none';
            resumeTimer();
        }
    });
   
    // Setup threats button - ENHANCED FROM script (13).js
    const threatsBtnEl = document.getElementById('threats-btn');
    if (threatsBtnEl) {
        threatsBtnEl.addEventListener('click', function() {
            if (isAIThinking) return;
            if (userSettings.threats > 0) {
                visualizeThreats();
            } else {
                showCustomAlert("You've used all your threat visualizations.");
            }
        });
    }
   
    let lastThreatReport = null;
    // Function to visualize enhanced threats - ENHANCED FROM script (13).js
    function visualizeThreats() {
        pauseTimer(); // Moved timer pause here to ensure execution
        // Clear any previous highlights
        clearThreatVisualization();
       
        const threats = analyzeThreats();
        displayThreats(threats);
        lastThreatReport = threats;
       
        // Decrement threat usage count
        userSettings.threats--;
        document.getElementById('threats-count').textContent = userSettings.threats;
        updateFeatureButtonsState();
       
        // Update statistics
        gameStats.threatsUsed++;
       
        // Hide threat visualization after 10 seconds - FROM script (13).js
        setTimeout(() => {
            clearThreatVisualization();
            resumeTimer();
        }, 10000);
    }
   
    // Function to analyze threats in detail - FROM script (13).js
    function analyzeThreats() {
        const threats = {
            immediate: [],
            potential: [],
            defended: [],
            threatSources: [],
            hangingCount: 0,
            materialAtRisk: 0
        };
       
        const currentColor = game.turn();
        const opponentColor = currentColor === 'w' ? 'b' : 'w';
       
        // Analyze immediate threats
        for (let i = 0; i < 64; i++) {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const squareName = String.fromCharCode(97 + col) + (8 - row);
            const piece = game.get(squareName);
           
            if (piece && piece.color === currentColor) {
                // Check for immediate threats
                const testGame = new Chess(game.fen());
                testGame.turn(opponentColor);
                const attackerMoves = testGame.moves({ verbose: true, square: squareName });
               
                if (attackerMoves.length > 0) {
                    const pieceValue = getPieceValue(piece.type);

                    // Find threat sources, and the cheapest attacking piece
                    // (the one the opponent would realistically use).
                    const threatSources = [];
                    let cheapestAttackerValue = Infinity;
                    for (const move of attackerMoves) {
                        if (!threatSources.includes(move.from)) {
                            threatSources.push(move.from);
                        }
                        const attackerPiece = game.get(move.from);
                        if (attackerPiece) {
                            cheapestAttackerValue = Math.min(cheapestAttackerValue, getPieceValue(attackerPiece.type));
                        }
                    }

                    // Accurately determine whether this square is actually
                    // defended: simulate the cheapest capture and check for
                    // a real legal recapture, rather than just checking if
                    // the piece can move at all.
                    const defenseCheck = isSquareDefended(squareName, currentColor, cheapestAttackerValue);
                    const isHanging = !defenseCheck.defended;

                    // Net material the player stands to lose for free if
                    // they do nothing: undefended = full piece value;
                    // defended = 0 (a straight recapture), unless the
                    // attacker is cheaper than the defended piece (a bad
                    // trade even with a recapture).
                    let netLoss = 0;
                    if (isHanging) {
                        netLoss = pieceValue;
                    } else if (cheapestAttackerValue < pieceValue) {
                        netLoss = pieceValue - cheapestAttackerValue;
                    }

                    let threatLevel = 'low';
                    if (isHanging && pieceValue >= 5) threatLevel = 'high';
                    else if (isHanging && pieceValue >= 3) threatLevel = 'medium';
                    else if (!isHanging && netLoss > 0) threatLevel = 'medium';
                   
                    threats.immediate.push({
                        square: squareName,
                        piece: piece.type,
                        threatLevel: threatLevel,
                        sources: threatSources,
                        value: pieceValue,
                        isDefended: defenseCheck.defended,
                        isHanging: isHanging,
                        netLoss: netLoss
                    });

                    if (isHanging) {
                        threats.hangingCount++;
                        threats.materialAtRisk += netLoss;
                    } else if (netLoss > 0) {
                        threats.materialAtRisk += netLoss;
                    }
                   
                    // Add threat sources to general list
                    threats.threatSources = [...new Set([...threats.threatSources, ...threatSources])];

                    if (defenseCheck.defended) {
                        threats.defended.push({
                            square: squareName,
                            piece: piece.type,
                            defenders: defenseCheck.recaptureSquares
                        });
                    }
                }
            }
        }
       
        // Analyze potential threats (two moves ahead)
        threats.potential = analyzePotentialThreats(currentColor, opponentColor);
       
        // Most urgent (hanging, highest value) first.
        threats.immediate.sort((a, b) => {
            if (a.isHanging !== b.isHanging) return a.isHanging ? -1 : 1;
            return b.netLoss - a.netLoss;
        });
       
        return threats;
    }

    // Simulates the opponent capturing on `square` with their cheapest
    // attacker, then checks whether the defending side has a genuine legal
    // recapture on that exact square — a real defense check instead of just
    // "can this piece move at all".
    function isSquareDefended(square, defenderColor, attackerValueHint) {
        const attackerColor = defenderColor === 'w' ? 'b' : 'w';
        const setupGame = new Chess(game.fen());
        setupGame.turn(attackerColor);
        const captureMoves = setupGame.moves({ verbose: true }).filter(m => m.to === square);
        if (captureMoves.length === 0) return { defended: false, recaptureSquares: [] };

        // Try the cheapest attacking piece first (the realistic choice),
        // falling back to any other attacker if needed.
        captureMoves.sort((a, b) => {
            const pa = setupGame.get(a.from), pb = setupGame.get(b.from);
            return getPieceValue(pa ? pa.type : '') - getPieceValue(pb ? pb.type : '');
        });

        for (const capMove of captureMoves) {
            const afterCapture = new Chess(setupGame.fen());
            const applied = afterCapture.move({ from: capMove.from, to: capMove.to, promotion: 'q' });
            if (!applied) continue;
            afterCapture.turn(defenderColor);
            const recaptures = afterCapture.moves({ verbose: true }).filter(m => m.to === square);
            if (recaptures.length > 0) {
                return { defended: true, recaptureSquares: recaptures.map(m => m.from) };
            }
        }
        return { defended: false, recaptureSquares: [] };
    }
   
    // Function to get piece value - FROM script (13).js
    function getPieceValue(pieceType) {
        const values = {
            'p': 1, // Pawn
            'n': 3, // Knight
            'b': 3, // Bishop
            'r': 5, // Rook
            'q': 9, // Queen
            'k': 100 // King
        };
        return values[pieceType] || 0;
    }
   
    // Function to analyze potential threats - FROM script (13).js
    function analyzePotentialThreats(currentColor, opponentColor) {
        const potentialThreats = [];
       
        // Simulate opponent's possible moves
        const testGame = new Chess(game.fen());
        testGame.turn(opponentColor);
        const opponentMoves = testGame.moves({ verbose: true });
       
        for (const move of opponentMoves) {
            testGame.move(move);
           
            // After the move, check for new threats
            testGame.turn(opponentColor);
            const newThreats = testGame.moves({ verbose: true });
           
            for (const threat of newThreats) {
                const threatenedPiece = testGame.get(threat.to);
                if (threatenedPiece && threatenedPiece.color === currentColor) {
                    potentialThreats.push({
                        from: move.from,
                        to: move.to,
                        threatMove: threat,
                        piece: threatenedPiece.type,
                        value: getPieceValue(threatenedPiece.type)
                    });
                }
            }
           
            testGame.undo();
        }
       
        return potentialThreats;
    }
   
    // Function to display threats on the board - FROM script (13).js
    function displayThreats(threats) {
        // Display immediate threats
        for (const threat of threats.immediate) {
            const squareEl = getSquareElement(threat.square);
            if (!squareEl) continue;
           
            // Apply style based on threat level
            squareEl.classList.add(`${threat.threatLevel}-threat`);
            if (threat.isHanging) {
                squareEl.classList.add('hanging-threat');
            }
           
            // Draw arrows from threat sources
            for (const source of threat.sources) {
                drawThreatArrow(source, threat.square);
            }
        }
       
        // Display threat sources
        for (const source of threats.threatSources) {
            const squareEl = getSquareElement(source);
            if (squareEl) {
                squareEl.classList.add('threat-source');
            }
        }
       
        // Display defended pieces
        for (const defended of threats.defended) {
            const squareEl = getSquareElement(defended.square);
            if (squareEl) {
                squareEl.classList.add('defended');
            }
        }
       
        // Display potential threats
        for (const threat of threats.potential) {
            const squareEl = getSquareElement(threat.to);
            if (squareEl) {
                squareEl.classList.add('potential-threat');
            }
        }
       
    }
   
    // Function to get DOM element for a square - FROM script (13).js
    function getSquareElement(squareName) {
        const col = squareName.charCodeAt(0) - 97;
        const row = 8 - parseInt(squareName[1]);
        return document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
    }
   
    // Draws an arrow (shaft + triangular arrowhead) between two squares on
    // the board, chess.com-style. Used by both the Threats feature (red
    // arrows) and Hint feature (gold arrows).
    function drawBoardArrow(fromSquare, toSquare, className) {
        const fromEl = getSquareElement(fromSquare);
        const toEl = getSquareElement(toSquare);
        const board = document.getElementById('chessboard');
       
        if (!fromEl || !toEl || !board) return;
       
        const boardRect = board.getBoundingClientRect();
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
       
        const fromX = fromRect.left + fromRect.width/2 - boardRect.left;
        const fromY = fromRect.top + fromRect.height/2 - boardRect.top;
        const toX = toRect.left + toRect.width/2 - boardRect.left;
        const toY = toRect.top + toRect.height/2 - boardRect.top;
       
        const fullLength = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
        const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;
        if (fullLength < 1) return;

        // Arrowhead/shaft sized relative to the square, like chess.com.
        const squareSize = fromRect.width;
        const headLength = Math.min(squareSize * 0.4, fullLength * 0.5);
        const headWidth = squareSize * 0.32;
        const shaftWidth = squareSize * 0.14;
        const shaftLength = Math.max(0, fullLength - headLength + 2); // +2 so the head overlaps the shaft slightly, no gap

        const container = document.createElement('div');
        container.className = `board-arrow-container ${className}-container`;
        container.style.position = 'absolute';
        container.style.left = `${fromX}px`;
        container.style.top = `${fromY}px`;
        container.style.width = `${fullLength}px`;
        container.style.height = '0px';
        container.style.transform = `rotate(${angle}deg)`;
        container.style.transformOrigin = '0 0';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '5';

        const shaft = document.createElement('div');
        shaft.className = `board-arrow-shaft ${className}`;
        shaft.style.position = 'absolute';
        shaft.style.left = '0px';
        shaft.style.top = `${-shaftWidth / 2}px`;
        shaft.style.width = `${shaftLength}px`;
        shaft.style.height = `${shaftWidth}px`;
        shaft.style.borderRadius = `${shaftWidth / 2}px`;

        const head = document.createElement('div');
        head.className = `board-arrow-head ${className}-head`;
        head.style.position = 'absolute';
        head.style.left = `${fullLength - headLength}px`;
        head.style.top = `${-headWidth / 2}px`;
        head.style.width = '0px';
        head.style.height = '0px';
        head.style.borderTop = `${headWidth / 2}px solid transparent`;
        head.style.borderBottom = `${headWidth / 2}px solid transparent`;
        head.style.borderLeft = `${headLength}px solid`;

        container.appendChild(shaft);
        container.appendChild(head);
        board.appendChild(container);
    }

    // Function to draw threat arrow - FROM script (13).js
    function drawThreatArrow(fromSquare, toSquare) {
        drawBoardArrow(fromSquare, toSquare, 'threat-arrow');
    }
   
    // Function to show threat information panel - FROM script (13).js
    function showThreatInfoPanel(threats) {
        const threatSummaryEl = document.getElementById('threat-summary');
        const threatDetailsEl = document.getElementById('threat-details');
        const threatTipsEl = document.getElementById('threat-tips');
        if (!threatSummaryEl || !threatDetailsEl || !threatTipsEl) return;

        if(!threats){
            threatSummaryEl.innerHTML = '<p>No threat report available. Use the Threats feature first.</p>';
            threatDetailsEl.innerHTML = '';
            threatTipsEl.innerHTML = '';
            return;
        }
       
        // Threat summary — lead with the single most important question:
        // is anything actually hanging for free right now?
        let summaryText = '';
        if (threats.hangingCount > 0) {
            summaryText = `<p style="color: var(--danger-color); font-weight: bold;">
                ⚠️ ${threats.hangingCount} piece(s) hanging — up to ${threats.materialAtRisk} points of material at risk!
            </p>`;
        } else if (threats.immediate.length > 0) {
            summaryText = `<p>No pieces are hanging for free, but ${threats.immediate.length} piece(s) are being watched by the opponent.</p>`;
        } else {
            summaryText = '<p>✅ No immediate threats detected — nothing of yours is currently attacked.</p>';
        }
       
        if (threats.potential.length > 0) {
            const uniqueTargets = new Set(threats.potential.map(t => t.to)).size;
            summaryText += `<p>${threats.potential.length} potential threat(s) next move, affecting ${uniqueTargets} square(s).</p>`;
        }
       
        threatSummaryEl.innerHTML = summaryText;
       
        // Threat details — hanging pieces first (already sorted this way by
        // analyzeThreats), each clearly marked hanging vs defended, with
        // the real material swing instead of just the piece's raw value.
        threatDetailsEl.innerHTML = '';
        for (const threat of threats.immediate) {
            const li = document.createElement('li');
            const pieceName = getPieceName(threat.piece);

            let statusHTML;
            if (threat.isHanging) {
                statusHTML = `<span style="color: var(--danger-color); font-weight: bold;">Hanging — loses ${threat.value}!</span>`;
            } else if (threat.netLoss > 0) {
                statusHTML = `<span style="color: var(--warning-color); font-weight: bold;">Defended, but a bad trade (net -${threat.netLoss})</span>`;
            } else {
                statusHTML = `<span style="color: var(--success-color);">Defended — safe trade</span>`;
            }

            li.innerHTML = `
                <span class="threat-level-indicator threat-level-${threat.threatLevel}"></span>
                <strong>${pieceName}</strong> at ${threat.square.toUpperCase()} — ${statusHTML}
            `;
           
            threatDetailsEl.appendChild(li);
        }

        // List a few concrete potential threats too (not just a count),
        // so the player knows specifically what the opponent might be
        // setting up.
        if (threats.potential.length > 0) {
            const shown = new Set();
            let added = 0;
            for (const pt of threats.potential) {
                if (added >= 3) break;
                const key = `${pt.from}-${pt.to}`;
                if (shown.has(key)) continue;
                shown.add(key);
                added++;
                const li = document.createElement('li');
                li.innerHTML = `<em>Your ${getPieceName(pt.piece)} on ${pt.to.toUpperCase()} could become vulnerable if the opponent repositions a piece from ${pt.from.toUpperCase()}.</em>`;
                threatDetailsEl.appendChild(li);
            }
        }
       
        // Tips for handling threats — tailored to what was actually found.
        let tipsHTML = '<strong>Recommended actions:</strong><ul>';
       
        if (threats.hangingCount > 0) {
            tipsHTML += '<li>Move your hanging piece(s) to safety, block the attack, or add a defender — right now you\'d lose that material for free.</li>';
        } else if (threats.immediate.some(t => t.netLoss > 0)) {
            tipsHTML += '<li>Some defended pieces would still lose material in a trade — consider whether that exchange is worth allowing.</li>';
        }
       
        if (threats.threatSources.length > 0) {
            tipsHTML += '<li>Think about capturing or threatening the opponent\'s attacking piece(s) instead.</li>';
        }

        if (threats.hangingCount === 0 && threats.immediate.length === 0) {
            tipsHTML += '<li>Your position looks safe for now — look for your own attacking opportunities.</li>';
        }
       
        tipsHTML += '<li>Always keep your king safely protected</li></ul>';
        threatTipsEl.innerHTML = tipsHTML;
       
    }
   
    // Function to get piece name from code - FROM script (13).js
    function getPieceName(pieceCode) {
        const names = {
            'p': 'Pawn',
            'n': 'Knight',
            'b': 'Bishop',
            'r': 'Rook',
            'q': 'Queen',
            'k': 'King'
        };
        return names[pieceCode] || pieceCode;
    }
   
    // Function to clear all threat effects - FROM script (13).js
    function clearThreatVisualization() {
        // Remove classes from squares
        const squares = document.querySelectorAll('.square');
        squares.forEach(square => {
            square.classList.remove('low-threat', 'medium-threat', 'high-threat',
                                  'potential-threat', 'defended', 'threat-source', 'hanging-threat');
        });
       
        // Remove arrows
        const arrows = document.querySelectorAll('.threat-arrow');
        arrows.forEach(arrow => arrow.remove());
       
    }
   
    // Function to clear hint visualization
    function clearHintVisualization() {
        const squares = document.querySelectorAll('.square');
        squares.forEach(sq => {
            sq.classList.remove('hint-from', 'hint-to');
        });
    }
   
    // Function to pause the game timer
    function pauseTimer() {
        if (userSettings.difficulty !== 'easy' && !isTimerPaused) {
            clearInterval(gameTimer);
            isTimerPaused = true;
        }
    }
   
    // Function to resume the game timer
    function resumeTimer() {
        if (isTimerPaused && userSettings.difficulty !== 'easy') {
            startTimer();
            isTimerPaused = false;
        }
    }
   
    // Function to setup time control based on difficulty
    function setupTimeControl() {
        // Clear any existing timer
        if (gameTimer) {
            clearInterval(gameTimer);
        }
       
        // Set time based on difficulty
        switch (userSettings.difficulty) {
            case 'easy':
                playerTime = 0; // No time limit
                initialTime = 0; // NEW: Store initial time
                timeIncrement = 0;
                break;
            case 'medium':
                playerTime = 15 * 60; // 15 minutes in seconds
                initialTime = 15 * 60; // NEW: Store initial time
                timeIncrement = 0; // No increment
                break;
            case 'hard':
                playerTime = 10 * 60; // 10 minutes in seconds
                initialTime = 10 * 60; // NEW: Store initial time
                timeIncrement = 0; // No increment
                break;
            case 'expert':
                playerTime = 5 * 60; // 5 minutes in seconds
                initialTime = 5 * 60; // NEW: Store initial time
                timeIncrement = 0; // No increment
                break;
            default:
                playerTime = 15 * 60;
                initialTime = 15 * 60; // NEW: Store initial time
                timeIncrement = 0;
        }
       
        lowTimeWarned = false;
        oneMinuteWarned = false;
        updateTimerDisplay();
       
        // Only start timer if not in easy mode
        if (userSettings.difficulty !== 'easy') {
            startTimer();
        }
    }
   
    // Function to start or restart the timer interval
    function startTimer() {
        if (gameTimer) {
            clearInterval(gameTimer);
        }
       
        gameTimer = setInterval(() => {
            if (currentPlayer === 'white' && playerTime > 0) {
                playerTime--;
                updateTimerDisplay();
               
                const timerDisplayEl = document.getElementById('game-timer-display');
                if (timerDisplayEl) {
                    if (playerTime < 60) {
                        timerDisplayEl.classList.add('timer-low');
                    } else {
                        timerDisplayEl.classList.remove('timer-low');
                    }
                }
                if (playerTime < 60 && !oneMinuteWarned && playerTime > 0) {
                    oneMinuteWarned = true;
                    showPromoMessage(PROMO_MESSAGES_LOW_TIME);
                }
                if (playerTime <= 10 && playerTime > 0) {
                    if (!isMuted) {
                        sounds.tenseconds.play();
                    }
                    lowTimeWarned = true;
                }
                if (playerTime <= 0) {
                    sounds.tenseconds.stop();
                    clearInterval(gameTimer);
                    endGame(`Time's up! Black wins by timeout!`, false);
                }
            }
        }, 1000);
    }
   
    // Function to update timer display
    function updateTimerDisplay() {
        const mainDisplay = document.getElementById('game-timer-display');
        if (!mainDisplay) return;
       
        if (userSettings.difficulty === 'easy') {
            mainDisplay.textContent = "∞";
            return;
        }
       
        const minutes = Math.floor(playerTime / 60);
        const seconds = playerTime % 60;
        const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        mainDisplay.textContent = timeStr;
    }
   
    // Function to update player turn indicator
    function updatePlayerIndicator() {
        const botIndicator = document.getElementById('bot-indicator');
        const whiteIndicator = document.getElementById('white-player-indicator');

        if (botIndicator) botIndicator.classList.toggle('active', currentPlayer === 'black');
        if (whiteIndicator) whiteIndicator.classList.toggle('active', currentPlayer === 'white');
    }
   
    // Function to switch player and timer
    function switchPlayerTimer() {
        currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
        updatePlayerIndicator();
    }
   
    // Function to load comprehensive statistics from localStorage
    function loadComprehensiveStats() {
        try {
            const savedStats = localStorage.getItem('chessPiComprehensiveStats');
            if (savedStats) {
                const parsed = JSON.parse(savedStats);
                // Merge (not overwrite) so older saved data missing newer
                // fields (e.g. feature-usage totals, streaks) don't end up
                // undefined and corrupt future increments.
                comprehensiveStats = {
                    overall: { ...comprehensiveStats.overall, ...(parsed.overall || {}) },
                    byDifficulty: {
                        easy: { ...comprehensiveStats.byDifficulty.easy, ...((parsed.byDifficulty || {}).easy || {}) },
                        medium: { ...comprehensiveStats.byDifficulty.medium, ...((parsed.byDifficulty || {}).medium || {}) },
                        hard: { ...comprehensiveStats.byDifficulty.hard, ...((parsed.byDifficulty || {}).hard || {}) },
                        expert: { ...comprehensiveStats.byDifficulty.expert, ...((parsed.byDifficulty || {}).expert || {}) }
                    },
                    currentGame: { ...comprehensiveStats.currentGame, ...(parsed.currentGame || {}) }
                };
            }
        } catch (e) {
            console.error('loadComprehensiveStats failed:', e);
        }
    }

    // Function to save comprehensive statistics to localStorage
    function saveComprehensiveStats() {
        try {
            localStorage.setItem('chessPiComprehensiveStats', JSON.stringify(comprehensiveStats));
        } catch (e) {
            console.error('saveComprehensiveStats failed:', e);
        }
    }

    // ENHANCED FUNCTION FROM script (8).js - Fixed statistics logic
    // Function to update comprehensive statistics after game ends
    function updateComprehensiveStats(result, timeUsed, moves, difficulty) {
        // Update overall statistics
        comprehensiveStats.overall.gamesPlayed++;
        
        // CORRECTED: Fixed the logic for determining game result
        const isWin = result.includes('wins') && result.includes('White') && !result.includes('surrender');
        if (isWin) {
            comprehensiveStats.overall.wins++;
            comprehensiveStats.overall.currentStreak = comprehensiveStats.overall.currentStreak > 0 ? comprehensiveStats.overall.currentStreak + 1 : 1;
            comprehensiveStats.overall.bestStreak = Math.max(comprehensiveStats.overall.bestStreak, comprehensiveStats.overall.currentStreak);
        } else if (result.includes('wins') && result.includes('Black') || 
                  result.includes('surrender') || 
                  result.includes('timeout')) {
            comprehensiveStats.overall.losses++;
            comprehensiveStats.overall.currentStreak = 0;
        } else {
            comprehensiveStats.overall.draws++;
            comprehensiveStats.overall.currentStreak = 0;
        }
        
        comprehensiveStats.overall.winRate = comprehensiveStats.overall.gamesPlayed > 0 ? 
            ((comprehensiveStats.overall.wins / comprehensiveStats.overall.gamesPlayed) * 100).toFixed(1) : 0;

        // Lifetime feature-usage totals — this data was already being
        // tracked per-game (gameStats.hintsUsed etc.) but never actually
        // accumulated or shown anywhere until now.
        comprehensiveStats.overall.totalHintsUsed += gameStats.hintsUsed || 0;
        comprehensiveStats.overall.totalUndosUsed += gameStats.undosUsed || 0;
        comprehensiveStats.overall.totalThreatsUsed += gameStats.threatsUsed || 0;
        comprehensiveStats.overall.totalExtraTimeUsed += gameStats.extraTimeUsed || 0;

        // Update difficulty-specific statistics
        const diffStats = comprehensiveStats.byDifficulty[difficulty];
        if (diffStats) {
            diffStats.gamesPlayed++;
            
            // CORRECTED: Fixed the logic for determining game result by difficulty
            if (isWin) {
                diffStats.wins++;
                
                // "Best Time" = the FASTEST winning time (shortest time
                // used), matching what "best" means for Fastest Win (fewest
                // moves) below. This was previously tracking the LONGEST
                // winning time instead, which is backwards.
                if (!diffStats.bestTime || timeUsed < diffStats.bestTime) {
                    diffStats.bestTime = timeUsed;
                }
                
                // Update fastest win (fewest moves to win)
                if (!diffStats.fastestWin || moves < diffStats.fastestWin) {
                    diffStats.fastestWin = moves;
                }
            } else if (result.includes('wins') && result.includes('Black') || 
                      result.includes('surrender') || 
                      result.includes('timeout')) {
                diffStats.losses++;
            } else {
                diffStats.draws++;
            }
        }

        // Update current game stats
        comprehensiveStats.currentGame = {
            result: result,
            timeUsed: formatTime(timeUsed),
            moves: moves,
            difficulty: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
            hintsUsed: gameStats.hintsUsed || 0,
            undosUsed: gameStats.undosUsed || 0,
            threatsUsed: gameStats.threatsUsed || 0,
            extraTimeUsed: gameStats.extraTimeUsed || 0
        };

        saveComprehensiveStats();
    }

    // FIXED: Function to format time for display - fixes "No limit" issue
    function formatTime(seconds) {
        // Check that the value is numeric and valid
        if (isNaN(seconds) || seconds === null || seconds === undefined) {
            return "0:00";
        }
        
        // Only in Easy mode do we return "No limit"
        if (userSettings.difficulty === 'easy' && seconds === 0) {
            return "No limit";
        }
        
        if (seconds === 0) return "0:00";
        
        // Ensure the value is positive
        seconds = Math.abs(seconds);
        
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // FIXED: Function to format time for best records - fixes "No limit" issue
    function formatBestTime(seconds) {
        // Check that the value is numeric and valid
        if (!seconds || isNaN(seconds) || seconds === null || seconds === undefined) {
            return "-";
        }
        
        // Ensure the value is positive
        seconds = Math.abs(seconds);
        
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Function to display comprehensive statistics
    function displayComprehensiveStatistics() {
        // Load latest stats
        loadComprehensiveStats();
        
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        // Current Game Tab
        setText('current-result', comprehensiveStats.currentGame.result || '-');
        setText('current-time', comprehensiveStats.currentGame.timeUsed || '-');
        setText('current-moves', comprehensiveStats.currentGame.moves || '-');
        setText('current-difficulty', comprehensiveStats.currentGame.difficulty || '-');
        setText('current-features-used',
            `${comprehensiveStats.currentGame.hintsUsed || 0} hints, ${comprehensiveStats.currentGame.undosUsed || 0} undos, ` +
            `${comprehensiveStats.currentGame.threatsUsed || 0} threats, ${comprehensiveStats.currentGame.extraTimeUsed || 0} extra time`
        );
        
        // Best Records Tab
        const currentDiff = userSettings.difficulty;
        const diffStats = comprehensiveStats.byDifficulty[currentDiff];
        
        if (diffStats) {
            setText('best-time', formatBestTime(diffStats.bestTime));
            setText('fastest-win', diffStats.fastestWin ? `${diffStats.fastestWin} moves` : '-');
        } else {
            setText('best-time', '-');
            setText('fastest-win', '-');
        }
        
        // Overall Statistics Tab
        setText('total-games', comprehensiveStats.overall.gamesPlayed);
        setText('total-wins', comprehensiveStats.overall.wins);
        setText('total-losses', comprehensiveStats.overall.losses);
        setText('total-draws', comprehensiveStats.overall.draws);
        setText('win-rate', `${comprehensiveStats.overall.winRate}%`);
        setText('current-streak', comprehensiveStats.overall.currentStreak || 0);
        setText('best-streak', comprehensiveStats.overall.bestStreak || 0);
        setText('total-features-used',
            `${comprehensiveStats.overall.totalHintsUsed || 0} hints, ${comprehensiveStats.overall.totalUndosUsed || 0} undos, ` +
            `${comprehensiveStats.overall.totalThreatsUsed || 0} threats, ${comprehensiveStats.overall.totalExtraTimeUsed || 0} extra time`
        );
        
        // Difficulty-specific stats
        setText('easy-stats', `${comprehensiveStats.byDifficulty.easy.wins}/${comprehensiveStats.byDifficulty.easy.gamesPlayed}`);
        setText('medium-stats', `${comprehensiveStats.byDifficulty.medium.wins}/${comprehensiveStats.byDifficulty.medium.gamesPlayed}`);
        setText('hard-stats', `${comprehensiveStats.byDifficulty.hard.wins}/${comprehensiveStats.byDifficulty.hard.gamesPlayed}`);
        setText('expert-stats', `${comprehensiveStats.byDifficulty.expert.wins}/${comprehensiveStats.byDifficulty.expert.gamesPlayed}`);
    }
   
    // ENHANCED FUNCTION FROM script (8).js - Fixed end game logic
    // Function to end the game and show modal
    function endGame(message, isWin = false) {
        // Stop the low-time ticking sound the instant the game ends, no
        // matter why it ended (checkmate, draw, surrender, or timeout).
        sounds.tenseconds.stop();

        // Stop the timer permanently when the game ends
        if (gameTimer) {
            clearInterval(gameTimer);
            gameTimer = null;
        }
        
        // FIXED: Calculate time used correctly
        let timeUsed = 0;
        if (userSettings.difficulty !== 'easy') {
            // Time used = initial time - remaining time
            timeUsed = Math.max(0, initialTime - playerTime);
        }
        
        // Calculate game duration in seconds - FIXED: Use timeUsed instead of actual time
        if (gameStats.startTime) {
            const endTime = new Date().getTime();
            gameStats.gameDuration = Math.floor((endTime - gameStats.startTime) / 1000);
        } else {
            // If startTime is not set, use timeUsed
            gameStats.gameDuration = timeUsed;
        }
        
        // Update game statistics
        updateGameStats(message);
        
        // CORRECTED: Fixed the isWin parameter for surrender case
        let actualIsWin = isWin;
        if (message.includes('surrender')) {
            actualIsWin = false;
        }
        
        // Update comprehensive statistics - FIXED: Pass timeUsed instead of duration
        updateComprehensiveStats(message, timeUsed, gameStats.totalMoves, userSettings.difficulty);
        submitScoreToLeaderboard();
        
        // Show game over modal
        const gameOverModal = document.getElementById('game-over-modal');
        const gameResultTitle = document.getElementById('game-result-title');
        const gameResultMessage = document.getElementById('game-result-message');
        const nextLevelBtn = document.getElementById('next-level-btn');
        
        if (gameResultTitle) gameResultTitle.textContent = "Game Over";
        if (gameResultMessage) gameResultMessage.textContent = message;
        
        // Show next level button if win and not expert (imported-game wins
        // don't count — no legitimate next level to jump to)
        if (nextLevelBtn) {
            if (actualIsWin && !isImported && userSettings.difficulty !== 'expert') {
                nextLevelBtn.style.display = 'inline-block';
            } else {
                nextLevelBtn.style.display = 'none';
            }
        }

        // Beating a level permanently unlocks the next one (free progression
        // path, alongside the option to pay with Pi to skip ahead).
        // IMPORTANT: imported PGN games never count — otherwise someone could
        // import an already-won game to unlock levels for free without
        // actually beating the bot.
        if (actualIsWin && !isImported) {
            const unlockedNext = getNextLevel(userSettings.difficulty);
            if (unlockedNext) {
                grantProgress({ levels: [unlockedNext] });
            }
        }
        
        if (gameOverModal) gameOverModal.style.display = 'block';
        
        // Update game status
        const gameStatusEl = document.getElementById('game-status');
        if (gameStatusEl) gameStatusEl.textContent = message;
        if (!isMuted) {
            if (message.includes('wins')) {
                if (actualIsWin) {
                    sounds['game-win'].play();
                } else {
                    sounds['game-lose'].play();
                }
            } else if (message.includes('Draw')) {
                sounds['game-draw'].play();
            } else {
                sounds['game-end'].play();
            }
        }
    }
   
    // Function to update game statistics
    function updateGameStats(resultMessage) {
        // Calculate game duration - FIXED: Use timeUsed instead of actual time
        let timeUsed = 0;
        if (userSettings.difficulty !== 'easy') {
            timeUsed = Math.max(0, initialTime - playerTime);
        }
        
        const minutes = Math.floor(timeUsed / 60);
        const seconds = timeUsed % 60;
        gameStats.gameDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
       
        // Update total moves — count only the player's (White's) moves,
        // not the bot's (Black's), since game.history() includes both.
        gameStats.totalMoves = Math.ceil(game.history().length / 2);
       
        // Update game result
        gameStats.gameResult = resultMessage;
    }
   
    // Function to display statistics
    function displayStatistics() {
        displayComprehensiveStatistics();
    }
   
    // Function to initialize a new game
    function initNewGame() {
        game = new Chess();
        moveHistory = [];
        selectedSquare = null;
        validMoves = [];
       
        // Reset game statistics - FIXED: Ensure startTime is set correctly
        gameStats = {
            startTime: new Date().getTime(),
            totalMoves: 0,
            hintsUsed: 0,
            undosUsed: 0,
            threatsUsed: 0,
            extraTimeUsed: 0,
            gameResult: '',
            gameDuration: 0,
            difficulty: userSettings.difficulty
        };
       
        updateGameStatus();
        initBoard();
        setupTimeControl();
       
        currentPlayer = 'white';
        updatePlayerIndicator();
        updateAttemptsBasedOnDifficulty();
        lastThreatReport = null;
        isImported = false;
       
        // Close game over modal if open
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.style.display = 'none';
        if (!isMuted) sounds['game-start'].play();
    }

    // Function to update game status (check, checkmate, etc.)
    function updateGameStatus() {
        const statusElement = document.getElementById('game-status');
        let status = '';
        let isWin = false;
       
        if (game.in_checkmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            status = `Checkmate! ${winner} wins!`;
            isWin = (winner === 'White'); // White player is the user
            endGame(status, isWin);
        } else if(game.in_draw()) {
            status = "Draw!";
            endGame(status, false); // Draw is not a win
        } else if (game.in_check()) {
            status = `${game.turn() === 'w' ? 'White' : 'Black'} is in check!`;
        } else {
            status = '';
        }
       
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.classList.toggle('in-check', game.in_check() && !game.game_over());
        }
    }
   
    // Function to switch between pages
    function switchPage(pageIndex) {
        if (!pages || pages.length === 0 || !pages[pageIndex]) {
            console.error(`switchPage: page index ${pageIndex} not found (found ${pages ? pages.length : 0} .page elements)`);
            return;
        }
        pages.forEach(page => page.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));
       
        pages[pageIndex].classList.add('active');
        document.querySelectorAll(`.dot[data-page="${pageIndex}"]`).forEach(dot => dot.classList.add('active'));
       
        updateNavArrows(pageIndex);
        currentPage = pageIndex;
       
        if (pageIndex === 4) {
            initNewGame();
            updateCurrentSettings();
            updateFeatureButtonsState();
        } else {
            // Stop timer if leaving game page
            if (gameTimer) {
                clearInterval(gameTimer);
            }
        }
    }
   
    // Function to update navigation arrows visibility
    function updateNavArrows(pageIndex) {
        if (!leftArrow || !rightArrow) return;
        if (pageIndex === 0 || pageIndex === 4) {
            leftArrow.classList.add('hidden');
            rightArrow.classList.add('hidden');
        } else {
            leftArrow.classList.remove('hidden');
            rightArrow.classList.remove('hidden');
            leftArrow.classList.toggle('hidden', pageIndex === 1);
            rightArrow.classList.toggle('hidden', pageIndex === 3);
        }
    }
   
    // Function to save current settings
    function updateCurrentSettings() {
        // Save settings to localStorage
        try {
            localStorage.setItem('chessPiSettings', JSON.stringify(userSettings));
        } catch (e) {
            console.error('updateCurrentSettings failed:', e);
        }
    }
   
    // Function to load saved settings
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem('chessPiSettings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
               
                // Validate
                userSettings.language = ['en', 'fr', 'es', 'ar', 'zh', 'ru'].includes(parsed.language) ? parsed.language : 'en';
                // Migrate old theme names (from before this update) to their
                // closest new equivalent, so returning players don't get
                // silently reset to the default.
                const themeMigration = { classic: 'brown', space: 'blue', marble: 'green', metal: 'pink' };
                const migratedTheme = themeMigration[parsed.theme] || parsed.theme;
                userSettings.theme = ['brown', 'green', 'pink', 'blue'].includes(migratedTheme) ? migratedTheme : 'brown';
                userSettings.pieceSet = ['neo', 'wood', 'glass', 'marble'].includes(parsed.pieceSet) ? parsed.pieceSet : 'neo';
                userSettings.difficulty = ['easy', 'medium', 'hard', 'expert'].includes(parsed.difficulty) ? parsed.difficulty : 'easy';
                userSettings.soundMuted = !!parsed.soundMuted;
                isMuted = userSettings.soundMuted;
                updateMuteIcon();
               
                // Update UI
                document.querySelectorAll('.option-card').forEach(card => {
                    card.classList.remove('selected');
                   
                    if (card.getAttribute('data-theme') === userSettings.theme ||
                        card.getAttribute('data-piece-set') === userSettings.pieceSet ||
                        card.getAttribute('data-lang') === userSettings.language ||
                        card.getAttribute('data-difficulty') === userSettings.difficulty) {
                        card.classList.add('selected');
                    }
                });
               
                i18next.changeLanguage(userSettings.language).then(updateTranslations);
                updateAttemptsBasedOnDifficulty();
            }
        } catch (e) {
            console.error('loadSettings failed:', e);
        }
    }
   
    // Function to create the chessboard (called once)
    function createBoard() {
        const chessboard = document.getElementById('chessboard');
        if (!chessboard) {
            console.error('#chessboard not found in HTML');
            return;
        }
        chessboard.innerHTML = '';
       
        applyTheme(userSettings.theme);
       
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.classList.add('square');
                square.classList.add((row + col) % 2 === 0 ? 'white' : 'black');
                square.dataset.row = row;
                square.dataset.col = col;
                square.tabIndex = 0; // For keyboard accessibility
                square.setAttribute('role', 'button');

                // Chess.com-style board coordinates: rank numbers (8→1) down
                // the left edge, file letters (a→h) along the bottom edge.
                if (col === 0) {
                    square.dataset.rank = 8 - row;
                }
                if (row === 7) {
                    square.dataset.file = String.fromCharCode(97 + col);
                }
               
                // Add click and keydown events
                square.addEventListener('click', () => handleSquareClick(row, col));
                square.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') handleSquareClick(row, col);
                });
               
                chessboard.appendChild(square);
            }
        }
    }
   
    // Function to update pieces on the board without rebuilding structure
    // Two piece sets are used depending on the selected board theme:
    // - "Neo": Chess.com's modern rounded default set (brown, green, blue themes)
    // - "cburnett": Lichess's default set (pink theme)
    // If images fail to load for any reason (offline, CDN down, blocked,
    // etc.) we automatically fall back to the original Unicode chess glyphs
    // so the board never shows blank squares.
    const PIECE_UNICODE = {
        w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
        b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
    };

    function getPieceImageSources(type, color, pieceSet) {
        const colorLetter = color === 'w' ? 'w' : 'b';
        // Chess.com hosts many piece sets on the same public CDN path,
        // just under a different folder name per set (neo/wood/glass/marble
        // all follow this exact pattern) — no separate asset hosting needed.
        const chesscomUrl = `https://images.chesscomfiles.com/chess-themes/pieces/${pieceSet}/150/${colorLetter}${type}.png`;
        const cburnettCode = `${colorLetter}${type.toUpperCase()}`;
        const cburnettUrls = [
            `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/${cburnettCode}.svg`,
            `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${cburnettCode}.svg`
        ];
        // Always try the requested set first; if that particular image
        // 404s for any reason, fall back to cburnett, then finally to a
        // Unicode glyph (handled by the <img> onerror chain in the caller).
        return [chesscomUrl, ...cburnettUrls];
    }

    function createPieceElement(type, color, pieceSet) {
        const pieceElement = document.createElement('div');
        pieceElement.classList.add('piece');
        pieceElement.classList.add(color);

        const sources = getPieceImageSources(type, color, pieceSet);
        const img = document.createElement('img');
        img.className = 'piece-img';
        img.draggable = false;
        img.alt = `${color === 'w' ? 'White' : 'Black'} ${type}`;
        let sourceIndex = 0;
        img.src = sources[sourceIndex];
        img.onerror = function() {
            sourceIndex++;
            if (sourceIndex < sources.length) {
                img.src = sources[sourceIndex];
            } else {
                // All image sources failed — fall back to a Unicode glyph.
                pieceElement.innerHTML = '';
                pieceElement.textContent = (PIECE_UNICODE[color] && PIECE_UNICODE[color][type]) || '';
            }
        };
        pieceElement.appendChild(img);
        return pieceElement;
    }

    function updateBoard() {
        const currentPieceSet = ['neo', 'wood', 'glass', 'marble'].includes(userSettings.pieceSet) ? userSettings.pieceSet : 'neo';
        const chessboardEl = document.querySelector('.chessboard');

        // ---- Capture the moving piece's pre-move screen position BEFORE
        // the board is torn down and rebuilt. The game state already
        // reflects the move, but the DOM still shows the previous position
        // at this point, so this is "First" in the FLIP technique.
        let slideInfo = null;
        const historyForAnim = game.history({ verbose: true });
        const lastMoveForAnim = historyForAnim[historyForAnim.length - 1];
        if (lastMoveForAnim && chessboardEl) {
            const fromCol = lastMoveForAnim.from.charCodeAt(0) - 97;
            const fromRow = 8 - parseInt(lastMoveForAnim.from[1]);
            const fromSquareEl = document.querySelector(`.square[data-row="${fromRow}"][data-col="${fromCol}"]`);
            const fromPieceEl = fromSquareEl ? fromSquareEl.querySelector('.piece') : null;
            if (fromPieceEl) {
                const boardRect = chessboardEl.getBoundingClientRect();
                const originLeft = boardRect.left + chessboardEl.clientLeft;
                const originTop = boardRect.top + chessboardEl.clientTop;
                const fromRect = fromSquareEl.getBoundingClientRect();
                slideInfo = {
                    move: lastMoveForAnim,
                    pieceHTML: fromPieceEl.innerHTML,
                    pieceClassName: fromPieceEl.className,
                    startLeft: fromRect.left - originLeft,
                    startTop: fromRect.top - originTop,
                    squareWidth: fromRect.width,
                    squareHeight: fromRect.height
                };
            }
        }

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const squareName = String.fromCharCode(97 + col) + (8 - row);
                const piece = game.get(squareName);
                const squareElement = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
                if (!squareElement) continue;
               
                // Update ARIA label
                squareElement.setAttribute('aria-label', `Square ${squareName} ${piece ? 'with ' + piece.type + ' ' + piece.color : 'empty'}`);
               
                // Remove any existing piece
                squareElement.innerHTML = '';
               
                if (piece) {
                    const pieceElement = createPieceElement(piece.type, piece.color, currentPieceSet);
                    squareElement.appendChild(pieceElement);
                }
            }
        }
       
        // Highlight last move if any
        highlightLastMove();
       
        // Highlight king if in check
        highlightCheck();

        // ---- Play the slide ("Last"/"Invert"/"Play" of FLIP): a ghost
        // piece travels across the whole board — not clipped by any single
        // square's overflow:hidden — from the old square to the new one,
        // reading as a human hand dragging the piece rather than an
        // instant pop-in, the way chess.com animates moves.
        if (slideInfo && chessboardEl) {
            const toCol = slideInfo.move.to.charCodeAt(0) - 97;
            const toRow = 8 - parseInt(slideInfo.move.to[1]);
            const toSquareEl = document.querySelector(`.square[data-row="${toRow}"][data-col="${toCol}"]`);
            const toPieceEl = toSquareEl ? toSquareEl.querySelector('.piece') : null;

            if (toSquareEl) {
                const boardRect = chessboardEl.getBoundingClientRect();
                const originLeft = boardRect.left + chessboardEl.clientLeft;
                const originTop = boardRect.top + chessboardEl.clientTop;
                const toRect = toSquareEl.getBoundingClientRect();
                const endLeft = toRect.left - originLeft;
                const endTop = toRect.top - originTop;

                if (endLeft !== slideInfo.startLeft || endTop !== slideInfo.startTop) {
                    const ghost = document.createElement('div');
                    ghost.className = slideInfo.pieceClassName;
                    ghost.innerHTML = slideInfo.pieceHTML;
                    ghost.style.position = 'absolute';
                    ghost.style.left = slideInfo.startLeft + 'px';
                    ghost.style.top = slideInfo.startTop + 'px';
                    ghost.style.width = slideInfo.squareWidth + 'px';
                    ghost.style.height = slideInfo.squareHeight + 'px';
                    ghost.style.margin = '0';
                    ghost.style.zIndex = '50';
                    ghost.style.pointerEvents = 'none';
                    ghost.style.transition = 'none';
                    chessboardEl.appendChild(ghost);

                    // Hide the "real" piece already sitting in the destination
                    // square while the ghost travels there, to avoid a
                    // double-piece flash.
                    if (toPieceEl) toPieceEl.style.visibility = 'hidden';

                    // Force a reflow so the browser locks in the starting
                    // position before we animate away from it.
                    void ghost.offsetWidth;

                    const cleanup = () => {
                        ghost.remove();
                        if (toPieceEl) toPieceEl.style.visibility = '';
                    };

                    requestAnimationFrame(() => {
                        ghost.style.transition = 'left 0.25s cubic-bezier(0.34, 0.2, 0.28, 1), top 0.25s cubic-bezier(0.34, 0.2, 0.28, 1)';
                        ghost.style.left = endLeft + 'px';
                        ghost.style.top = endTop + 'px';
                    });
                    ghost.addEventListener('transitionend', cleanup);
                    setTimeout(cleanup, 330); // safety fallback if transitionend doesn't fire
                }
            }
        }
    }
   
    // Function to initialize board (called once)
    function initBoard() {
        createBoard();
        updateBoard();
    }
   
    // MERGED: Function to handle square clicks from Java.js
    function handleSquareClick(row, col) {
        // The human only ever plays White. Block all board interaction while
        // it's Black's turn or the engine is thinking, so the player can't
        // move the bot's pieces and cause a race condition with the pending
        // AI move.
        if (game.turn() !== 'w' || isAIThinking) {
            return;
        }

        const squareName = String.fromCharCode(97 + col) + (8 - row);
        const piece = game.get(squareName);
       
        if (piece && piece.type === 'k' && piece.color === 'w' && game.turn() === 'w') {
            const currentTime = new Date().getTime();
            if (currentTime - lastKingClickTime < 500) {
                const surrenderModal = document.getElementById('surrender-modal');
                if (surrenderModal) surrenderModal.style.display = 'block';
                pauseTimer();
                lastKingClickTime = 0;
                return;
            }
            lastKingClickTime = currentTime;
        }
       
        // If a square is already selected
        if (selectedSquare) {
            // Check if promotion is needed — verify with chess.js's own legal
            // move list, not just "pawn + destination on rank 8", otherwise
            // clicking a pawn and then ANY square on the back rank (even one
            // the pawn can't legally reach, like where the king/queen sit)
            // would incorrectly pop up the promotion modal.
            const selectedPiece = game.get(selectedSquare);
            let isLegalPromotion = false;
            if (selectedPiece && selectedPiece.type === 'p' && selectedPiece.color === 'w' && squareName[1] === '8') {
                const legalMoves = game.moves({ square: selectedSquare, verbose: true });
                isLegalPromotion = legalMoves.some(m => m.to === squareName && m.flags.includes('p'));
            }

            if (isLegalPromotion) {
                // Promotion move
                promotionFrom = selectedSquare;
                promotionTo = squareName;
                const promotionModal = document.getElementById('promotion-modal');
                if (promotionModal) promotionModal.style.display = 'block';
                pauseTimer();
            } else {
                // Regular move
                const move = game.move({
                    from: selectedSquare,
                    to: squareName
                });
               
                if (move) {
                    moveHistory.push(`${move.from}-${move.to}`);
                   
                    playMoveSound(move, true);
                   
                    // Switch player and timer
                    switchPlayerTimer();
                   
                    // Update the board without rebuilding the entire structure
                    updateBoard();
                   
                    // Update game status
                    updateGameStatus();
                   
                    // If the game is over, don't make AI move
                    if (game.game_over()) {
                        return;
                    }
                   
                    // AI move (for computer opponent) - FIXED: improved call
                    setTimeout(() => {
                        if (!game.game_over() && game.turn() === 'b') {
                            makeAIMove();
                        }
                    }, 200);
                } else if (selectedSquare && selectedSquare !== squareName) {
                    // Attempted invalid move
                    if (!isMuted) {
                        sounds.illegal.play();
                    }
                }
               
                // Reset selection
                clearSelection();
            }
        } else if (piece && piece.color === game.turn()) {
            // Select the piece if it's the player's turn
            selectedSquare = squareName;
           
            // Highlight selected square
            document.querySelectorAll('.square').forEach(sq => {
                sq.classList.remove('selected');
            });
           
            const squareElement = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
            if (squareElement) squareElement.classList.add('selected');
           
            // Show valid moves
            showValidMoves(squareName);
        }
    }
   
    // Function to play sound based on move type
    function playMoveSound(move, isPlayer = true) {
        if (!isMuted) {
            let moveSoundType = isPlayer ? 'move-self' : 'move-opponent';
            if (move.flags.includes('c') || move.flags.includes('e')) {
                moveSoundType = 'capture';
            } else if (move.flags.includes('p')) {
                moveSoundType = 'promote';
            } else if (move.flags.includes('k') || move.flags.includes('q')) {
                moveSoundType = 'castle';
            }
            sounds[moveSoundType].play();
   
            if (game.in_checkmate()) {
                sounds.checkmate.play();
            } else if (game.in_check()) {
                sounds['move-check'].play();
            }
        }
    }
   
    // Function to show valid moves for selected piece
    function showValidMoves(square) {
        // Clear previous valid moves
        clearValidMoves();
       
        // Get all valid moves for the selected piece
        const moves = game.moves({ square: square, verbose: true });
       
        // Highlight valid moves
        moves.forEach(move => {
            const to = move.to;
            const col = to.charCodeAt(0) - 97;
            const row = 8 - parseInt(to[1]);
            const squareElement = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
           
            if (squareElement) {
                const marker = document.createElement('div');
                if (move.captured) {
                    squareElement.classList.add('capture-move');
                    marker.className = 'move-marker capture-marker';
                } else {
                    squareElement.classList.add('valid-move');
                    marker.className = 'move-marker valid-marker';
                }
                squareElement.appendChild(marker);
            }
        });
       
        validMoves = moves;
    }
   
    // Function to clear selection
    function clearSelection() {
        selectedSquare = null;
        clearValidMoves();
       
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('selected');
        });
    }
   
    // Function to clear valid move highlights
    function clearValidMoves() {
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('valid-move');
            sq.classList.remove('capture-move');
        });
        document.querySelectorAll('.move-marker').forEach(marker => marker.remove());
       
        validMoves = [];
    }
   
    // Function to highlight last move
    function highlightLastMove() {
        // Clear previous last move highlights
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('last-move');
        });
       
        if (game.history().length > 0) {
            const moves = game.history({ verbose: true });
            const lastMove = moves[moves.length - 1];
           
            if (lastMove) {
                // Highlight from square
                const fromCol = lastMove.from.charCodeAt(0) - 97;
                const fromRow = 8 - parseInt(lastMove.from[1]);
                const fromSquare = document.querySelector(`.square[data-row="${fromRow}"][data-col="${fromCol}"]`);
                if (fromSquare) fromSquare.classList.add('last-move');
               
                // Highlight to square
                const toCol = lastMove.to.charCodeAt(0) - 97;
                const toRow = 8 - parseInt(lastMove.to[1]);
                const toSquare = document.querySelector(`.square[data-row="${toRow}"][data-col="${toCol}"]`);
                if (toSquare) toSquare.classList.add('last-move');
            }
        }
    }
   
    // Function to highlight king in check
    function highlightCheck() {
        // Clear previous check highlights
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('check');
        });
       
        if (game.in_check()) {
            // Find king's position
            let kingSquare = null;
           
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const sq = String.fromCharCode(97 + j) + (8 - i);
                    const piece = game.get(sq);
                   
                    if (piece && piece.type === 'k' && piece.color === game.turn()) {
                        kingSquare = sq;
                        break;
                    }
                }
               
                if (kingSquare) break;
            }
           
            if (kingSquare) {
                const col = kingSquare.charCodeAt(0) - 97;
                const row = 8 - parseInt(kingSquare[1]);
                const squareElement = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
               
                if (squareElement) squareElement.classList.add('check');
            }
        }
    }
   
    // Opening book for AI moves
    const openingBook = new Map();
    openingBook.set('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e4', 'd4', 'Nf3', 'c4']);
    openingBook.set('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e5', 'c5', 'e6', 'c6']);
    openingBook.set('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', ['Nf6', 'd5', 'f5', 'c5']);
    // Add more as needed
   
    // Endgame tablebase
    const endgameTablebase = new Map();
    endgameTablebase.set('8/8/8/8/8/8/8/k3K3 w - - 0 1', 'Ke2'); // Arbitrary move in drawn position
    endgameTablebase.set('8/8/8/8/8/8/1Q6/4K2k b - - 0 1', 'Kg3'); // Arbitrary, assuming checkmate sequence
    // Add more known endgame positions
   
    // Global variables for AI search optimization
    let killers = Array.from({length: 32}, () => []);
    let transpositionTable = new Map();
    let history = Array(64).fill().map(() => Array(64).fill(0));
   
    const pieceTypeToIndex = {'p':0, 'n':1, 'b':2, 'r':3, 'q':4, 'k':5};
    const mg_value = [82, 337, 365, 477, 1025, 0];
    const eg_value = [94, 281, 297, 512, 936, 0];
    const phaseInc = [0,1,1,2,4,0];
    const maxPhase = 24;
   
    // Simplified piece-square tables for faster evaluation
    const mg_pawn_table = [
        0, 0, 0, 0, 0, 0, 0, 0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0,
        5, -5, -10, 0, 0, -10, -5, 5,
        5, 10, 10, -20, -20, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0
    ];
   
    const eg_pawn_table = [
        0, 0, 0, 0, 0, 0, 0, 0,
        80, 80, 80, 80, 80, 80, 80, 80,
        50, 50, 50, 50, 50, 50, 50, 50,
        30, 30, 30, 30, 30, 30, 30, 30,
        20, 20, 20, 20, 20, 20, 20, 20,
        10, 10, 10, 10, 10, 10, 10, 10,
        10, 10, 10, 10, 10, 10, 10, 10,
        0, 0, 0, 0, 0, 0, 0, 0
    ];
   
    const mg_knight_table = [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50
    ];
   
    const eg_knight_table = [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50
    ];
   
    const mg_bishop_table = [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20
    ];
   
    const eg_bishop_table = [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20
    ];
   
    const mg_rook_table = [
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, 10, 10, 10, 10, 5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 0, 5, 5, 0, 0, 0
    ];
   
    const eg_rook_table = [
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, 10, 10, 10, 10, 5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 0, 5, 5, 0, 0, 0
    ];
   
    const mg_queen_table = [
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20
    ];
   
    const eg_queen_table = [
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20
    ];
   
    const mg_king_table = [
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        20, 20, 0, 0, 0, 0, 20, 20,
        20, 30, 10, 0, 0, 10, 30, 20
    ];
   
    const eg_king_table = [
        -50, -40, -30, -20, -20, -30, -40, -50,
        -30, -20, -10, 0, 0, -10, -20, -30,
        -30, -10, 20, 30, 30, 20, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 20, 30, 30, 20, -10, -30,
        -30, -30, 0, 0, 0, 0, -30, -30,
        -50, -30, -30, -30, -30, -30, -30, -50
    ];
   
    const mg_table = [mg_pawn_table, mg_knight_table, mg_bishop_table, mg_rook_table, mg_queen_table, mg_king_table];
    const eg_table = [eg_pawn_table, eg_knight_table, eg_bishop_table, eg_rook_table, eg_queen_table, eg_king_table];
   
    // Function to get square index from algebraic notation
    function getSquareIndex(square) {
        const col = square.charCodeAt(0) - 97;
        const row = 8 - parseInt(square[1]);
        return row * 8 + col;
    }
   
    // Improved negamax root function with better time management
    function improvedNegamaxRoot(timeLimit, maxDepth) {
        const startTime = Date.now();
        let bestMove = null;
        let bestValue = -Infinity;
       
        // Use existing tables if available, don't recreate every time
        if (!killers || killers.length === 0) {
            killers = Array.from({length: 32}, () => []);
        }
        if (!transpositionTable) {
            transpositionTable = new Map();
        }
        if (!history || history.length === 0) {
            history = Array(64).fill().map(() => Array(64).fill(0));
        }
       
        // Use iterative deepening with time management
        for (let depth = 1; depth <= maxDepth; depth++) {
            let alpha = -Infinity;
            let beta = Infinity;
            let currentBestValue = -Infinity;
            let currentBestMove = null;
           
            let moves = game.moves({verbose: true});
           
            // Use previous best move for move ordering
            if (bestMove) {
                moves = moves.sort((a, b) => {
                    if (a.san === bestMove.san) return -1;
                    if (b.san === bestMove.san) return 1;
                    return 0;
                });
            }
           
            moves = improvedSortMoves(moves, depth);
           
            let alphaWindow = alpha;
            let betaWindow = beta;
           
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                game.move(move);
               
                let value;
                if (i === 0) {
                    // Full window search for first move
                    value = -improvedNegamax(depth - 1, -betaWindow, -alphaWindow, startTime, timeLimit);
                } else {
                    // Null window search for other moves
                    value = -improvedNegamax(depth - 1, -alphaWindow - 1, -alphaWindow, startTime, timeLimit);
                    if (value > alphaWindow && value < betaWindow) {
                        // If promising, do full search
                        value = -improvedNegamax(depth - 1, -betaWindow, -alphaWindow, startTime, timeLimit);
                    }
                }
                game.undo();
               
                // Check if time is running out
                if (Date.now() - startTime > timeLimit * 0.8) {
                    // If time is short, return best move found so far
                    if (bestMove) return bestMove;
                    // If no best move yet, use quick fallback
                    return getQuickMoveWhenTimeRunningOut(startTime, timeLimit) || moves[0];
                }
               
                if (value > currentBestValue) {
                    currentBestValue = value;
                    currentBestMove = move;
                    alphaWindow = Math.max(alphaWindow, value);
                }
               
                if (value > bestValue) {
                    bestValue = value;
                    bestMove = move;
                }
               
                if (alphaWindow >= betaWindow) {
                    // Beta cutoff
                    killers[depth].unshift(move.san);
                    if (killers[depth].length > 2) killers[depth].pop();
                    const fromIdx = getSquareIndex(move.from);
                    const toIdx = getSquareIndex(move.to);
                    history[fromIdx][toIdx] += depth * depth;
                    break;
                }
            }
           
            // If we found a mate, we can stop searching
            if (currentBestValue > 10000 || currentBestValue < -10000) {
                break;
            }
        }
       
        return bestMove || getQuickMoveWhenTimeRunningOut(startTime, timeLimit) || game.moves({verbose: true})[0];
    }
   
    // Improved negamax function with time checks
    function improvedNegamax(depth, alpha, beta, startTime, timeLimit) {
        // Check time frequently
        if (Date.now() - startTime > timeLimit * 0.8) {
            return 0; // Return safe value when time is running out
        }
       
        const fen = game.fen() + depth;
       
        // Check transposition table
        if (transpositionTable.has(fen)) {
            const entry = transpositionTable.get(fen);
            if (entry.depth >= depth) {
                if (entry.flag === 'exact') return entry.value;
                if (entry.flag === 'lowerbound') alpha = Math.max(alpha, entry.value);
                if (entry.flag === 'upperbound') beta = Math.min(beta, entry.value);
                if (alpha >= beta) return entry.value;
            }
        }
       
        if (depth <= 0) {
            return improvedQuiescence(alpha, beta, startTime, timeLimit);
        }
       
        let bestValue = -Infinity;
        let bestMove = null;
        let moves = game.moves({verbose: true});
        moves = improvedSortMoves(moves, depth);
       
        let originalAlpha = alpha;
       
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            game.move(move);
           
            let value;
            if (i === 0) {
                value = -improvedNegamax(depth - 1, -beta, -alpha, startTime, timeLimit);
            } else {
                value = -improvedNegamax(depth - 1, -alpha - 1, -alpha, startTime, timeLimit);
                if (value > alpha && value < beta) {
                    value = -improvedNegamax(depth - 1, -beta, -alpha, startTime, timeLimit);
                }
            }
            game.undo();
           
            if (value > bestValue) {
                bestValue = value;
                bestMove = move.san;
            }
           
            alpha = Math.max(alpha, value);
           
            if (alpha >= beta) {
                killers[depth].unshift(move.san);
                if (killers[depth].length > 2) killers[depth].pop();
                const fromIdx = getSquareIndex(move.from);
                const toIdx = getSquareIndex(move.to);
                history[fromIdx][toIdx] += depth * depth;
                break;
            }
        }
       
        // Store in transposition table
        let flag = 'exact';
        if (bestValue <= originalAlpha) flag = 'upperbound';
        else if (bestValue >= beta) flag = 'lowerbound';
       
        transpositionTable.set(fen, {
            value: bestValue,
            bestMove: bestMove,
            depth: depth,
            flag: flag
        });
       
        return bestValue;
    }
   
    // Improved quiescence search
    function improvedQuiescence(alpha, beta, startTime, timeLimit) {
        // Check time
        if (Date.now() - startTime > timeLimit * 0.8) {
            return simplifiedEvaluateBoard();
        }
       
        let stand_pat = simplifiedEvaluateBoard();
       
        if (stand_pat >= beta) return beta;
        if (alpha < stand_pat) alpha = stand_pat;
       
        let moves = game.moves({verbose: true}).filter(m => m.captured);
        moves = improvedSortMoves(moves, -1);
       
        for (let move of moves) {
            game.move(move);
            let value = -improvedQuiescence(-beta, -alpha, startTime, timeLimit);
            game.undo();
           
            if (value >= beta) return beta;
            if (value > alpha) alpha = value;
        }
       
        return alpha;
    }
   
    // Improved move sorting
    function improvedSortMoves(moves, depth) {
        const ttKey = game.fen() + depth;
        let ttBestMove = null;
        if (transpositionTable.has(ttKey)) {
            const entry = transpositionTable.get(ttKey);
            ttBestMove = entry.bestMove;
        }
       
        function getMoveScore(move) {
            let score = 0;
           
            // Hash move
            if (ttBestMove && move.san === ttBestMove) {
                score += 10000;
            }
           
            // Captures (MVV-LVA)
            if (move.captured) {
                const victimValue = getPieceValue(move.captured);
                const attackerValue = getPieceValue(move.piece);
                score += 1000 + victimValue - attackerValue;
            }
           
            // Killer moves
            if (depth >= 0 && killers[depth].includes(move.san)) {
                score += 900;
            }
           
            // History heuristic
            const fromIdx = getSquareIndex(move.from);
            const toIdx = getSquareIndex(move.to);
            score += history[fromIdx][toIdx];
           
            // Promotion
            if (move.promotion) {
                score += 500;
            }
           
            return score;
        }
       
        return moves.sort((a, b) => getMoveScore(b) - getMoveScore(a));
    }
   
    // Simplified evaluation for faster computation
    function simplifiedEvaluateBoard() {
        // Quick material count for early exit
        let mgScore = 0;
        let egScore = 0;
        let phase = 0;
       
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const piece = game.get(String.fromCharCode(97 + j) + (8 - i));
               
                if (piece) {
                    const pidx = pieceTypeToIndex[piece.type];
                    phase += phaseInc[pidx];
                   
                    const squareIndex = i * 8 + j;
                    const flipIndex = (7 - i) * 8 + j;
                    const idx = piece.color === 'w' ? squareIndex : flipIndex;
                   
                    const mg = mg_value[pidx] + mg_table[pidx][idx];
                    const eg = eg_value[pidx] + eg_table[pidx][idx];
                    mgScore += piece.color === 'w' ? mg : -mg;
                    egScore += piece.color === 'w' ? eg : -eg;
                }
            }
        }
       
        phase = Math.min(phase, maxPhase);
        let score = (mgScore * phase + egScore * (maxPhase - phase)) / maxPhase;
       
        // Add simple mobility bonus
        const mobility = game.moves().length;
        score += mobility * 0.1;
       
        return game.turn() === 'w' ? score : -score;
    }
   
    // Function to get a quick move when time is running out
    function getQuickMoveWhenTimeRunningOut(startTime, timeLimit) {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeLimit * 0.8) {
            const moves = game.moves({verbose: true});
           
            // Prefer capturing moves
            const capturingMoves = moves.filter(m => m.captured);
            if (capturingMoves.length > 0) {
                // Sort by capture value
                capturingMoves.sort((a, b) => {
                    const aValue = getPieceValue(a.captured) - getPieceValue(a.piece);
                    const bValue = getPieceValue(b.captured) - getPieceValue(b.piece);
                    return bValue - aValue;
                });
                return capturingMoves[0];
            }
           
            // Prefer checks
            const checkingMoves = moves.filter(m => {
                game.move(m);
                const inCheck = game.in_check();
                game.undo();
                return inCheck;
            });
            if (checkingMoves.length > 0) {
                return checkingMoves[0];
            }
           
            // Prefer developing moves in opening
            if (game.history().length < 10) {
                const developingMoves = moves.filter(m => 
                    (m.piece === 'n' || m.piece === 'b') && 
                    !m.from.includes('1') && !m.from.includes('8') // Not from back rank
                );
                if (developingMoves.length > 0) {
                    return developingMoves[0];
                }
            }
           
            // Any legal move
            return moves[0];
        }
        return null;
    }

    // ===== Lightweight local engine wrapper (used for easy/medium so the
    // game stays fast and never needs to download Stockfish) =====
    function getLocalEngineMove(difficulty) {
        const fen = game.fen();

        // Opening book / endgame tablebase hits return a SAN string,
        // which chess.js's game.move() accepts directly.
        if (openingBook.has(fen)) {
            const bookMoves = openingBook.get(fen);
            return bookMoves[Math.floor(Math.random() * bookMoves.length)];
        }
        if (endgameTablebase.has(fen)) {
            return endgameTablebase.get(fen);
        }

        const localTimeSettings = {
            easy:   { time: 1000, depth: 1 },
            medium: { time: 2000, depth: 2 }
        };
        const settings = localTimeSettings[difficulty] || localTimeSettings.medium;
        return improvedNegamaxRoot(settings.time, settings.depth);
    }
   
    // ===================================================================
    // STOCKFISH ENGINE INTEGRATION
    // ===================================================================
    // This replaces the old hand-written negamax/evaluation engine with
    // the real Stockfish chess engine, run in a Web Worker so it never
    // blocks the UI thread.
    //
    // BANDWIDTH: the engine file (~1-2MB) is loaded from a free public CDN
    // (cdnjs / Cloudflare) instead of being hosted on Netlify, so it never
    // counts against your Netlify bandwidth quota. If the CDN is ever
    // unreachable, it automatically falls back to a local "stockfish.js"
    // file in your project root (if you keep one there).
    // ===================================================================
    const STOCKFISH_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.min.js';
    const STOCKFISH_LOCAL_FALLBACK_PATH = 'stockfish.js';

    // Wraps a promise with a hard timeout. If the promise hasn't settled by
    // then, we resolve with `timeoutValue` instead of waiting forever — this
    // is what stops the AI turn from hanging if Stockfish is slow to load or
    // never responds (e.g. wrong file, worker crashed silently, etc.).
    function withTimeout(promise, ms, timeoutValue) {
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.error(`Stockfish operation timed out after ${ms}ms, using fallback.`);
                resolve(timeoutValue);
            }, ms);

            promise.then((val) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(val);
            }).catch((err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                console.error('Stockfish operation rejected:', err);
                resolve(timeoutValue);
            });
        });
    }

    // Fetches the engine script as text and runs it in a Worker via a Blob
    // URL. This is the most compatible way to run a cross-origin script in
    // a Worker (more reliable across browsers than `new Worker(cdnUrl)`
    // directly). The browser's normal HTTP cache (plus our Service Worker)
    // will cache the CDN response, so this is only a real network fetch once.
    async function createStockfishWorker() {
        try {
            const response = await fetch(STOCKFISH_CDN_URL, { mode: 'cors' });
            if (!response.ok) throw new Error('CDN responded with status ' + response.status);
            const scriptText = await response.text();
            const blob = new Blob([scriptText], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            return new Worker(blobUrl);
        } catch (cdnErr) {
            console.error('Failed to load Stockfish from CDN, trying local fallback file:', cdnErr);
            // Fallback: try a locally-hosted copy, if one exists in the project.
            return new Worker(STOCKFISH_LOCAL_FALLBACK_PATH);
        }
    }

    const StockfishEngine = (function() {
        let worker = null;
        let isReady = false;
        let readyPromise = null;
        let pendingResolve = null;
        let currentSkillLevel = null;
        let initFailed = false;

        function init() {
            if (worker || initFailed) return readyPromise;
            readyPromise = (async () => {
                try {
                    worker = await createStockfishWorker();
                    return await new Promise((resolve) => {
                        worker.onmessage = function(event) {
                            const line = (event && event.data && event.data.data !== undefined)
                                ? event.data.data
                                : (typeof event.data === 'string' ? event.data : '');
                            handleMessage(line, resolve);
                        };
                        worker.onerror = function(err) {
                            console.error('Stockfish worker error (the engine script failed to run):', err);
                            initFailed = true;
                            resolve(false);
                        };
                        worker.postMessage('uci');
                        worker.postMessage('isready');
                    });
                } catch (e) {
                    console.error('Failed to start Stockfish worker (CDN and local fallback both failed):', e);
                    initFailed = true;
                    return false;
                }
            })();
            return readyPromise;
        }

        function handleMessage(line, resolveInit) {
            if (typeof line !== 'string' || line.length === 0) return;

            if (line === 'readyok') {
                isReady = true;
                if (resolveInit) resolveInit(true);
            } else if (line.startsWith('bestmove')) {
                const parts = line.split(' ');
                const bestMoveUci = parts[1];
                if (pendingResolve) {
                    const resolve = pendingResolve;
                    pendingResolve = null;
                    resolve(bestMoveUci && bestMoveUci !== '(none)' ? bestMoveUci : null);
                }
            }
        }

        function setSkillLevel(level) {
            level = Math.max(0, Math.min(20, level));
            if (level === currentSkillLevel) return;
            currentSkillLevel = level;
            if (worker) {
                worker.postMessage(`setoption name Skill Level value ${level}`);
            }
        }

        // options: { movetime: ms } or { depth: n }
        function getBestMove(fen, options) {
            return new Promise((resolve, reject) => {
                if (initFailed) {
                    reject(new Error('Stockfish is not available'));
                    return;
                }
                if (!worker) {
                    reject(new Error('Stockfish engine not initialized'));
                    return;
                }
                pendingResolve = resolve;
                worker.postMessage('stop');
                worker.postMessage(`position fen ${fen}`);
                if (options && options.movetime) {
                    worker.postMessage(`go movetime ${options.movetime}`);
                } else if (options && options.depth) {
                    worker.postMessage(`go depth ${options.depth}`);
                } else {
                    worker.postMessage('go depth 12');
                }
            });
        }

        function stop() {
            if (worker) worker.postMessage('stop');
        }

        return {
            init,
            setSkillLevel,
            getBestMove,
            stop,
            isReady: () => isReady,
            isAvailable: () => !initFailed
        };
    })();

    // NOTE: Stockfish is lazy-loaded (see makeAIMove below) — it starts
    // downloading as soon as a difficulty is picked (or at page load for a
    // returning player), rather than blocking the very first render.
    // All difficulty levels (easy through expert) now play through
    // Stockfish, just at different Skill Levels / think-times. The small
    // built-in local engine is kept only as an automatic fallback in case
    // Stockfish is ever unavailable (offline, CDN down, etc.).

    // Maps app difficulty levels to Stockfish's Skill Level (0-20) and a
    // thinking-time budget in milliseconds.
    const STOCKFISH_DIFFICULTY_SETTINGS = {
        easy:   { skill: 1,  movetime: 500  },
        medium: { skill: 6,  movetime: 1000 },
        hard:   { skill: 12, movetime: 1800 },
        expert: { skill: 20, movetime: 3000 }
    };

    // Converts a UCI move string like "e2e4" or "e7e8q" into the
    // {from, to, promotion} shape chess.js expects.
    function uciToMoveObject(uciMove) {
        return {
            from: uciMove.substring(0, 2),
            to: uciMove.substring(2, 4),
            promotion: uciMove.length > 4 ? uciMove.substring(4, 5) : undefined
        };
    }

    // Fallback used only if Stockfish is unavailable or fails to respond,
    // so the game never gets stuck if the engine file is missing.
    function makeRandomFallbackMove() {
        const moves = game.moves({ verbose: true });
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }

    let isAIThinking = false;
    // Function to make the AI (Black) move using Stockfish at a Skill Level
    // matched to the selected difficulty. Falls back to the lightweight
    // local engine if Stockfish is unavailable or times out.
    async function makeAIMove() {
        if (game.game_over()) return;
        if (isAIThinking) return; // never run two AI moves concurrently
        if (game.turn() !== 'b') return; // only ever move for Black

        isAIThinking = true;

        // Snapshot the position we're computing a move for. Since Stockfish
        // runs asynchronously, the board could in theory change while we
        // wait — this snapshot lets us detect that and safely discard a
        // now-stale move instead of applying it to the wrong position.
        const expectedFen = game.fen();
        function boardStillMatches() {
            return !game.game_over() && game.turn() === 'b' && game.fen() === expectedFen;
        }

        const difficulty = userSettings.difficulty;
        let move = null;

        const settings = STOCKFISH_DIFFICULTY_SETTINGS[difficulty] || STOCKFISH_DIFFICULTY_SETTINGS.medium;
        try {
            // Give the engine up to 20s to finish loading (first time only —
            // the asm.js file can be slow to parse on weaker phones).
            const ready = await withTimeout(StockfishEngine.init(), 20000, false);
            if (!ready || !StockfishEngine.isAvailable()) {
                throw new Error('Stockfish unavailable or timed out while loading');
            }
            if (!boardStillMatches()) {
                throw new Error('Board changed while Stockfish was loading; discarding stale request');
            }
            StockfishEngine.setSkillLevel(settings.skill);
            // Give the search itself a bit more time than requested, then give up.
            const uciMove = await withTimeout(
                StockfishEngine.getBestMove(game.fen(), { movetime: settings.movetime }),
                settings.movetime + 6000,
                null
            );
            if (!uciMove) {
                throw new Error('Stockfish did not return a move in time');
            }
            if (!boardStillMatches()) {
                throw new Error('Board changed while Stockfish was thinking; discarding stale move');
            }
            move = game.move(uciToMoveObject(uciMove));
        } catch (err) {
            console.error('Stockfish move failed, falling back to the local engine:', err);
            try {
                if (boardStillMatches()) {
                    const localMove = getLocalEngineMove(difficulty === 'easy' ? 'easy' : 'medium');
                    if (localMove) move = game.move(localMove);
                }
            } catch (err2) {
                console.error('Local engine fallback also failed:', err2);
            }
        }

        if (!move && boardStillMatches()) {
            const fallback = makeRandomFallbackMove();
            if (fallback) {
                move = game.move(fallback);
            }
        }

        if (move) {
            moveHistory.push(`${move.from}-${move.to}`);
            playMoveSound(move, false);
            switchPlayerTimer();
            updateBoard();
            updateGameStatus();
        }

        isAIThinking = false;
    }

   
    // FIXED: Function to apply selected theme to the board - RESET CSS VARIABLES FOR CLASSIC THEME
    function applyTheme(theme) {
        const chessboard = document.getElementById('chessboard');
        if (!chessboard) return;
        
        // Remove all existing theme classes
        chessboard.classList.remove('brown', 'green', 'pink', 'blue');
        
        // Add the selected theme class
        chessboard.classList.add(theme);
        
        // Apply specific theme styles
        switch(theme) {
            case 'brown':
                // Chess.com-style "Tan"/Brown board (this is the site's original default look)
                document.documentElement.style.setProperty('--light-square-bg', '#f0d9b5');
                document.documentElement.style.setProperty('--dark-square-bg', '#b58863');
                break;
            case 'green':
                // Chess.com-style "Green" board
                document.documentElement.style.setProperty('--light-square-bg', '#eeeed2');
                document.documentElement.style.setProperty('--dark-square-bg', '#769656');
                break;
            case 'pink':
                // Lichess-style "Pink" board
                document.documentElement.style.setProperty('--light-square-bg', '#f7dfe3');
                document.documentElement.style.setProperty('--dark-square-bg', '#c68490');
                break;
            case 'blue':
                // Chess.com-style "Pillow" board (puffy/cushioned blue & white).
                // Base colors here; the actual 3D puffy look is done with a
                // gradient + inset shadow in styles.css under .theme-blue.
                document.documentElement.style.setProperty('--light-square-bg', '#dee9f5');
                document.documentElement.style.setProperty('--dark-square-bg', '#6f9fc4');
                break;
        }
    }
   
    // MERGED: Setup promotion modal from Java.js
    const promotionOptions = document.querySelectorAll('#promotion-modal .option-card');
    promotionOptions.forEach(opt => {
        opt.addEventListener('click', function() {
            const promotion = this.getAttribute('data-promotion');
            const move = game.move({
                from: promotionFrom,
                to: promotionTo,
                promotion: promotion
            });
            if (move) {
                moveHistory.push(`${move.from}-${move.to}`);
                playMoveSound(move, true);
                switchPlayerTimer();
                updateBoard();
                updateGameStatus();
                if (!game.game_over()) {
                    setTimeout(() => {
                        if (!game.game_over() && game.turn() === 'b') {
                            makeAIMove();
                        }
                    }, 200);
                }
            }
            const promotionModal = document.getElementById('promotion-modal');
            if (promotionModal) promotionModal.style.display = 'none';
            resumeTimer();
            clearSelection();
        });
    });
   
    // Setup surrender modal
    const confirmSurrenderBtn = document.getElementById('confirm-surrender');
    if (confirmSurrenderBtn) {
        confirmSurrenderBtn.addEventListener('click', function() {
            endGame("White surrendered. Black wins!", false);
            const surrenderModal = document.getElementById('surrender-modal');
            if (surrenderModal) surrenderModal.style.display = 'none';
            // Removed resumeTimer() call because the game has ended and the timer should not resume
        });
    }
   
    const cancelSurrenderBtn = document.getElementById('cancel-surrender');
    if (cancelSurrenderBtn) {
        cancelSurrenderBtn.addEventListener('click', function() {
            const surrenderModal = document.getElementById('surrender-modal');
            if (surrenderModal) surrenderModal.style.display = 'none';
            resumeTimer();
        });
    }
   
    // Setup hint button
    const hintBtnEl = document.getElementById('hint-btn');
    if (hintBtnEl) {
        hintBtnEl.addEventListener('click', async function() {
            if (isAIThinking || isHintInProgress) return;
            if (userSettings.hints > 0) {
                pauseTimer();
                const success = await provideHint();
                if (!success) return; // system failure — don't charge the player
                userSettings.hints--;
                document.getElementById('hints-count').textContent = userSettings.hints;
                updateFeatureButtonsState();
               
                // Update statistics
                gameStats.hintsUsed++;
            } else {
                showCustomAlert("You've used all your hints.");
            }
        });
    }
   
    let isHintInProgress = false;

    async function provideHint() {
        if (isHintInProgress) return false;
        isHintInProgress = true;

        // Clear any previous hints
        clearHintVisualization();

        try {
            // Lazy-load Stockfish for the strongest possible hint, regardless of difficulty
            let bestMoveUci = null;
            try {
                const ready = await withTimeout(StockfishEngine.init(), 20000, false);
                if (!ready || !StockfishEngine.isAvailable()) {
                    throw new Error('Stockfish unavailable or timed out while loading');
                }
                StockfishEngine.setSkillLevel(20);
                bestMoveUci = await withTimeout(
                    StockfishEngine.getBestMove(game.fen(), { movetime: 1500 }),
                    7000,
                    null
                );
            } catch (err) {
                console.error('Hint request failed, falling back to local engine:', err);
            }

            let from = null, to = null, promotionChar = undefined;

            if (bestMoveUci) {
                from = bestMoveUci.substring(0, 2);
                to = bestMoveUci.substring(2, 4);
                promotionChar = bestMoveUci.length > 4 ? bestMoveUci.substring(4, 5) : undefined;
            } else {
                // Stockfish failed to respond — fall back to the local engine so
                // the player still gets a usable hint instead of nothing.
                let bestMove = null;
                try {
                    bestMove = improvedNegamaxRoot(1500, 2);
                } catch (err) {
                    console.error('Local engine hint fallback failed:', err);
                }
                if (bestMove) {
                    from = bestMove.from;
                    to = bestMove.to;
                }
            }

            if (from && to) {
                const fromSquare = getSquareElement(from);
                const toSquare = getSquareElement(to);
               
                if (fromSquare) fromSquare.classList.add('hint-from');
                if (toSquare) toSquare.classList.add('hint-to');
               
                setTimeout(() => {
                    clearHintVisualization();
                    resumeTimer();
                }, 3000);
                return true;
            } else {
                // No hint could be produced at all — this is a system
                // failure, not the player's fault, so don't charge them
                // for it.
                showCustomAlert("No hint available for this position.");
                resumeTimer();
                return false;
            }
        } finally {
            isHintInProgress = false;
        }
    }
   
    // Setup undo button - MODIFIED VERSION
    const undoBtnEl = document.getElementById('undo-btn');
    if (undoBtnEl) {
        undoBtnEl.addEventListener('click', function() {
            if (isAIThinking) return;
            
            // First check if there are moves to undo
            if (game.history().length === 0) {
                showCustomAlert("No moves to undo.");
                return; // Exit without deducting an undo attempt
            }
            
            if (userSettings.undos > 0) {
                undoLastMove();
                userSettings.undos--;
                document.getElementById('undos-count').textContent = userSettings.undos;
                updateFeatureButtonsState();
               
                // Update statistics
                gameStats.undosUsed++;
            } else {
                showCustomAlert("You've used all your undos.");
            }
        });
    }
   
    // FIXED: Function to undo the last move - preserve current time
    function undoLastMove() {
        // Save current time before undo
        const currentTime = playerTime;
        
        // Undo both player and AI move if possible
        game.undo();
        if (game.history().length > 0 && game.turn() === 'b') {
            game.undo(); // Undo AI move
        }
       
        // Restore current time instead of resetting it
        playerTime = currentTime;
        lowTimeWarned = playerTime <= 10;
        
        // Update the board
        updateBoard();
        updateGameStatus();
        clearSelection();
       
        // Update timer display with restored time
        updateTimerDisplay();
        
        // Restart timer if necessary
        if (userSettings.difficulty !== 'easy' && !isTimerPaused) {
            startTimer();
        }
       
        currentPlayer = 'white';
        updatePlayerIndicator();
    }
   
    // Setup new game button
    const newGameBtnEl = document.getElementById('new-game-btn');
    if (newGameBtnEl) {
        newGameBtnEl.addEventListener('click', function() {
            initNewGame();
        });
    }
   
    // Setup settings button
    const settingsBtnEl = document.getElementById('settings-btn');
    if (settingsBtnEl) {
        settingsBtnEl.addEventListener('click', function() {
            switchPage(1);
            const gameOverModal = document.getElementById('game-over-modal');
            if (gameOverModal) gameOverModal.style.display = 'none';
        });
    }
   
    // Setup next level button
    const nextLevelBtnEl = document.getElementById('next-level-btn');
    if (nextLevelBtnEl) {
        nextLevelBtnEl.addEventListener('click', function() {
            const difficulties = ['easy', 'medium', 'hard', 'expert'];
            const currentIndex = difficulties.indexOf(userSettings.difficulty);
           
            if (currentIndex < difficulties.length - 1) {
                const nextDifficulty = difficulties[currentIndex + 1];

                // Defense-in-depth: never advance to a level that isn't
                // actually unlocked, no matter how this got triggered.
                if (!isLevelUnlocked(nextDifficulty)) {
                    const gameOverModal = document.getElementById('game-over-modal');
                    if (gameOverModal) gameOverModal.style.display = 'none';
                    showUnlockModal('level', nextDifficulty);
                    return;
                }

                userSettings.difficulty = nextDifficulty;
                updateAttemptsBasedOnDifficulty();
                updateCurrentSettings();
                if (typeof StockfishEngine !== 'undefined') {
                    try {
                        StockfishEngine.init();
                    } catch (e) {
                        console.error('Stockfish prewarm failed:', e);
                    }
                }
                initNewGame();
            }
        });
    }
   
    // Setup import PGN button
    const importPgnBtnEl = document.getElementById('import-pgn-btn');
    if (importPgnBtnEl) {
        importPgnBtnEl.addEventListener('click', function() {
            pauseTimer();
            const importPgnModal = document.getElementById('import-pgn-modal');
            if (importPgnModal) importPgnModal.style.display = 'block';
        });
    }
   
    // NEW: Setup export PGN button with direct download
    const exportPgnBtnEl = document.getElementById('export-pgn-btn');
    if (exportPgnBtnEl) {
        exportPgnBtnEl.addEventListener('click', function() {
            if (isAIThinking) return;
            
            // Generate PGN content
            const pgnText = game.pgn();
            
            // Generate filename with timestamp and counter
            const now = new Date();
            const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
            
            // Get counter from localStorage or initialize to 1
            let exportCounter = parseInt(localStorage.getItem('chessPiExportCounter') || '0') + 1;
            localStorage.setItem('chessPiExportCounter', exportCounter.toString());
            
            const filename = `chess-pi-${timestamp}-${exportCounter}.pgn`;
            
            // Create blob and download
            const blob = new Blob([pgnText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Show success message
            showCustomAlert(`PGN exported successfully as ${filename}`);
        });
    }
   
    // Setup PGN import functionality
    const submitPgnBtnEl = document.getElementById('submit-pgn-btn');
    if (submitPgnBtnEl) {
        submitPgnBtnEl.addEventListener('click', function() {
            const pgnInputEl = document.getElementById('pgn-input');
            const fileInput = document.getElementById('pgn-file');
           
            let pgnText = pgnInputEl ? pgnInputEl.value : '';
           
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();
               
                reader.onload = function(e) {
                    pgnText = e.target.result;
                    importPGN(pgnText);
                };
               
                reader.readAsText(file);
            } else {
                importPGN(pgnText);
            }
        });
    }
   
    // MODIFIED: Function to import PGN - with validation and AI auto-play for black
    function importPGN(pgnText) {
        // Create a temporary game instance for validation
        const tempGame = new Chess();
        
        // Attempt to load the PGN and check the return value. load_pgn returns false for invalid PGN.
        const isPgnValid = tempGame.load_pgn(pgnText);
    
        if (!isPgnValid) {
            // If invalid, show an error and stop the process.
            showCustomAlert("Error importing PGN: The provided text is not a valid PGN format.");
            return; // Exit the function
        }
    
        try {
            // If the PGN is valid, proceed with the import logic
            game = new Chess();
            moveHistory = [];
            selectedSquare = null;
            validMoves = [];
            isImported = true;
            
            // Load the PGN into the main game object
            game.load_pgn(pgnText);
            updateBoard();
            updateGameStatus();
            
            // Reset game statistics for the imported game
            gameStats = {
                startTime: new Date().getTime(),
                totalMoves: 0,
                hintsUsed: 0,
                undosUsed: 0,
                threatsUsed: 0,
                extraTimeUsed: 0,
                gameResult: '',
                gameDuration: 0,
                difficulty: userSettings.difficulty
            };
            
            // Determine whose turn it is after import
            const turn = game.turn(); // 'w' or 'b'
            
            // Update current player based on the turn
            currentPlayer = (turn === 'w') ? 'white' : 'black';
            
            updatePlayerIndicator();
            
            // Reset and setup timer based on current state
            setupTimeControl();
            
            // If it's black's turn after import, make AI move automatically
            if (turn === 'b' && !game.game_over()) {
                setTimeout(() => {
                    if (!game.game_over() && game.turn() === 'b') {
                        makeAIMove();
                    }
                }, 500);
            }
            
            const importPgnModal = document.getElementById('import-pgn-modal');
            if (importPgnModal) importPgnModal.style.display = 'none';
            resumeTimer();
            showCustomAlert("PGN imported successfully! " + 
                (turn === 'b' ? "Bot AI will now play its move." : "It's your turn (White)."));
        } catch (error) {
            // Fallback catch for any other unexpected errors
            showCustomAlert("An unexpected error occurred during PGN import: " + error.message);
        }
    }
   
    // Setup PGN file input
    const pgnFileEl = document.getElementById('pgn-file');
    if (pgnFileEl) {
        pgnFileEl.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const pgnInputEl = document.getElementById('pgn-input');
                    if (pgnInputEl) pgnInputEl.value = e.target.result;
                };
                reader.readAsText(file);
            }
        });
    }
   
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        const modals = ['import-pgn-modal', 'promotion-modal', 'surrender-modal', 'stats-modal', 'leaderboard-modal'];
       
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal && event.target == modal) {
                modal.style.display = 'none';
                if (modalId !== 'stats-modal' && modalId !== 'leaderboard-modal') {
                    resumeTimer();
                }
            }
        });
    });
   
    // Close modals with close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (!modal) return;
            modal.style.display = 'none';
            if (!modal.id.includes('stats-modal') && modal.id !== 'leaderboard-modal') {
                resumeTimer();
            }
        });
    });
   
    // Initialize the game when page loads
    loadSettings();
    loadComprehensiveStats(); // Load comprehensive statistics
    initBoard();
    updateTranslations();

    // Since every difficulty level now uses Stockfish, start loading it now
    // (while the player is still on the welcome/menu pages) so it's likely
    // already ready by the time they reach the board.
    if (typeof StockfishEngine !== 'undefined') {
        try {
            StockfishEngine.init();
        } catch (e) {
            console.error('Stockfish prewarm failed:', e);
        }
    }
   
    // Statistics button functionality
    const statsBtnEl = document.getElementById('stats-btn');
    if (statsBtnEl) {
        statsBtnEl.addEventListener('click', function() {
            displayStatistics();
            const gameOverModal = document.getElementById('game-over-modal');
            const statsModal = document.getElementById('stats-modal');
            if (gameOverModal) gameOverModal.style.display = 'none';
            if (statsModal) statsModal.style.display = 'block';
        });
    }
   
    // Leaderboard button functionality (game-over modal) — opens a
    // standalone Leaderboard page/modal, separate from Statistics.
    const leaderboardBtnEl = document.getElementById('leaderboard-btn');
    if (leaderboardBtnEl) {
        leaderboardBtnEl.addEventListener('click', function() {
            const gameOverModal = document.getElementById('game-over-modal');
            const leaderboardModal = document.getElementById('leaderboard-modal');
            if (gameOverModal) gameOverModal.style.display = 'none';
            if (leaderboardModal) leaderboardModal.style.display = 'block';
            loadLeaderboard();
        });
    }

    // Leaderboard back button functionality — returns to Game Over modal
    const leaderboardBackBtnEl = document.getElementById('leaderboard-back-btn');
    if (leaderboardBackBtnEl) {
        leaderboardBackBtnEl.addEventListener('click', function() {
            const leaderboardModal = document.getElementById('leaderboard-modal');
            const gameOverModal = document.getElementById('game-over-modal');
            if (leaderboardModal) leaderboardModal.style.display = 'none';
            if (gameOverModal) gameOverModal.style.display = 'block';
        });
    }

    // Leaderboard close button functionality
    const leaderboardCloseEl = document.querySelector('.leaderboard-close');
    if (leaderboardCloseEl) {
        leaderboardCloseEl.addEventListener('click', function() {
            const leaderboardModal = document.getElementById('leaderboard-modal');
            const gameOverModal = document.getElementById('game-over-modal');
            if (leaderboardModal) leaderboardModal.style.display = 'none';
            if (gameOverModal) gameOverModal.style.display = 'block';
        });
    }

    // Statistics back button functionality
    const statsBackBtnEl = document.getElementById('stats-back-btn');
    if (statsBackBtnEl) {
        statsBackBtnEl.addEventListener('click', function() {
            const statsModal = document.getElementById('stats-modal');
            const gameOverModal = document.getElementById('game-over-modal');
            if (statsModal) statsModal.style.display = 'none';
            if (gameOverModal) gameOverModal.style.display = 'block';
        });
    }
   
    // Statistics close button functionality
    const statsCloseEl = document.querySelector('.stats-close');
    if (statsCloseEl) {
        statsCloseEl.addEventListener('click', function() {
            const statsModal = document.getElementById('stats-modal');
            const gameOverModal = document.getElementById('game-over-modal');
            if (statsModal) statsModal.style.display = 'none';
            if (gameOverModal) gameOverModal.style.display = 'block';
        });
    }
    
    // Tab functionality for statistics
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons and content
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab') + '-tab';
            const tabEl = document.getElementById(tabId);
            if (tabEl) tabEl.classList.add('active');
        });
    });

    // Fetches the top players from the server and renders them. Falls back
    // to a friendly message if the player isn't signed in with Pi, or if
    // the request fails for any reason (e.g. offline).
    async function loadLeaderboard() {
        const noteEl = document.getElementById('leaderboard-note');
        const listEl = document.getElementById('leaderboard-list');
        if (!noteEl || !listEl) return;

        noteEl.textContent = 'Loading...';
        noteEl.style.display = 'block';
        listEl.innerHTML = '';

        try {
            const response = await fetch('/.netlify/functions/get-leaderboard', {
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error('get-leaderboard returned status ' + response.status);
            const data = await response.json();
            const entries = Array.isArray(data.leaderboard) ? data.leaderboard : [];

            if (entries.length === 0) {
                noteEl.textContent = 'No players on the leaderboard yet — be the first!';
                return;
            }

            noteEl.style.display = 'none';
            entries.forEach((entry, index) => {
                const li = document.createElement('li');
                if (piUserUid && entry.uid === piUserUid) {
                    li.classList.add('leaderboard-me');
                }
                const rank = document.createElement('span');
                rank.className = 'leaderboard-rank';
                rank.textContent = `#${index + 1}`;
                const name = document.createElement('span');
                name.className = 'leaderboard-name';
                name.textContent = entry.username || 'Guest';
                const score = document.createElement('span');
                score.className = 'leaderboard-score';
                score.textContent = `${entry.wins || 0} wins (${entry.gamesPlayed || 0} played)`;
                li.appendChild(rank);
                li.appendChild(name);
                li.appendChild(score);
                listEl.appendChild(li);
            });
        } catch (err) {
            console.error('loadLeaderboard failed:', err);
            noteEl.textContent = 'Could not load the leaderboard right now. Please try again later.';
            noteEl.style.display = 'block';
        }
    }

    // Submits this player's current lifetime stats to the shared
    // leaderboard. Safe to call anytime; silently does nothing if the
    // player isn't signed in with Pi (no identity to attach the score to).
    async function submitScoreToLeaderboard() {
        if (!piAccessToken) return;
        try {
            await fetch('/.netlify/functions/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: piAccessToken,
                    username: piUsername,
                    wins: comprehensiveStats.overall.wins,
                    gamesPlayed: comprehensiveStats.overall.gamesPlayed,
                    winRate: comprehensiveStats.overall.winRate
                }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (err) {
            console.error('submitScoreToLeaderboard failed (will retry after the next game):', err);
        }
    }
    
    // Reset statistics button functionality
    const resetStatsBtnEl = document.getElementById('reset-stats-btn');
    if (resetStatsBtnEl) {
        resetStatsBtnEl.addEventListener('click', function() {
            if (confirm("Are you sure you want to reset all statistics? This cannot be undone.")) {
                comprehensiveStats = {
                    overall: {
                        gamesPlayed: 0,
                        wins: 0,
                        losses: 0,
                        draws: 0,
                        winRate: 0
                    },
                    byDifficulty: {
                        easy: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
                        medium: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
                        hard: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null },
                        expert: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, bestTime: null, fastestWin: null }
                    },
                    currentGame: {
                        result: '',
                        timeUsed: '',
                        moves: 0,
                        difficulty: ''
                    }
                };
                saveComprehensiveStats();
                displayComprehensiveStatistics();
                showCustomAlert("Statistics have been reset successfully!");
            }
        });
    }
});
