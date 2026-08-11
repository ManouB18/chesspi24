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

    // If a promo/refill toast (see showPromoMessage further down) would
    // otherwise appear while the custom alert modal is on screen — e.g.
    // Extra Time hits 0 the same moment "Added 1 minute!" pops up — it
    // gets stashed here instead of showing immediately, so it never
    // visibly stacks underneath the alert. Flushed the moment the alert
    // is dismissed, from whichever path closes it (OK button or tapping
    // outside).
    let pendingPromoMessages = null;
    function dismissCustomAlertModal() {
        const modal = document.getElementById('custom-alert-modal');
        if (modal) modal.style.display = 'none';
        if (typeof resumeTimer === 'function') resumeTimer();
        if (pendingPromoMessages) {
            const messages = pendingPromoMessages;
            pendingPromoMessages = null;
            showPromoMessage(messages);
        }
    }

    // Close the window when OK is clicked
    const customAlertOkBtn = document.getElementById('custom-alert-ok');
    if (customAlertOkBtn) {
        customAlertOkBtn.addEventListener('click', function() {
            dismissCustomAlertModal();
        });
    } else {
        console.error('#custom-alert-ok not found in HTML');
    }

    // Close when clicking outside the window
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('custom-alert-modal');
        if (modal && event.target === modal) {
            dismissCustomAlertModal();
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
        botPersonality: 'aggressive',
        hints: 1,
        undos: 1,
        threats: 1,
        extraTime: 1,
        soundMuted: false
    };

    // FREE TRIAL SYSTEM (continued): which locked theme/piece-set/level, if
    // any, is currently being sampled for free THIS session. In-memory only
    // (never persisted), so a reload always starts clean. renderLockState()
    // treats whichever item is named here as valid to keep on screen even
    // though it isn't actually unlocked, so a background progress sync
    // mid-trial can't silently snap the selection back to the default.
    // Cleared (and re-locked) the moment the trial game ends — see endGame().
    let activeTrialTheme = null;
    let activeTrialPieceSet = null;
    let activeTrialLevel = null;
    let activeTrialBotPersonality = null;

    // ===================================================================
    // PLAYER PROGRESS (unlocked levels/themes) — synced with the server via
    // the player's Pi identity, so it follows them across devices instead
    // of being tied to a single phone's local storage.
    // ===================================================================
    // Only Easy (level), Brown (theme), Neo (piece set), and the Aggressive
    // Attacker bot personality are unlocked by default. Everything else is
    // premium: levels unlock by beating the previous one for free, or
    // instantly with a Pi payment; themes, piece sets, and bot
    // personalities only unlock via a Pi payment (see the dynamic pricing
    // section below).
    let playerProgress = {
        unlockedLevels: ['easy'],
        unlockedThemes: ['brown'],
        unlockedPieceSets: ['neo'],
        unlockedBotPersonalities: ['aggressive'],
        // Pi Premium subscription state. premiumExpiresAt is an epoch-ms
        // timestamp; while it's in the future every level/theme/piece-set
        // is treated as unlocked (see isPremiumActive() below) without
        // touching the underlying unlockedLevels/Themes/PieceSets arrays,
        // so a lapsed subscription cleanly reveals whatever was already
        // owned outright.
        premiumPlan: null,       // 'monthly' | 'yearly' | null
        premiumExpiresAt: null,
        // Subset of the arrays above that were actually PAID for with Pi
        // (as opposed to levels earned for free by winning the previous
        // one). Tracked separately purely to grant the VIP leaderboard
        // badge to players who've spent Pi on the game — see isVipMember()
        // below. Purchases are permanent, so this never shrinks.
        purchasedLevels: [],
        purchasedThemes: [],
        purchasedPieceSets: [],
        purchasedBotPersonalities: [],
        // One-time free trial tracking: every locked level/theme/piece-set/
        // bot personality may be sampled for free exactly once (see
        // showUnlockModal-bypass logic in the option-card click handlers
        // below). Once an item's name lands in one of these arrays, its
        // single free trial has been spent and it goes straight to the
        // paywall from then on. Permanent/additive — never shrinks — same
        // shape as the purchasedX arrays above, and synced the same way.
        triedLevels: [],
        triedThemes: [],
        triedPieceSets: [],
        triedBotPersonalities: []
    };
    let piAccessToken = null;
    let piUserUid = null;
    let piUsername = null;

    // Extra safety net on top of the piAccessToken check: the Pi SDK
    // script (sdk.minepi.com/pi-sdk.js) loads fine in *any* browser, so
    // `typeof Pi !== 'undefined'` alone doesn't prove we're inside Pi
    // Browser — only that the script downloaded. Pi Browser's webview adds
    // "PiBrowser" to the user agent, so we check that too before ever
    // treating a session as eligible for the free trial. Belt-and-suspenders:
    // Pi.authenticate() should already fail/hang outside Pi Browser (it
    // needs the native app's message bridge), but this makes the
    // restriction explicit and not solely dependent on that behavior.
    function isPiBrowserEnvironment() {
        return typeof navigator !== 'undefined' && /PiBrowser/i.test(navigator.userAgent || '');
    }
    // Signed, server-issued token proving when the current game started and
    // at what difficulty (see start-game.js). Requested fresh for every new
    // game and consumed (single-use) by submit-score.js — never trust a
    // client-computed result/score without this.
    let currentGameToken = null;

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
                if (Array.isArray(parsed.unlockedBotPersonalities)) playerProgress.unlockedBotPersonalities = parsed.unlockedBotPersonalities;
                if (typeof parsed.premiumPlan === 'string') playerProgress.premiumPlan = parsed.premiumPlan;
                if (typeof parsed.premiumExpiresAt === 'number') playerProgress.premiumExpiresAt = parsed.premiumExpiresAt;
                if (Array.isArray(parsed.purchasedLevels)) playerProgress.purchasedLevels = parsed.purchasedLevels;
                if (Array.isArray(parsed.purchasedThemes)) playerProgress.purchasedThemes = parsed.purchasedThemes;
                if (Array.isArray(parsed.purchasedPieceSets)) playerProgress.purchasedPieceSets = parsed.purchasedPieceSets;
                if (Array.isArray(parsed.purchasedBotPersonalities)) playerProgress.purchasedBotPersonalities = parsed.purchasedBotPersonalities;
                if (Array.isArray(parsed.triedLevels)) playerProgress.triedLevels = parsed.triedLevels;
                if (Array.isArray(parsed.triedThemes)) playerProgress.triedThemes = parsed.triedThemes;
                if (Array.isArray(parsed.triedPieceSets)) playerProgress.triedPieceSets = parsed.triedPieceSets;
                if (Array.isArray(parsed.triedBotPersonalities)) playerProgress.triedBotPersonalities = parsed.triedBotPersonalities;
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
    // Bot personalities: Aggressive Attacker is free/unlocked from the
    // start (same role Easy/Brown/Neo play for their categories); Solid
    // Defender, Endgame Technician, and Gambit Trickster are premium and
    // unlock the same way themes/piece sets do (Pi payment only — there is
    // no free "beat the previous one" progression for personalities).
    const LOCKABLE_BOT_PERSONALITIES = ['defensive', 'endgame', 'trickster'];
    // Display metadata for each bot personality — used by the bot-selection
    // page (index.html cards use the same 'id's as data-bot-personality)
    // and by the unlock modal. 'free' mirrors how Easy/Brown/Neo work: the
    // one item in the category unlocked from the start.
    const BOT_PERSONALITIES = {
        aggressive: {
            id: 'aggressive',
            name: 'Aggressive Attacker',
            icon: 'fa-fire',
            desc: 'Sacrifices material for open lines and relentless attacks on your king.',
            free: true
        },
        defensive: {
            id: 'defensive',
            name: 'Solid Defender',
            icon: 'fa-shield-halved',
            desc: 'Locks up the position, keeps the king safe, and waits for you to overextend.',
            free: false
        },
        endgame: {
            id: 'endgame',
            name: 'Endgame Technician',
            icon: 'fa-chess-king',
            desc: 'Trades pieces the moment it gets ahead and converts small edges with precise endgame technique.',
            free: false
        },
        trickster: {
            id: 'trickster',
            name: 'Gambit Trickster',
            icon: 'fa-hat-wizard',
            desc: 'Opens with sharp gambits and early traps to throw your preparation off balance.',
            free: false
        }
    };
    const BOT_PERSONALITY_ORDER = ['aggressive', 'defensive', 'endgame', 'trickster'];

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
    const REFILL_PRICE_USD = 0.006;  // "Refill" feature top-up (no discount ever applies)
    const BUNDLE_DISCOUNT_RATE = 0.15; // 15% off when buying an entire remaining category at once

    // -------------------------------------------------------------
    // PI PREMIUM SUBSCRIPTION — separate from the Refill top-up above.
    // Two plans, priced in USD and converted to Pi at the live market
    // rate exactly like every other price in this file. The yearly plan
    // is deliberately priced below 12x the monthly rate so it can be
    // marketed as the "best value" option; the saved amount is derived
    // here (never hardcoded) so it always reflects the real numbers.
    // -------------------------------------------------------------
    const PREMIUM_MONTHLY_USD = 0.50;  // Pi Premium — monthly plan
    const PREMIUM_YEARLY_USD = 4.00;   // Pi Premium — yearly plan
    const PREMIUM_MONTHLY_DAYS = 30;
    const PREMIUM_YEARLY_DAYS = 365;
    // What 12 straight months of the monthly plan would have cost — the
    // baseline the yearly plan's savings are measured against.
    const PREMIUM_YEARLY_EQUIVALENT_USD = PREMIUM_MONTHLY_USD * 12;
    const PREMIUM_YEARLY_SAVINGS_USD = Math.round((PREMIUM_YEARLY_EQUIVALENT_USD - PREMIUM_YEARLY_USD) * 100) / 100;
    const PREMIUM_YEARLY_SAVINGS_PERCENT = Math.round((PREMIUM_YEARLY_SAVINGS_USD / PREMIUM_YEARLY_EQUIVALENT_USD) * 100);

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
    // "Refill" feature top-up price, in Pi. Flat $0.006 — never discounted,
    // regardless of how it's purchased.
    function getRefillPricePi() {
        return usdToPi(REFILL_PRICE_USD);
    }
    // Pi Premium subscription prices, in Pi, at the current market rate.
    function getPremiumMonthlyPricePi() {
        return usdToPi(PREMIUM_MONTHLY_USD);
    }
    function getPremiumYearlyPricePi() {
        return usdToPi(PREMIUM_YEARLY_USD);
    }

    // Returns true while a Pi Premium subscription is active (i.e. its
    // expiry timestamp is still in the future). A lapsed/never-purchased
    // subscription simply returns false — nothing else changes.
    // ── DEV/TEST TOGGLE ──────────────────────────────────────────────────
    // Set to true to bypass ALL paywalls locally (levels, themes, piece
    // sets, bot personalities, Premium) for testing without spending real
    // Pi. Every unlock check below ultimately falls back to
    // isPremiumActive(), so flipping this one flag unlocks everything.
    // MUST be set back to false before deploying / shipping to real users.
    const DEV_UNLOCK_ALL = false;

    function isPremiumActive() {
        if (DEV_UNLOCK_ALL) return true;
        return !!(playerProgress.premiumExpiresAt && playerProgress.premiumExpiresAt > Date.now());
    }
    // VIP leaderboard badge: true for an active Premium subscriber, OR a
    // player who has ever paid Pi for at least one theme, piece set, or
    // level unlock (permanent, so this never turns back off once earned —
    // unlike Premium, which only counts while it's active).
    function isVipMember() {
        return isPremiumActive()
            || (playerProgress.purchasedLevels && playerProgress.purchasedLevels.length > 0)
            || (playerProgress.purchasedThemes && playerProgress.purchasedThemes.length > 0)
            || (playerProgress.purchasedPieceSets && playerProgress.purchasedPieceSets.length > 0);
    }
    function isLevelUnlocked(level) {
        return isPremiumActive() || playerProgress.unlockedLevels.includes(level);
    }
    function isThemeUnlocked(theme) {
        return isPremiumActive() || playerProgress.unlockedThemes.includes(theme);
    }
    function isPieceSetUnlocked(pieceSet) {
        return isPremiumActive() || playerProgress.unlockedPieceSets.includes(pieceSet);
    }
    function isBotPersonalityUnlocked(personality) {
        return isPremiumActive() || playerProgress.unlockedBotPersonalities.includes(personality);
    }

    // FREE TRIAL SYSTEM: every locked level/theme/piece-set can be sampled
    // once for free, to give the player a taste of what they'd be buying.
    // hasTriedX() reports whether that single trial has already been used;
    // markXTried() spends it (permanent — never reset client-side).
    function hasTriedLevel(level) {
        return playerProgress.triedLevels.includes(level);
    }
    function hasTriedTheme(theme) {
        return playerProgress.triedThemes.includes(theme);
    }
    function hasTriedPieceSet(pieceSet) {
        return playerProgress.triedPieceSets.includes(pieceSet);
    }
    function hasTriedBotPersonality(personality) {
        return playerProgress.triedBotPersonalities.includes(personality);
    }
    // Records that a locked item's one-time free trial was just spent,
    // persists it locally, and syncs it to the server in the background
    // (best-effort — same pattern as recordPurchase()). Deliberately does
    // NOT touch unlockedLevels/Themes/PieceSets, so the item stays locked
    // for every selection after this one; renderLockState()'s safety net
    // is what actually snaps the UI/selection back to locked once it next
    // runs (app reload, returning to setup, next server sync, etc.).
    function markTried(category, name) {
        const key = category === 'level' ? 'triedLevels'
            : category === 'theme' ? 'triedThemes'
            : category === 'bot' ? 'triedBotPersonalities'
            : 'triedPieceSets';
        if (!playerProgress[key].includes(name)) {
            playerProgress[key].push(name);
            savePlayerProgressToLocalCache();
            syncProgressToServer();
        }
    }
    // One-time trial toast shown the moment a locked item is sampled for
    // free, so the player understands why it'll be locked again next time.
    function showTrialToast(displayName) {
        const message = (typeof i18next !== 'undefined' && i18next.t)
            ? i18next.t('freeTrialUsed', { name: displayName })
            : `Enjoy your one-time free trial of ${displayName}! It'll lock again after this — unlock it permanently anytime with Pi.`;
        showCustomAlert(message);
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
    function getRemainingLockedBotPersonalities() {
        return LOCKABLE_BOT_PERSONALITIES.filter(b => !isBotPersonalityUnlocked(b));
    }

    // Refreshes the lock icon/dimming on every difficulty & theme card to
    // match the current playerProgress. Safe to call anytime (page load,
    // after a payment, after a win, after the server sync resolves, etc.).
    // Toggles a card's locked/unlocked visual state, including swapping
    // its lock badge between a closed padlock (still locked) and an open
    // one (purchased/unlocked) — see the .lock-overlay.unlocked-badge rule
    // in styles.css. Cards that were never locked to begin with (the
    // free-by-default item in each category) have no .lock-overlay element
    // at all, so the querySelector below simply finds nothing for them.
    function setCardLockState(card, unlocked) {
        card.classList.toggle('locked', !unlocked);
        const badge = card.querySelector('.lock-overlay');
        if (!badge) return;
        const icon = badge.querySelector('i');
        badge.classList.toggle('unlocked-badge', unlocked);
        if (icon) {
            icon.classList.toggle('fa-lock', !unlocked);
            icon.classList.toggle('fa-lock-open', unlocked);
        }
    }

    function renderLockState() {
        document.querySelectorAll('.option-card[data-difficulty]').forEach((card) => {
            const level = card.getAttribute('data-difficulty');
            setCardLockState(card, isLevelUnlocked(level));
        });
        document.querySelectorAll('.option-card[data-theme]').forEach((card) => {
            const theme = card.getAttribute('data-theme');
            setCardLockState(card, isThemeUnlocked(theme));
        });
        document.querySelectorAll('.option-card[data-piece-set]').forEach((card) => {
            const pieceSet = card.getAttribute('data-piece-set');
            setCardLockState(card, isPieceSetUnlocked(pieceSet));
        });
        document.querySelectorAll('.option-card[data-bot-personality]').forEach((card) => {
            const personality = card.getAttribute('data-bot-personality');
            setCardLockState(card, isBotPersonalityUnlocked(personality));
        });
        // Puzzle type/difficulty cards: Premium-subscription-only gating,
        // no per-item purchase and no free trial (see the PUZZLE MODE
        // section below) — isPuzzleTypeUnlocked()/isPuzzleDifficultyUnlocked()
        // just check meta.free || isPremiumActive().
        document.querySelectorAll('.option-card[data-puzzle-type]').forEach((card) => {
            const type = card.getAttribute('data-puzzle-type');
            setCardLockState(card, isPuzzleTypeUnlocked(type));
        });
        document.querySelectorAll('.option-card[data-puzzle-difficulty]').forEach((card) => {
            const diff = card.getAttribute('data-puzzle-difficulty');
            setCardLockState(card, isPuzzleDifficultyUnlocked(diff));
        });

        // Safety net: if the currently-selected difficulty somehow isn't
        // unlocked (e.g. stale saved settings), fall back to Easy so the
        // player can never get stuck on a locked level. An item currently
        // being sampled via its one-time free trial is exempted so this
        // net doesn't yank it away mid-session (e.g. a background progress
        // sync resolving while a trial game is in progress) — the trial
        // ends, and this net starts applying to it again, only once
        // endGame() clears the active-trial flag.
        if (!isLevelUnlocked(userSettings.difficulty) && userSettings.difficulty !== activeTrialLevel) {
            userSettings.difficulty = 'easy';
        }
        if (!isThemeUnlocked(userSettings.theme) && userSettings.theme !== activeTrialTheme) {
            userSettings.theme = 'brown';
        }
        if (!isPieceSetUnlocked(userSettings.pieceSet) && userSettings.pieceSet !== activeTrialPieceSet) {
            userSettings.pieceSet = 'neo';
        }
        if (!isBotPersonalityUnlocked(userSettings.botPersonality) && userSettings.botPersonality !== activeTrialBotPersonality) {
            userSettings.botPersonality = 'aggressive';
        }
    }

    // Merges newly-unlocked items into playerProgress (no duplicates),
    // updates the local cache immediately, and syncs to the server in the
    // background if we have a verified Pi identity.
    function grantProgress({ levels = [], themes = [], pieceSets = [], botPersonalities = [] } = {}) {
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
        botPersonalities.forEach((bp) => {
            if (!playerProgress.unlockedBotPersonalities.includes(bp)) {
                playerProgress.unlockedBotPersonalities.push(bp);
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

    // Records that levels/themes/piece-sets were actually PAID for (never
    // called for the free "beat the previous level" unlock) — purely to
    // qualify the player for the VIP leaderboard badge. Additive/permanent,
    // same merge shape as grantProgress(), and also nudges the server to
    // refresh the player's leaderboard entry immediately (if they already
    // have one) so the badge doesn't wait for their next game to appear.
    function recordPurchase({ levels = [], themes = [], pieceSets = [], botPersonalities = [] } = {}) {
        let changed = false;
        levels.forEach((lvl) => {
            if (!playerProgress.purchasedLevels.includes(lvl)) {
                playerProgress.purchasedLevels.push(lvl);
                changed = true;
            }
        });
        themes.forEach((thm) => {
            if (!playerProgress.purchasedThemes.includes(thm)) {
                playerProgress.purchasedThemes.push(thm);
                changed = true;
            }
        });
        pieceSets.forEach((ps) => {
            if (!playerProgress.purchasedPieceSets.includes(ps)) {
                playerProgress.purchasedPieceSets.push(ps);
                changed = true;
            }
        });
        botPersonalities.forEach((bp) => {
            if (!playerProgress.purchasedBotPersonalities.includes(bp)) {
                playerProgress.purchasedBotPersonalities.push(bp);
                changed = true;
            }
        });
        if (changed) {
            savePlayerProgressToLocalCache();
            syncProgressToServer();
            pingVipStatusUpdate();
        }
        return changed;
    }

    // Tells the server to recompute this player's VIP flag on their
    // existing leaderboard entry right away (Premium purchase or a themed
    // unlock, not just a new game). Fire-and-forget: harmless if it fails
    // or if the player has no leaderboard entry yet — the flag will still
    // be set correctly the next time they submit a score.
    function pingVipStatusUpdate() {
        if (!piAccessToken) return;
        fetch('/.netlify/functions/update-vip-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: piAccessToken }),
            signal: AbortSignal.timeout(10000)
        }).catch((err) => console.error('pingVipStatusUpdate failed (badge will still update next game):', err));
    }

    // Activates (or extends) Pi Premium after a successful subscription
    // payment. Cached locally immediately (works offline) and pushed to
    // the server in the background so the subscription follows the
    // player's Pi identity across devices, the same way grantProgress()
    // does for owned levels/themes/piece-sets.
    // If the player already has active time left on their subscription,
    // the new period is added on top instead of overwriting it, so
    // renewing early never costs them any remaining days.
    function grantPremium(plan) {
        const days = plan === 'yearly' ? PREMIUM_YEARLY_DAYS : PREMIUM_MONTHLY_DAYS;
        const msToAdd = days * 24 * 60 * 60 * 1000;
        const base = isPremiumActive() ? playerProgress.premiumExpiresAt : Date.now();
        playerProgress.premiumPlan = plan;
        playerProgress.premiumExpiresAt = base + msToAdd;
        savePlayerProgressToLocalCache();
        syncProgressToServer();
        pingVipStatusUpdate();
        renderLockState();
        renderPremiumState();
    }

    // Keeps the crown button glowing (and the premium modal's status line
    // up to date) whenever Premium is active. Safe to call anytime.
    function renderPremiumState() {
        const premiumBtn = document.getElementById('premium-btn');
        const active = isPremiumActive();
        if (premiumBtn) premiumBtn.classList.toggle('premium-active', active);

        // Small day-count badge on the crown icon itself, so the player can
        // see at a glance — without opening the modal — how long they have
        // left. Turns to a warning color once it's down to its last 3 days.
        const daysBadge = document.getElementById('premium-days-badge');
        if (daysBadge) {
            if (active) {
                const daysLeft = getPremiumDaysLeft();
                daysBadge.textContent = daysLeft;
                daysBadge.style.display = 'flex';
                daysBadge.classList.toggle('premium-days-badge-warning', daysLeft <= 3);
                daysBadge.setAttribute('title', formatPremiumExpiryTitle());
            } else {
                daysBadge.style.display = 'none';
            }
        }

        const statusText = document.getElementById('premium-status-text');
        if (statusText) {
            const t = (typeof i18next !== 'undefined' && i18next.t) ? i18next.t.bind(i18next) : (key, opts) => key;
            if (active) {
                const daysLeft = getPremiumDaysLeft();
                const planKey = playerProgress.premiumPlan === 'yearly' ? 'premiumYearlyLabel' : 'premiumMonthlyLabel';
                statusText.textContent = t('premiumStatusActive', {
                    plan: t(planKey),
                    date: formatPremiumExpiryDate(),
                    days: daysLeft
                });
                statusText.classList.remove('premium-status-expired');
            } else if (playerProgress.premiumExpiresAt) {
                // Was subscribed before, but the period has now lapsed —
                // nudge toward renewing instead of leaving the line blank.
                statusText.textContent = t('premiumStatusExpired', { date: formatPremiumExpiryDate() });
                statusText.classList.add('premium-status-expired');
            } else {
                statusText.textContent = '';
                statusText.classList.remove('premium-status-expired');
            }
        }
    }

    // Whole days remaining on the current subscription (minimum 1 while
    // still active, so "less than a day left" never displays as 0).
    function getPremiumDaysLeft() {
        if (!playerProgress.premiumExpiresAt) return 0;
        return Math.max(1, Math.ceil((playerProgress.premiumExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    }

    // Formats the subscription's expiry timestamp as a date, e.g.
    // "August 15, 2026" — used in both the modal status line and the
    // crown button's tooltip.
    function formatPremiumExpiryDate() {
        if (!playerProgress.premiumExpiresAt) return '';
        try {
            return new Date(playerProgress.premiumExpiresAt).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        } catch (e) {
            return new Date(playerProgress.premiumExpiresAt).toDateString();
        }
    }
    function formatPremiumExpiryTitle() {
        const t = (typeof i18next !== 'undefined' && i18next.t) ? i18next.t.bind(i18next) : (key, opts) => key;
        return t('premiumExpiryTooltip', { date: formatPremiumExpiryDate() });
    }

    // Proactively nudges the player toward renewing: once per page load,
    // if Premium is active but has 3 days or fewer left, or if it already
    // lapsed, shows a one-time alert. Never fires for a player who has
    // never subscribed (premiumPlan is still null).
    let premiumExpiryReminderShown = false;
    function checkPremiumExpiryReminder() {
        if (premiumExpiryReminderShown || !playerProgress.premiumPlan) return;
        const t = (typeof i18next !== 'undefined' && i18next.t) ? i18next.t.bind(i18next) : (key, opts) => key;
        if (isPremiumActive()) {
            const daysLeft = getPremiumDaysLeft();
            if (daysLeft <= 3) {
                premiumExpiryReminderShown = true;
                showCustomAlert(t('premiumReminderExpiringSoon', { days: daysLeft, date: formatPremiumExpiryDate() }));
            }
        } else if (playerProgress.premiumExpiresAt) {
            premiumExpiryReminderShown = true;
            showCustomAlert(t('premiumReminderExpired', { date: formatPremiumExpiryDate() }));
        }
    }

    // Fetches the player's server-saved progress (requires a verified Pi
    // identity) and merges it locally. Safe to call even if the player
    // isn't authenticated yet — it just does nothing in that case.
    //
    // Shared by fetchProgressFromServer() and syncProgressToServer() below —
    // see the BUG FIX note on syncProgressToServer() for why merging
    // (rather than overwriting) matters for both.
    function mergeServerProgressIn(serverProgress) {
        (serverProgress.unlockedLevels || []).forEach((lvl) => {
            if (!playerProgress.unlockedLevels.includes(lvl)) playerProgress.unlockedLevels.push(lvl);
        });
        (serverProgress.unlockedThemes || []).forEach((thm) => {
            if (!playerProgress.unlockedThemes.includes(thm)) playerProgress.unlockedThemes.push(thm);
        });
        (serverProgress.unlockedPieceSets || []).forEach((ps) => {
            if (!playerProgress.unlockedPieceSets.includes(ps)) playerProgress.unlockedPieceSets.push(ps);
        });
        (serverProgress.unlockedBotPersonalities || []).forEach((bp) => {
            if (!playerProgress.unlockedBotPersonalities.includes(bp)) playerProgress.unlockedBotPersonalities.push(bp);
        });
        (serverProgress.purchasedLevels || []).forEach((lvl) => {
            if (!playerProgress.purchasedLevels.includes(lvl)) playerProgress.purchasedLevels.push(lvl);
        });
        (serverProgress.purchasedThemes || []).forEach((thm) => {
            if (!playerProgress.purchasedThemes.includes(thm)) playerProgress.purchasedThemes.push(thm);
        });
        (serverProgress.purchasedPieceSets || []).forEach((ps) => {
            if (!playerProgress.purchasedPieceSets.includes(ps)) playerProgress.purchasedPieceSets.push(ps);
        });
        (serverProgress.purchasedBotPersonalities || []).forEach((bp) => {
            if (!playerProgress.purchasedBotPersonalities.includes(bp)) playerProgress.purchasedBotPersonalities.push(bp);
        });
        (serverProgress.triedLevels || []).forEach((lvl) => {
            if (!playerProgress.triedLevels.includes(lvl)) playerProgress.triedLevels.push(lvl);
        });
        (serverProgress.triedThemes || []).forEach((thm) => {
            if (!playerProgress.triedThemes.includes(thm)) playerProgress.triedThemes.push(thm);
        });
        (serverProgress.triedPieceSets || []).forEach((ps) => {
            if (!playerProgress.triedPieceSets.includes(ps)) playerProgress.triedPieceSets.push(ps);
        });
        (serverProgress.triedBotPersonalities || []).forEach((bp) => {
            if (!playerProgress.triedBotPersonalities.includes(bp)) playerProgress.triedBotPersonalities.push(bp);
        });
        // Pi Premium: adopt the server's expiry only if it's later than
        // what we already have locally, so an active subscription
        // (bought here or on another device) is never lost by a
        // stale/older server record overwriting it.
        const serverPremiumExpiry = typeof serverProgress.premiumExpiresAt === 'number' ? serverProgress.premiumExpiresAt : null;
        if (serverPremiumExpiry && (!playerProgress.premiumExpiresAt || serverPremiumExpiry > playerProgress.premiumExpiresAt)) {
            playerProgress.premiumExpiresAt = serverPremiumExpiry;
            playerProgress.premiumPlan = serverProgress.premiumPlan || playerProgress.premiumPlan;
        }
    }

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
            mergeServerProgressIn(serverProgress);
            savePlayerProgressToLocalCache();
            renderLockState();
            renderPremiumState();
            console.log('Player progress loaded from server:', playerProgress);
        } catch (err) {
            console.error('fetchProgressFromServer failed (using local cache only):', err);
        }
    }

    // Pushes the current local progress up to the server. Safe to call
    // anytime; silently does nothing if we don't have a verified identity.
    //
    // BUG FIX: this used to REPLACE playerProgress wholesale with whatever
    // save-progress.js returned. That's dangerous for unlockedLevels
    // specifically: save-progress.js deliberately ignores anything the
    // client sends for that field (see its own comments — it's a paid-
    // content gate, not a trial record) and recomputes it server-side from
    // purchases + earned levels. A level just earned by winning is granted
    // by submit-score.js as a *separate* request that may not have landed
    // yet (or may be in flight concurrently) when this call's response
    // comes back — so the old wholesale-replace could, and did, wipe a
    // just-earned unlock back out of local state (and localStorage) within
    // moments of granting it. Merging here, the same safe way
    // fetchProgressFromServer() already does, means this call can only
    // ever ADD confirmed server state, never remove an unlock the player
    // already has locally.
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
            mergeServerProgressIn(savedProgress);
            savePlayerProgressToLocalCache();
            renderLockState();
            renderPremiumState();
        } catch (err) {
            console.error('syncProgressToServer failed (progress stays cached locally for now):', err);
        }
    }

    // Requests a fresh signed game token from the server for a game about
    // to start at the given difficulty (see start-game.js). This token is
    // what submit-score.js uses to determine difficulty/timing at the end
    // of the game — the client's own report of the result is only ever
    // trusted alongside a valid token for THIS specific game.
    async function requestGameToken(difficulty) {
        currentGameToken = null;
        if (!piAccessToken) return; // not signed in — nothing to credit anyway
        try {
            const response = await fetch('/.netlify/functions/start-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: piAccessToken, difficulty }),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error('start-game returned status ' + response.status);
            const data = await response.json();
            currentGameToken = data.gameToken || null;
        } catch (err) {
            console.error('requestGameToken failed (this game will not be eligible for the leaderboard):', err);
            currentGameToken = null;
        }
    }

    // Silently authenticates with Pi (if available) and pulls the player's
    // saved progress. Wrapped so it never blocks or breaks the game if Pi
    // Browser isn't available (e.g. testing in a regular browser) or the
    // player declines the permission prompt.
    async function initializePiIdentityAndProgress() {
        loadPlayerProgressFromLocalCache(); // instant, works offline
        renderLockState();
        renderPremiumState();
        fetchPiUsdPrice().catch(() => {}); // warm the price cache in the background; never blocks init
        try {
            // Must await this BEFORE checking `typeof Pi` — the SDK now
            // loads dynamically with retries (see index.html), so Pi can
            // still be legitimately undefined here for a couple of
            // seconds while a retry is in flight, not just when it's
            // permanently unavailable. Checking too early was returning
            // early (silently skipping sign-in) even on runs that would
            // have succeeded a moment later.
            if (window.piInitPromise) {
                try {
                    await window.piInitPromise;
                } catch (err) {
                    return; // SDK truly unavailable this session (already logged in index.html)
                }
            }
            if (typeof Pi === 'undefined') return; // Pi SDK script didn't load
            // NOTE: intentionally NOT gating this on isPiBrowserEnvironment().
            // That check reads navigator.userAgent, and on a cold load inside
            // Pi Browser's webview the "PiBrowser" token isn't always present
            // yet (it can show up only after a reload), which was blocking
            // real Pi Browser users from ever authenticating — the exact
            // "works after refresh" symptom this fixes. Pi.authenticate()
            // itself already fails/hangs harmlessly outside Pi Browser (no
            // native message bridge), so it's a safe, more reliable gate on
            // its own. isPiBrowserEnvironment() is still used as an extra
            // check specifically around free-trial grants further below.
            // Race against a 15s timeout so a stalled connection to Pi's
            // auth servers can't leave this hanging forever — it just
            // falls back to local-only progress (caught below) instead.
            const auth = await Promise.race([
                Pi.authenticate(['username', 'payments'], resolveIncompletePayment),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Pi.authenticate timed out after 15s')), 15000))
            ]);
            if (auth && auth.accessToken && auth.user) {
                piAccessToken = auth.accessToken;
                piUserUid = auth.user.uid;
                piUsername = auth.user.username || null;
                updatePlayerNameDisplay();
                await fetchProgressFromServer();
            }
        } catch (err) {
            console.error('Pi identity init failed (continuing with local progress only):', err);
        } finally {
            // Runs whether or not Pi auth/server sync succeeded, using
            // whatever the most up-to-date progress we managed to get is
            // (server-synced if available, local cache otherwise).
            checkPremiumExpiryReminder();
        }
    }

    // Shows the authenticated Pi Network username in place of "Guest"
    // wherever the player's name is displayed. Falls back to the normal
    // "Guest" translation if no Pi username is available (e.g. testing
    // outside Pi Browser, or the player declined the permission prompt).
    function updatePlayerNameDisplay() {
        const el = document.getElementById('player-text');
        if (el) el.textContent = piUsername || i18next.t('whiteLabel');
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
   
    // Sound settings: all short gameplay effects are packed into a single
    // sprite file (sounds/sprite.mp3) so a whole game only costs ONE audio
    // request instead of one request per distinct sound effect. Offsets
    // below (ms) were generated from the original individual mp3 files.
    let isMuted = false;
    const SOUND_SPRITE_MAP = {
        'game-start':    [0, 248],
        'move-self':     [408, 196],
        'move-opponent': [764, 196],
        'capture':       [1121, 223],
        'promote':       [1503, 248],
        'castle':        [1912, 275],
        'illegal':       [2346, 275],
        'move-check':    [2781, 275],
        'checkmate':     [3215, 248],
        'game-end':      [3624, 248],
        'game-win':      [4032, 249],
        'game-lose':     [4440, 586],
        'game-draw':     [5187, 352],
        'tenseconds':    [5699, 536]
    };
    const spriteHowl = new Howl({
        src: ['sounds/sprite.mp3'],
        sprite: SOUND_SPRITE_MAP
    });
    const activeSoundIds = {};
    const sounds = new Proxy({}, {
        get: function(target, name) {
            return {
                play: function() {
                    activeSoundIds[name] = spriteHowl.play(name);
                    return activeSoundIds[name];
                },
                stop: function() {
                    if (activeSoundIds[name] !== undefined) {
                        spriteHowl.stop(activeSoundIds[name]);
                    }
                }
            };
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
                    chooseBotPersonality: "Choose Your Opponent",
                    whitesTurn: "White's Turn",
                    blacksTurn: "Bot AI",
                    whiteLabel: "Guest",
                    gameInProgress: "Game in progress",
                    hint: "Hint",
                    undo: "Undo",
                    threats: "Threats",
                    extraTime: "+ Time",
                    refill: "Refill",
                    help: "Help",
                    exportPGN: "Exp PGN",
                    importPGN: "Imp PGN",
                    timeLeft: "Time Left",
                    premiumAriaLabel: "Chess Pi Premium subscription",
                    premiumTitle: "Chess Pi Premium",
                    premiumDesc: "Unlock every level, board theme, piece set, and bot personality for as long as your subscription is active.",
                    premiumMonthlyLabel: "Monthly",
                    premiumYearlyLabel: "Yearly",
                    premiumBestValue: "Best Value",
                    premiumMonthlySub: "$0.50 / month",
                    premiumYearlySub: "$4.00 / year",
                    premiumSavings: "Save ${{amount}}/year ({{percent}}% off the monthly price)",
                    premiumFineprint: "Payments are one-time Pi charges that activate Premium for the plan's period; renew any time before or after it ends to keep your access uninterrupted.",
                    premiumStatusActive: "{{plan}} Premium active — expires {{date}} ({{days}} day(s) left). Subscribing again adds to this.",
                    premiumStatusExpired: "Your Premium subscription expired on {{date}}. Subscribe again to unlock everything.",
                    premiumExpiryTooltip: "Chess Pi Premium expires {{date}}",
                    premiumReminderExpiringSoon: "Your Chess Pi Premium subscription expires in {{days}} day(s), on {{date}}. Renew now to avoid losing access.",
                    premiumReminderExpired: "Your Chess Pi Premium subscription expired on {{date}}. Tap the crown icon to renew and unlock everything again.",
                    vipBadgeTooltip: "Pi VIP — Premium subscriber or has purchased premium content",
                    freeTrialUsed: "Enjoy your one-time free trial of {{name}}! It'll lock again after this — unlock it permanently anytime with Pi.",
                    alreadyTriedNote: "You already used your free trial for this — unlock it permanently with Pi to keep using it."
                }
            }
            // English only. To add another language back in the future,
            // add its own top-level key here (e.g. fr: { translation: {...} }).
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
            if (q('.bot-page .page-title')) q('.bot-page .page-title').innerHTML = i18next.t('chooseBotPersonality');
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

            // Pi Premium button + modal
            const premiumBtnEl = document.getElementById('premium-btn');
            if (premiumBtnEl) premiumBtnEl.setAttribute('aria-label', i18next.t('premiumAriaLabel'));
            if (document.getElementById('premium-modal-title')) document.getElementById('premium-modal-title').textContent = i18next.t('premiumTitle');
            if (document.getElementById('premium-modal-desc')) document.getElementById('premium-modal-desc').textContent = i18next.t('premiumDesc');
            if (q('#premium-monthly-btn .premium-plan-name')) q('#premium-monthly-btn .premium-plan-name').textContent = i18next.t('premiumMonthlyLabel');
            if (q('#premium-yearly-btn .premium-plan-name')) q('#premium-yearly-btn .premium-plan-name').textContent = i18next.t('premiumYearlyLabel');
            if (document.getElementById('premium-best-badge')) document.getElementById('premium-best-badge').textContent = i18next.t('premiumBestValue');
            if (document.getElementById('premium-monthly-sub')) document.getElementById('premium-monthly-sub').textContent = i18next.t('premiumMonthlySub');
            if (document.getElementById('premium-yearly-sub')) document.getElementById('premium-yearly-sub').textContent = i18next.t('premiumYearlySub');
            if (q('.premium-fineprint')) q('.premium-fineprint').textContent = i18next.t('premiumFineprint');
            renderPremiumState();

            // English only — always left-to-right.
            document.body.dir = 'ltr';
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
                // The one-time free trial can only be tracked reliably for
                // a verified Pi identity (triedThemes is synced server-side
                // — see fetchProgressFromServer/syncProgressToServer).
                // Without piAccessToken (outside Pi Browser, or Pi login
                // declined) there's no way to remember "already tried"
                // across a cleared localStorage/cookies, so the trial would
                // be repeatable indefinitely. Go straight to the paywall
                // instead of offering a trial we can't actually enforce.
                if (!piAccessToken || !isPiBrowserEnvironment() || hasTriedTheme(clickedTheme)) {
                    showUnlockModal('theme', clickedTheme);
                    return;
                }
                // First time on this locked theme: spend its one-time free
                // trial and let it through below instead of paywalling it.
                markTried('theme', clickedTheme);
                activeTrialTheme = clickedTheme;
                showTrialToast(UNLOCK_DISPLAY_NAMES[clickedTheme] || clickedTheme);
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
                switchPage(3);
            }, 500);
        });
    });
   
    // Setup piece set selection
    const pieceSetOptions = document.querySelectorAll('.pieceset-page .option-card');
    pieceSetOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedPieceSet = this.getAttribute('data-piece-set');

            if (this.classList.contains('locked')) {
                // See the matching comment in the theme-selection handler
                // above — the free trial requires a verified Pi identity to
                // be enforceable at all.
                if (!piAccessToken || !isPiBrowserEnvironment() || hasTriedPieceSet(clickedPieceSet)) {
                    showUnlockModal('pieceset', clickedPieceSet);
                    return;
                }
                // First time on this locked piece set: spend its one-time
                // free trial and let it through below instead of paywalling it.
                markTried('pieceset', clickedPieceSet);
                activeTrialPieceSet = clickedPieceSet;
                showTrialToast(UNLOCK_DISPLAY_NAMES[clickedPieceSet] || clickedPieceSet);
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
                switchPage(4);
            }, 500);
        });
    });

    // Setup bot personality selection (new page, inserted between piece
    // set selection and difficulty selection — see index.html's bot-page).
    const botPersonalityOptions = document.querySelectorAll('.bot-page .option-card');
    botPersonalityOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedBot = this.getAttribute('data-bot-personality');

            if (this.classList.contains('locked')) {
                // Same one-time free trial pattern as themes/piece sets/
                // levels above — requires a verified Pi identity to be
                // enforceable at all.
                if (!piAccessToken || !isPiBrowserEnvironment() || hasTriedBotPersonality(clickedBot)) {
                    showUnlockModal('bot', clickedBot);
                    return;
                }
                // First time on this locked bot personality: spend its
                // one-time free trial and let it through below instead of
                // paywalling it.
                markTried('bot', clickedBot);
                activeTrialBotPersonality = clickedBot;
                showTrialToast(UNLOCK_DISPLAY_NAMES[clickedBot] || clickedBot);
            }

            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            botPersonalityOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            userSettings.botPersonality = clickedBot;
            updateCurrentSettings();
            setTimeout(() => {
                switchPage(5);
            }, 500);
        });
    });

    // Setup difficulty selection
    const difficultyOptions = document.querySelectorAll('.difficulty-page .option-card');
    difficultyOptions.forEach(option => {
        option.addEventListener('click', function() {
            const clickedDifficulty = this.getAttribute('data-difficulty');

            if (this.classList.contains('locked')) {
                // See the matching comment in the theme-selection handler
                // above — the free trial requires a verified Pi identity to
                // be enforceable at all.
                if (!piAccessToken || !isPiBrowserEnvironment() || hasTriedLevel(clickedDifficulty)) {
                    showUnlockModal('level', clickedDifficulty);
                    return;
                }
                // First time on this locked difficulty: spend its one-time
                // free trial and let it through below instead of paywalling it.
                markTried('level', clickedDifficulty);
                activeTrialLevel = clickedDifficulty;
                showTrialToast(UNLOCK_DISPLAY_NAMES[clickedDifficulty] || clickedDifficulty);
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
                switchPage(6);
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
                baseHints = 1;
                baseUndos = 1;
                baseThreats = 1;
                baseExtraTime = 1;
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
    let promoMessageClearTimer = null;
    function showPromoMessage(messages) {
        // If the "Added X minute!" (or any other) custom alert is on
        // screen right now, don't show the toast underneath/behind it —
        // stash it and let dismissCustomAlertModal() (above) show it the
        // moment the player closes that alert instead.
        const alertModal = document.getElementById('custom-alert-modal');
        if (alertModal && alertModal.style.display === 'block') {
            pendingPromoMessages = messages;
            return;
        }
        const promoEl = document.getElementById('promo-message');
        if (!promoEl) return;

        const text = messages[Math.floor(Math.random() * messages.length)];
        promoEl.textContent = text;

        // Restart the visible state/timer even if one is already showing.
        // Also cancel any pending "clear the text" from a previous message
        // fading out — otherwise it could wipe out THIS new text a moment
        // after we just set it.
        if (promoMessageTimer) clearTimeout(promoMessageTimer);
        if (promoMessageClearTimer) clearTimeout(promoMessageClearTimer);
        promoEl.classList.add('visible');
        promoMessageTimer = setTimeout(() => {
            promoEl.classList.remove('visible');
            promoMessageTimer = null;
            // Only actually empty the element once its fade-out transition
            // has finished (matches the 0.4s in .promo-message's CSS
            // transition, plus a small buffer). Emptying it collapses its
            // width to zero, freeing up the space next to the bot name
            // instead of permanently reserving it — without this, the
            // element kept its previous text (and therefore its width)
            // forever after the first time a promo message ever appeared,
            // which is what was squeezing "Aggressive Attacker" (and any
            // other bot personality name) onto two lines for the rest of
            // the game even once the message itself was gone.
            promoMessageClearTimer = setTimeout(() => {
                promoEl.textContent = '';
                promoMessageClearTimer = null;
            }, 450);
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
   
    // Pi SDK availability check only — Pi.init() itself already runs once,
    // synchronously, in index.html right after the SDK script tag (before
    // this file even loads). Calling Pi.init() a second time here was
    // redundant and risked re-initializing the SDK's internal session state
    // right before the authenticate() call below runs, so it's been removed.
    if (typeof Pi === 'undefined') {
        console.error('Pi SDK script not loaded — payment features will be unavailable.');
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
                showCustomAlert('There\'s a stuck payment from earlier that we couldn\'t resolve automatically. Try closing and reopening the app, or try again later.');
            }
        }
    }

    async function authenticate() {
        // Same fix as initializePiIdentityAndProgress(): must wait for
        // Pi.init() to resolve before calling Pi.authenticate(), or it can
        // throw "Pi Network SDK was not initialized" intermittently.
        if (window.piInitPromise) await window.piInitPromise;
        const scopes = ['username', 'payments'];
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
            document.getElementById('unlock-all-btn'),
            document.getElementById('premium-monthly-btn'),
            document.getElementById('premium-yearly-btn')
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
        wood: 'Wood', glass: 'Glass', marble: 'Marble',
        defensive: 'Solid Defender', endgame: 'Endgame Technician', trickster: 'Gambit Trickster'
    };
    let pendingUnlock = null; // { type: 'level' | 'theme' | 'pieceset' | 'bot', name: string }

    // Formats a Pi amount for display: up to 4 decimal places, trimmed of
    // trailing zeros (e.g. 1.75, 0.4286, 3).
    function formatPiAmount(amount) {
        return (Math.round(amount * 10000) / 10000).toString();
    }

    async function showUnlockModal(type, name) {
        pendingUnlock = { type, name };
        const modal = document.getElementById('unlock-modal');
        const badge = document.getElementById('unlock-type-badge');
        const title = document.getElementById('unlock-modal-title');
        const desc = document.getElementById('unlock-modal-desc');
        const priceText = document.getElementById('unlock-price-text');
        const unlockAllBtn = document.getElementById('unlock-all-btn');
        const unlockAllText = document.getElementById('unlock-all-text');
        const triedNoteEl = document.getElementById('unlock-tried-note');
        const triedNoteTextEl = document.getElementById('unlock-tried-note-text');
        if (!modal || !title || !desc || !priceText) return;

        // Make sure we have a reasonably fresh PI/USD rate before showing
        // any price (uses the cached value if it's still fresh, so this is
        // usually instant).
        await fetchPiUsdPrice();

        // Hide the "already tried" note by default; only the single-item
        // branches below turn it back on, and only when it applies.
        if (triedNoteEl) triedNoteEl.classList.add('hidden');
        if (badge) badge.textContent = 'Bundle';

        let price = getUnlockPricePi();
        if (type === 'all-levels') {
            const remaining = getRemainingLockedLevels();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Levels';
            desc.textContent = 'Get Medium, Hard, and Expert difficulty in one purchase.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else if (type === 'all-themes') {
            const remaining = getRemainingLockedThemes();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Themes';
            desc.textContent = 'Get the Green, Pink, and Blue board themes in one purchase.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else if (type === 'all-piecesets') {
            const remaining = getRemainingLockedPieceSets();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Piece Sets';
            desc.textContent = 'Get the Wood, Glass, and Marble piece sets in one purchase.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else if (type === 'all-bots') {
            const remaining = getRemainingLockedBotPersonalities();
            price = getBundlePricePi(remaining.length);
            title.textContent = 'Unlock All Bot Personalities';
            desc.textContent = 'Get the Solid Defender, Endgame Technician, and Gambit Trickster bots in one purchase.';
            if (unlockAllBtn) unlockAllBtn.classList.add('hidden');
        } else {
            const displayName = UNLOCK_DISPLAY_NAMES[name] || name;
            const triedNote = (typeof i18next !== 'undefined' && i18next.t) ? i18next.t('alreadyTriedNote') : 'You already used your free trial for this. Unlock it with Pi to keep using it.';
            if (type === 'level') {
                if (badge) badge.textContent = 'Difficulty Level';
                title.textContent = displayName;
                desc.textContent = `Beat the previous level to unlock it free, or unlock it now with Pi.`;
                if (hasTriedLevel(name) && triedNoteEl && triedNoteTextEl) {
                    triedNoteTextEl.textContent = triedNote;
                    triedNoteEl.classList.remove('hidden');
                }
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
                if (badge) badge.textContent = 'Board Theme';
                title.textContent = displayName;
                desc.textContent = `Unlock this board theme instantly with Pi.`;
                if (hasTriedTheme(name) && triedNoteEl && triedNoteTextEl) {
                    triedNoteTextEl.textContent = triedNote;
                    triedNoteEl.classList.remove('hidden');
                }
                const remaining = getRemainingLockedThemes();
                if (unlockAllBtn) {
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-themes';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Themes — ${formatPiAmount(bundlePrice)} π`;
                }
            } else if (type === 'pieceset') {
                if (badge) badge.textContent = 'Piece Set';
                title.textContent = displayName;
                desc.textContent = `Unlock this piece set instantly with Pi. Works with any board theme.`;
                if (hasTriedPieceSet(name) && triedNoteEl && triedNoteTextEl) {
                    triedNoteTextEl.textContent = triedNote;
                    triedNoteEl.classList.remove('hidden');
                }
                const remaining = getRemainingLockedPieceSets();
                if (unlockAllBtn) {
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-piecesets';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Piece Sets — ${formatPiAmount(bundlePrice)} π`;
                }
            } else {
                // type === 'bot'
                if (badge) badge.textContent = 'Bot Personality';
                title.textContent = displayName;
                const botMeta = BOT_PERSONALITIES[name];
                desc.textContent = botMeta
                    ? `${botMeta.desc} Unlock this bot instantly with Pi.`
                    : `Unlock this bot personality instantly with Pi.`;
                if (hasTriedBotPersonality(name) && triedNoteEl && triedNoteTextEl) {
                    triedNoteTextEl.textContent = triedNote;
                    triedNoteEl.classList.remove('hidden');
                }
                const remaining = getRemainingLockedBotPersonalities();
                if (unlockAllBtn) {
                    unlockAllBtn.classList.toggle('hidden', remaining.length <= 1);
                    unlockAllBtn.dataset.bundleType = 'all-bots';
                }
                if (unlockAllText) {
                    const bundlePrice = getBundlePricePi(remaining.length);
                    unlockAllText.textContent = `Unlock Remaining ${remaining.length} Bot Personalities — ${formatPiAmount(bundlePrice)} π`;
                }
            }
        }
        priceText.textContent = `${formatPiAmount(price)} \u03C0`;

        modal.style.display = 'block';
    }

    async function processUnlockPayment() {
        if (!pendingUnlock || isProcessingPayment) return;
        isProcessingPayment = true;
        setPaymentButtonsBusy(true);
        const { type, name } = pendingUnlock;
        const isBundle = type === 'all-levels' || type === 'all-themes' || type === 'all-piecesets' || type === 'all-bots';

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
        let botPersonalitiesToGrant = [];
        if (type === 'all-levels') {
            levelsToGrant = getRemainingLockedLevels();
            price = getBundlePricePi(levelsToGrant.length);
        } else if (type === 'all-themes') {
            themesToGrant = getRemainingLockedThemes();
            price = getBundlePricePi(themesToGrant.length);
        } else if (type === 'all-piecesets') {
            pieceSetsToGrant = getRemainingLockedPieceSets();
            price = getBundlePricePi(pieceSetsToGrant.length);
        } else if (type === 'all-bots') {
            botPersonalitiesToGrant = getRemainingLockedBotPersonalities();
            price = getBundlePricePi(botPersonalitiesToGrant.length);
        } else if (type === 'level') {
            levelsToGrant = [name];
        } else if (type === 'theme') {
            themesToGrant = [name];
        } else if (type === 'pieceset') {
            pieceSetsToGrant = [name];
        } else if (type === 'bot') {
            botPersonalitiesToGrant = [name];
        }

        // Nothing left to actually unlock (e.g. the player unlocked the
        // rest in another tab/device since this modal was opened) — bail
        // out instead of charging for an empty bundle.
        if (isBundle && levelsToGrant.length === 0 && themesToGrant.length === 0 && pieceSetsToGrant.length === 0 && botPersonalitiesToGrant.length === 0) {
            isProcessingPayment = false;
            setPaymentButtonsBusy(false);
            const modal = document.getElementById('unlock-modal');
            if (modal) modal.style.display = 'none';
            resumeTimer(); // no-op unless this modal was opened mid-game (e.g. from the live board-settings switcher)
            showCustomAlert('Everything in that category is already unlocked!');
            return;
        }

        const displayName = isBundle
            ? (type === 'all-levels' ? `${levelsToGrant.length} Remaining Level(s)`
                : type === 'all-themes' ? `${themesToGrant.length} Remaining Theme(s)`
                : type === 'all-piecesets' ? `${pieceSetsToGrant.length} Remaining Piece Set(s)`
                : `${botPersonalitiesToGrant.length} Remaining Bot Personality(ies)`)
            : (UNLOCK_DISPLAY_NAMES[name] || name);

        try {
            await authenticate();

            const itemCount = isBundle ? (levelsToGrant.length || themesToGrant.length || pieceSetsToGrant.length || botPersonalitiesToGrant.length) : 1;
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
                        if (botPersonalitiesToGrant.length) grantProgress({ botPersonalities: botPersonalitiesToGrant });
                        recordPurchase({ levels: levelsToGrant, themes: themesToGrant, pieceSets: pieceSetsToGrant, botPersonalities: botPersonalitiesToGrant });

                        const modal = document.getElementById('unlock-modal');
                        if (modal) modal.style.display = 'none';
                        resumeTimer(); // no-op unless this modal was opened mid-game (e.g. from the live board-settings switcher)
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
            resumeTimer(); // no-op unless this modal was opened mid-game (e.g. from the live board-settings switcher)
            pendingUnlock = null;
        });
    }

    // ===================================================================
    // PI PREMIUM MODAL (subscribing to unlock everything at once, monthly
    // or yearly). Separate feature from the Refill top-up above — Refill
    // stays a flat, non-discounted per-use price; Premium is a recurring
    // access pass priced and displayed independently.
    // ===================================================================
    let pendingPremiumPlan = null; // 'monthly' | 'yearly'

    // Populates the modal with live Pi prices and the yearly plan's
    // savings, then shows it. Safe to call anytime; always recomputes.
    async function showPremiumModal() {
        const modal = document.getElementById('premium-modal');
        const monthlyPriceEl = document.getElementById('premium-monthly-price');
        const yearlyPriceEl = document.getElementById('premium-yearly-price');
        const savingsEl = document.getElementById('premium-savings-text');
        if (!modal || !monthlyPriceEl || !yearlyPriceEl) return;

        // Fresh-ish rate (uses the cache if still recent, so this is
        // usually instant) so the displayed Pi amounts are trustworthy.
        await fetchPiUsdPrice();

        monthlyPriceEl.textContent = `${formatPiAmount(getPremiumMonthlyPricePi())} π`;
        yearlyPriceEl.textContent = `${formatPiAmount(getPremiumYearlyPricePi())} π`;
        if (savingsEl) {
            const amount = PREMIUM_YEARLY_SAVINGS_USD.toFixed(2);
            savingsEl.textContent = (typeof i18next !== 'undefined' && i18next.t)
                ? i18next.t('premiumSavings', { amount, percent: PREMIUM_YEARLY_SAVINGS_PERCENT })
                : `Save $${amount}/year (${PREMIUM_YEARLY_SAVINGS_PERCENT}% off the monthly price)`;
        }
        renderPremiumState();
        modal.style.display = 'block';
    }

    async function processPremiumPayment() {
        if (!pendingPremiumPlan || isProcessingPayment) return;
        isProcessingPayment = true;
        setPaymentButtonsBusy(true);
        const plan = pendingPremiumPlan;

        // Refresh the Pi/USD rate right before charging so the amount
        // reflects the current market price, not whatever was cached when
        // the modal first opened.
        await fetchPiUsdPrice(true);

        const price = plan === 'yearly' ? getPremiumYearlyPricePi() : getPremiumMonthlyPricePi();
        const usdCharged = plan === 'yearly' ? PREMIUM_YEARLY_USD : PREMIUM_MONTHLY_USD;
        const planLabel = plan === 'yearly' ? 'Yearly' : 'Monthly';

        try {
            await authenticate();

            const paymentData = {
                amount: price,
                memo: `Chess Pi Premium — ${planLabel} subscription`,
                metadata: { productId: `premium_${plan}`, usdPrice: usdCharged }
            };

            const callbacks = {
                onReadyForServerApproval: async function(paymentId) {
                    console.log('Premium onReadyForServerApproval:', paymentId);
                    try {
                        const response = await fetch('/.netlify/functions/approve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId }),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!response.ok) throw new Error('Approval failed');
                    } catch (error) {
                        console.error('Premium approval error:', error);
                        showCustomAlert('Approval failed: ' + error.message);
                    }
                },
                onReadyForServerCompletion: async function(paymentId, txid) {
                    console.log('Premium onReadyForServerCompletion:', paymentId, txid);
                    try {
                        const response = await fetch('/.netlify/functions/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentId, txid }),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!response.ok) throw new Error('Completion failed');

                        grantPremium(plan);

                        const modal = document.getElementById('premium-modal');
                        if (modal) modal.style.display = 'none';
                        showCustomAlert(`Chess Pi Premium (${planLabel}) is active! Every level, theme, piece set, and bot personality is unlocked while it lasts.`);
                    } catch (error) {
                        console.error('Premium completion error:', error);
                        showCustomAlert('Completion failed: ' + error.message);
                    } finally {
                        isProcessingPayment = false;
                        setPaymentButtonsBusy(false);
                    }
                },
                onCancel: function(paymentId) {
                    console.log('Premium payment canceled:', paymentId);
                    showCustomAlert('Payment canceled.');
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                },
                onError: function(error, payment) {
                    console.error('Premium payment error:', error, payment);
                    showCustomAlert('Payment error: ' + error.message);
                    isProcessingPayment = false;
                    setPaymentButtonsBusy(false);
                }
            };

            Pi.createPayment(paymentData, callbacks);
        } catch (error) {
            console.error('Premium authentication error:', error);
            showCustomAlert('Authentication failed: ' + error.message);
            isProcessingPayment = false;
            setPaymentButtonsBusy(false);
        }
    }

    const premiumBtnEl = document.getElementById('premium-btn');
    if (premiumBtnEl) {
        premiumBtnEl.addEventListener('click', function() {
            if (isAIThinking || isProcessingPayment) return;
            pauseTimer();
            showPremiumModal();
        });
    }

    const premiumMonthlyBtnEl = document.getElementById('premium-monthly-btn');
    if (premiumMonthlyBtnEl) {
        premiumMonthlyBtnEl.addEventListener('click', function() {
            if (isProcessingPayment) return;
            pendingPremiumPlan = 'monthly';
            processPremiumPayment();
        });
    }

    const premiumYearlyBtnEl = document.getElementById('premium-yearly-btn');
    if (premiumYearlyBtnEl) {
        premiumYearlyBtnEl.addEventListener('click', function() {
            if (isProcessingPayment) return;
            pendingPremiumPlan = 'yearly';
            processPremiumPayment();
        });
    }

    const premiumCancelBtnEl = document.getElementById('premium-cancel-btn');
    if (premiumCancelBtnEl) {
        premiumCancelBtnEl.addEventListener('click', function() {
            const modal = document.getElementById('premium-modal');
            if (modal) modal.style.display = 'none';
            pendingPremiumPlan = null;
            resumeTimer();
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
                if (playerTime > 10) sounds.tenseconds.stop();

                // Update statistics
                gameStats.extraTimeUsed++;

                // Show the "Added 1 minute!" alert BEFORE recomputing the
                // feature-button state below — that recompute is what can
                // trigger the "all features depleted, refill now" toast
                // (checkRefillButtonState -> showPromoMessage), and having
                // the alert already open by then is what makes it get
                // deferred instead of popping up underneath this alert.
                showCustomAlert(`Added ${extraMinutes} minute of extra time!`);
                updateFeatureButtonsState();
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
                    endGame(`Time's up! Black wins by timeout!`, false, 'loss');
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
    // `result` is the display text only (stored for the "Current Game" tab)
    // — `outcome` ('win'|'loss'|'draw'), passed explicitly by endGame(), is
    // what actually drives win/loss/draw counting. See the BUG FIX note on
    // endGame() for why this used to (unreliably) parse `result` instead.
    function updateComprehensiveStats(result, outcome, timeUsed, moves, difficulty) {
        // Update overall statistics
        comprehensiveStats.overall.gamesPlayed++;
        
        const isWin = outcome === 'win';
        if (isWin) {
            comprehensiveStats.overall.wins++;
            comprehensiveStats.overall.currentStreak = comprehensiveStats.overall.currentStreak > 0 ? comprehensiveStats.overall.currentStreak + 1 : 1;
            comprehensiveStats.overall.bestStreak = Math.max(comprehensiveStats.overall.bestStreak, comprehensiveStats.overall.currentStreak);
        } else if (outcome === 'loss') {
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
            } else if (outcome === 'loss') {
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
    //
    // BUG FIX: win/loss/draw used to be re-derived by matching English
    // substrings ('wins', 'White', 'Black', 'surrender', 'timeout') inside
    // `message` — both here and in updateComprehensiveStats() — even though
    // every call site already knows the real outcome via `isWin`/game state.
    // Since every other user-facing string in this app goes through
    // i18next, localizing these particular status strings (a very plausible
    // future edit) would make every one of those .includes() checks stop
    // matching, silently turning every win/loss into a recorded 'draw' —
    // both in local stats and on the Pi leaderboard — with no error
    // anywhere. `outcome` is now passed explicitly by every call site
    // instead, so the win/loss/draw record no longer depends on the exact
    // (possibly-translated) wording of the display message.
    function endGame(message, isWin = false, outcome = null) {
        if (!outcome) outcome = isWin ? 'win' : 'loss'; // back-compat fallback for any caller that doesn't pass it

        // Stop the Premium attention-flash cycle the moment the match ends,
        // for the same reason as the low-time ticking sound below — no
        // matter why it ended.
        stopPremiumAttentionFlashCycle();

        // FREE TRIAL: this one game was the trial's single "use" — spend it
        // and let renderLockState() re-lock the item (and reset userSettings
        // back to the free default) so the next game starts from scratch
        // unless the player pays to keep it.
        if (activeTrialTheme || activeTrialPieceSet || activeTrialLevel || activeTrialBotPersonality) {
            activeTrialTheme = null;
            activeTrialPieceSet = null;
            activeTrialLevel = null;
            activeTrialBotPersonality = null;
            renderLockState();
        }

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
        
        // `outcome` is authoritative (passed by the caller, never parsed
        // from `message` — see the BUG FIX note on endGame() above).
        let actualIsWin = outcome === 'win';
        
        // Update comprehensive statistics - FIXED: Pass timeUsed instead of duration
        updateComprehensiveStats(message, outcome, timeUsed, gameStats.totalMoves, userSettings.difficulty);
        // What's SENT to the server for the leaderboard — driven by the
        // same authoritative `outcome`, not text-matched from `message`.
        // The server independently trusts only the signed game token for
        // difficulty/timing — see submit-score.js.
        submitScoreToLeaderboard(outcome);
        
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
        // Sound is picked from the same authoritative `outcome` used for
        // stats/leaderboard above — never from `message` text — for the
        // same reason spelled out in the BUG FIX note at the top of this
        // function: matching substrings in a user-facing string silently
        // breaks the moment that string is reworded or translated.
        if (!isMuted) {
            if (outcome === 'win') {
                sounds['game-win'].play();
            } else if (outcome === 'loss') {
                sounds['game-lose'].play();
            } else if (outcome === 'draw') {
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

        // Get a fresh, signed game token for THIS game before anything else
        // — the leaderboard submission at the end will be rejected without
        // one that matches this difficulty/start time.
        requestGameToken(userSettings.difficulty);

        // Show the selected bot personality's name in the in-game HUD
        // instead of a generic "Bot AI" label, so the player always knows
        // who they're up against.
        const botTextEl = document.getElementById('bot-text');
        if (botTextEl) {
            const personalityMeta = BOT_PERSONALITIES[userSettings.botPersonality];
            botTextEl.textContent = personalityMeta ? personalityMeta.name : i18next.t('blacksTurn');
        }
       
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

        startPremiumAttentionFlashCycle();
    }

    // Repeatedly flashes the Premium crown icon gold for ~10s, pauses for
    // ~10s, and repeats for as long as the current match is in progress —
    // so a non-subscriber keeps noticing it's there to try without it
    // running permanently once they've clicked away. Started in
    // initNewGame() and stopped in endGame() (see stopPremiumAttentionFlashCycle
    // below). Skipped/stopped entirely for players who already have an
    // active subscription.
    let premiumFlashTimer = null;
    let premiumFlashActive = false;

    function startPremiumAttentionFlashCycle() {
        stopPremiumAttentionFlashCycle(); // never let two cycles overlap
        const btn = document.getElementById('premium-btn');
        if (!btn || btn.classList.contains('premium-active')) return;

        premiumFlashActive = true;

        function tick(turnOn) {
            if (!premiumFlashActive) return;
            // Re-check each tick — e.g. Premium may have activated, or the
            // button may have been removed, since the cycle started.
            if (!btn.isConnected || btn.classList.contains('premium-active')) {
                stopPremiumAttentionFlashCycle();
                return;
            }
            btn.classList.toggle('premium-attention-flash', turnOn);
            premiumFlashTimer = setTimeout(() => tick(!turnOn), 10000);
        }

        // Small initial delay so the first flash starts after the
        // board/timer animation settles, rather than competing with it the
        // instant the game appears.
        premiumFlashTimer = setTimeout(() => tick(true), 1200);
    }

    // Stops the flash cycle immediately (match ended, a new game is about
    // to start, or Premium just activated) and makes sure the icon isn't
    // left mid-flash.
    function stopPremiumAttentionFlashCycle() {
        premiumFlashActive = false;
        if (premiumFlashTimer) {
            clearTimeout(premiumFlashTimer);
            premiumFlashTimer = null;
        }
        const btn = document.getElementById('premium-btn');
        if (btn) btn.classList.remove('premium-attention-flash');
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
            endGame(status, isWin, isWin ? 'win' : 'loss');
        } else if(game.in_draw()) {
            status = "Draw!";
            endGame(status, false, 'draw'); // Draw is not a win
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
       
        // Page order: 0=welcome, 1=mode-select, 2=theme, 3=pieceset,
        // 4=bot personality, 5=difficulty, 6=game, 7=puzzle-type,
        // 8=puzzle-difficulty, 9=puzzles, 10=puzzle-rush.
        if (pageIndex !== 6 && gameTimer) {
            // Stop the bot-game timer whenever we leave the game page —
            // including going straight to puzzles, so a live timed game
            // never keeps ticking down in the background while the player
            // is doing something else entirely.
            clearInterval(gameTimer);
        }
        if (pageIndex === 6) {
            initNewGame();
            updateCurrentSettings();
            updateFeatureButtonsState();
        } else if (pageIndex === 9) {
            startNextPuzzle();
        } else if (pageIndex === 10) {
            resetRushUI();
        } else if (pageIndex !== 9 && rushState.active) {
            // Leaving mid-rush any other way than finishing it normally —
            // stop its timer so it doesn't keep running invisibly.
            stopRushRun();
        }
    }
   
    // Function to update navigation arrows visibility
    function updateNavArrows(pageIndex) {
        if (!leftArrow || !rightArrow) return;
        // Arrows only make sense while swiping between the 4 linear setup
        // steps (theme/pieceset/bot/difficulty) — welcome, mode-select,
        // game, and puzzles are all destinations you arrive at directly,
        // not steps you swipe through.
        if (pageIndex === 0 || pageIndex === 1 || pageIndex >= 6) {
            leftArrow.classList.add('hidden');
            rightArrow.classList.add('hidden');
        } else {
            leftArrow.classList.remove('hidden');
            rightArrow.classList.remove('hidden');
            leftArrow.classList.toggle('hidden', pageIndex === 2);
            rightArrow.classList.toggle('hidden', pageIndex === 5);
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
               
                // Validate — English only.
                userSettings.language = 'en';
                // Migrate old theme names (from before this update) to their
                // closest new equivalent, so returning players don't get
                // silently reset to the default.
                const themeMigration = { classic: 'brown', space: 'blue', marble: 'green', metal: 'pink' };
                const migratedTheme = themeMigration[parsed.theme] || parsed.theme;
                userSettings.theme = ['brown', 'green', 'pink', 'blue'].includes(migratedTheme) ? migratedTheme : 'brown';
                userSettings.pieceSet = ['neo', 'wood', 'glass', 'marble'].includes(parsed.pieceSet) ? parsed.pieceSet : 'neo';
                userSettings.botPersonality = BOT_PERSONALITY_ORDER.includes(parsed.botPersonality) ? parsed.botPersonality : 'aggressive';
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
                        card.getAttribute('data-bot-personality') === userSettings.botPersonality ||
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

    // Preloads every piece image (6 types x 2 colors) for a given piece set
    // before it's ever put on the board. updateBoard() rebuilds every
    // square with a fresh <img src="..."> — without this, each of those 32
    // images finishes downloading at a slightly different moment, so the
    // player visibly watches the set change piece-by-piece instead of all
    // at once. Resolves once every image has either loaded or exhausted
    // its fallback chain (never rejects, so a slow/broken image can't hang
    // the Apply flow — updateBoard()'s own onerror chain still runs as a
    // final safety net either way).
    function preloadPieceSetImages(pieceSet) {
        // Hard safety net: this must never be able to warm the cache for a
        // set the player hasn't unlocked, even if some future change ever
        // calls it from somewhere other than the Apply handler above
        // (which already checks this before calling in). Note this is
        // belt-and-suspenders only — preloading never unlocks anything by
        // itself: it just pre-fetches PUBLIC, unauthenticated CDN images
        // into the browser's normal HTTP cache (same images anyone could
        // already load directly by URL), it never writes to userSettings,
        // playerProgress, or the board, and the board only ever renders
        // whatever userSettings.pieceSet already says — which the Apply
        // handler only ever sets to something isPieceSetUnlocked() approved.
        if (!isPieceSetUnlocked(pieceSet)) return Promise.resolve();
        const types = ['p', 'n', 'b', 'r', 'q', 'k'];
        const colors = ['w', 'b'];
        const promises = [];
        types.forEach((type) => {
            colors.forEach((color) => {
                const sources = getPieceImageSources(type, color, pieceSet);
                promises.push(new Promise((resolve) => {
                    let sourceIndex = 0;
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => {
                        sourceIndex++;
                        if (sourceIndex < sources.length) {
                            img.src = sources[sourceIndex];
                        } else {
                            resolve(); // give up quietly — same fallback chain updateBoard() already has
                        }
                    };
                    img.src = sources[sourceIndex];
                }));
            });
        });
        return Promise.all(promises);
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
            // Castling detected two ways and OR'd together: chess.js's own
            // 'k'/'q' move flags, AND independently by "the king moved two
            // files" (from/to file distance === 2). The second check is a
            // safety net — it doesn't depend on flags being set correctly
            // by whichever code path produced this move object (engine
            // moves are applied via the same {from,to} object form as
            // on-screen player clicks, but this way the castle sound can
            // never silently fail to fire for one side and not the other).
            const isKingTwoFileMove = move.piece === 'k' &&
                Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0)) === 2;
            if (move.flags.includes('c') || move.flags.includes('e')) {
                moveSoundType = 'capture';
            } else if (move.flags.includes('p')) {
                moveSoundType = 'promote';
            } else if (move.flags.includes('k') || move.flags.includes('q') || isKingTwoFileMove) {
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
    // counts against your Netlify bandwidth quota. If that CDN is ever
    // unreachable, a second independent CDN mirror (jsdelivr) is tried
    // before anything is ever pulled from Netlify — this is what actually
    // matters for bandwidth: the local "stockfish.js" fallback file in
    // this project is ~10MB (much larger than the CDN's minified build),
    // so every time that path gets hit it costs roughly 5-10x more
    // bandwidth than a CDN miss would. Two independent CDNs failing at
    // once is rare, so this local file should now only ever be reached in
    // a genuine worst case. If you want to shrink that worst case further,
    // replace the local stockfish.js with the same minified build the CDN
    // serves (stockfish.min.js, ~1-2MB) instead of a full unminified copy.
    // ===================================================================
    const STOCKFISH_CDN_URLS = [
        'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.min.js',
        'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.min.js'
    ];
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
    // will cache each CDN response, so this is only a real network fetch
    // once per CDN per browser.
    //
    // Tries each CDN mirror in order before ever touching the local
    // fallback file — see the BANDWIDTH comment above for why that
    // ordering matters.
    async function createStockfishWorker() {
        for (const cdnUrl of STOCKFISH_CDN_URLS) {
            try {
                const response = await fetch(cdnUrl, { mode: 'cors' });
                if (!response.ok) throw new Error('CDN responded with status ' + response.status);
                const scriptText = await response.text();
                const blob = new Blob([scriptText], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                return new Worker(blobUrl);
            } catch (cdnErr) {
                console.error('Failed to load Stockfish from CDN mirror', cdnUrl, cdnErr);
            }
        }
        console.error('All Stockfish CDN mirrors failed, falling back to local file.');
        // Last resort: a locally-hosted copy, if one exists in the project.
        return new Worker(STOCKFISH_LOCAL_FALLBACK_PATH);
    }

    const StockfishEngine = (function() {
        let worker = null;
        let isReady = false;
        let readyPromise = null;
        let pendingResolve = null;
        let currentSkillLevel = null;
        let currentMultiPv = 1;
        let initFailed = false;

        // Only set while a getTopMoves() call is in flight — collects the
        // "info ... multipv N ... score cp/mate X ... pv <move> ..." lines
        // Stockfish streams out while it searches, keyed by MultiPV index.
        let multiPvCollector = null;
        let pendingTopMovesResolve = null;

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

        // Parses a single UCI "info ..." search-progress line. Returns null
        // for lines that aren't a scored/pv'd search update (e.g. plain
        // "info string ..." lines), otherwise { multipv, scoreType, scoreValue, move }.
        // Field order isn't assumed (Stockfish always emits multipv before
        // score before pv, but matching each piece independently is more
        // robust to engine-version differences).
        function parseInfoLine(line) {
            const multipvMatch = line.match(/\bmultipv (\d+)/);
            const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
            const pvMatch = line.match(/\bpv (.+)$/);
            if (!multipvMatch || !scoreMatch || !pvMatch) return null;
            const firstMove = pvMatch[1].trim().split(' ')[0];
            if (!firstMove) return null;
            return {
                multipv: parseInt(multipvMatch[1], 10),
                scoreType: scoreMatch[1], // 'cp' or 'mate'
                scoreValue: parseInt(scoreMatch[2], 10),
                move: firstMove
            };
        }

        function handleMessage(line, resolveInit) {
            if (typeof line !== 'string' || line.length === 0) return;

            if (line === 'readyok') {
                isReady = true;
                if (resolveInit) resolveInit(true);
            } else if (multiPvCollector && line.startsWith('info ')) {
                const parsed = parseInfoLine(line);
                if (parsed) {
                    multiPvCollector[parsed.multipv] = {
                        move: parsed.move,
                        cp: parsed.scoreType === 'cp' ? parsed.scoreValue : undefined,
                        mate: parsed.scoreType === 'mate' ? parsed.scoreValue : undefined
                    };
                }
            } else if (line.startsWith('bestmove')) {
                const parts = line.split(' ');
                const bestMoveUci = parts[1];
                const cleanBest = bestMoveUci && bestMoveUci !== '(none)' ? bestMoveUci : null;
                if (pendingTopMovesResolve) {
                    const resolveTop = pendingTopMovesResolve;
                    const collected = multiPvCollector || {};
                    pendingTopMovesResolve = null;
                    multiPvCollector = null;
                    const lines = Object.keys(collected)
                        .sort((a, b) => Number(a) - Number(b))
                        .map((k) => collected[k]);
                    resolveTop({ bestMove: cleanBest, lines: lines });
                } else if (pendingResolve) {
                    const resolve = pendingResolve;
                    pendingResolve = null;
                    resolve(cleanBest);
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

        function setMultiPv(count) {
            count = Math.max(1, Math.min(5, count));
            if (count === currentMultiPv) return;
            currentMultiPv = count;
            if (worker) {
                worker.postMessage(`setoption name MultiPV value ${count}`);
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
                // A plain single-best-move request should never be scored
                // against a stale MultiPV setting left over from a personality
                // bot's last move — always fall back to a single line here.
                setMultiPv(1);
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

        // Returns { bestMove, lines } where lines is an array (ordered by
        // MultiPV rank, best first) of { move, cp, mate } — used by the
        // aggressive/defensive/endgame bot personalities to pick among
        // several roughly-equal-strength candidate moves instead of always
        // taking the single top line. options: { movetime, multipv }
        function getTopMoves(fen, options) {
            return new Promise((resolve, reject) => {
                if (initFailed) {
                    reject(new Error('Stockfish is not available'));
                    return;
                }
                if (!worker) {
                    reject(new Error('Stockfish engine not initialized'));
                    return;
                }
                setMultiPv((options && options.multipv) || 3);
                multiPvCollector = {};
                pendingTopMovesResolve = resolve;
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
            getTopMoves,
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

    // ===== Bot personality move-selection layer =====
    // Sits directly on top of StockfishEngine: for the trickster personality
    // it consults a small opening book of known gambit lines before ever
    // asking Stockfish anything; for aggressive/defensive/endgame it asks
    // Stockfish for several roughly-equal-strength candidate moves
    // (MultiPV) and picks among them with a lightweight heuristic. This
    // means the bot's actual playing STRENGTH always stays tied to the
    // selected difficulty — personality only breaks ties among moves that
    // are already close to the engine's own best line, never trades away
    // real strength for "flavor".
    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    // A small opening book of Black gambit/counter-gambit replies (the bot
    // always plays Black in this app). Keys are the move history so far
    // (as "from-to" pairs joined with "|", the same format moveHistory
    // already uses elsewhere in this file) ending in a White move; values
    // are the Black reply. Deliberately shallow — enough to reliably steer
    // the trickster bot into a real gambit line in the opening. Once the
    // opponent leaves the book, or it runs out, play falls back to the
    // normal engine at the selected difficulty for the rest of the game.
    // This starter book covers the most common first two moves; it can be
    // extended with deeper lines later without touching any other logic.
    const TRICKSTER_OPENING_BOOK = {
        // 1.e4 -> 1...e5 (heads toward an open, tactical game)
        'e2-e4': 'e7-e5',
        // 1.e4 e5 2.Nf3 -> 2...f5!? (Latvian Gambit)
        'e2-e4|e7-e5|g1-f3': 'f7-f5',
        // 1.e4 e5 2.Bc4 -> 2...f5!? (same idea vs the Bishop's Opening)
        'e2-e4|e7-e5|f1-c4': 'f7-f5',
        // 1.e4 e5 2.f4 (King's Gambit) -> 2...exf4 (accepted)
        'e2-e4|e7-e5|f2-f4': 'e5-f4',
        // 1.e4 e5 2.Nc3 -> 2...Nf6 (keep it sharp)
        'e2-e4|e7-e5|b1-c3': 'g8-f6',
        // 1.d4 -> 1...e5!? (Englund Gambit)
        'd2-d4': 'e7-e5',
        // 1.d4 d5 2.c4 -> 2...e5!? (Albin Countergambit)
        'd2-d4|d7-d5|c2-c4': 'e7-e5',
        // 1.d4 Nf6 2.c4 -> 2...e5!? (Budapest Gambit)
        'd2-d4|g8-f6|c2-c4': 'e7-e5',
        // 1.d4 Nf6 2.c4 c5 3.d5 -> 3...b5!? (Benko Gambit)
        'd2-d4|g8-f6|c2-c4|c7-c5|d4-d5': 'b7-b5',
        // 1.c4 -> 1...e5 (steer toward a reversed Sicilian / open game)
        'c2-c4': 'e7-e5',
        // 1.Nf3 -> 1...e5 (invites transposition into e4-style gambits)
        'g1-f3': 'e7-e5',
        // 1.f4 -> 1...e5!? (From's Gambit)
        'f2-f4': 'e7-e5'
    };

    function getTricksterBookMove(historyBeforeThisMove) {
        // Only ever consult the book for the first ~10 plies (5 full moves)
        // — after that we're well past "opening" and should just play the
        // best move Stockfish can find like every other personality.
        if (historyBeforeThisMove.length > 10) return null;
        const key = historyBeforeThisMove.join('|');
        return TRICKSTER_OPENING_BOOK[key] || null;
    }

    function findKingSquare(chessInstance, color) {
        const board = chessInstance.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === color) {
                    return 'abcdefgh'[c] + (8 - r);
                }
            }
        }
        return null;
    }

    function squareDistance(a, b) {
        const fileA = a.charCodeAt(0) - 97, rankA = parseInt(a[1], 10);
        const fileB = b.charCodeAt(0) - 97, rankB = parseInt(b[1], 10);
        return Math.max(Math.abs(fileA - fileB), Math.abs(rankA - rankB));
    }

    // Heuristic only: a pawn move by the mover's own color, starting from
    // its home rank on the b/c or f/g files (the files that typically
    // shield a castled king) counts as "weakening its own king shelter".
    function isOwnKingShieldPawnMove(appliedMove) {
        if (appliedMove.piece !== 'p') return false;
        const homeRank = appliedMove.color === 'w' ? '2' : '7';
        const fromFile = appliedMove.from[0];
        const fromRank = appliedMove.from[1];
        return fromRank === homeRank && ['b', 'c', 'f', 'g'].includes(fromFile);
    }

    function countNonPawnPieces(chessInstance) {
        const board = chessInstance.board();
        let count = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type !== 'p' && piece.type !== 'k') count++;
            }
        }
        return count;
    }

    function getMaterialBalance(chessInstance, forColor) {
        const board = chessInstance.board();
        let balance = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (!piece) continue;
                const value = PIECE_VALUES[piece.type] || 0;
                balance += piece.color === forColor ? value : -value;
            }
        }
        return balance;
    }

    // Evaluates one MultiPV candidate move for how well it fits a
    // personality's style, using signals computed directly from chess.js
    // after applying the move to a scratch board — not a second engine
    // search, just cheap, self-contained heuristics.
    function scorePersonalityMove(fen, candidate, personality) {
        try {
            const scratch = new Chess(fen);
            const applied = scratch.move(uciToMoveObject(candidate.move));
            if (!applied) return -Infinity; // illegal/unparseable candidate — never pick it
            let score = 0;
            const isCapture = !!applied.captured;
            const capturedValue = isCapture ? (PIECE_VALUES[applied.captured] || 0) : 0;
            const givesCheck = scratch.in_check();

            if (personality === 'aggressive') {
                if (isCapture) score += capturedValue * 3;
                if (givesCheck) score += 25;
                // Reward moves that land a piece close to the opponent's
                // king — a cheap proxy for "building an attack".
                const enemyKingSquare = findKingSquare(scratch, applied.color === 'w' ? 'b' : 'w');
                if (enemyKingSquare) score += (7 - squareDistance(applied.to, enemyKingSquare)) * 3;
                if (['q', 'r', 'b'].includes(applied.piece)) score += 4;
            } else if (personality === 'defensive') {
                if (isCapture && capturedValue >= 3) score += capturedValue * 2;
                else if (!isCapture) score += 6;
                if (isOwnKingShieldPawnMove(applied)) score -= 15;
                if (givesCheck) score -= 3; // checks that aren't clearly winning tend to just burn tempo
            } else if (personality === 'endgame') {
                const pieceCount = countNonPawnPieces(scratch);
                const materialEdge = getMaterialBalance(scratch, applied.color);
                if (pieceCount <= 6 && materialEdge >= 0) {
                    if (isCapture) score += 20 + capturedValue; // ahead with few pieces left: simplify
                } else if (isCapture) {
                    score += capturedValue * 2;
                }
            }
            return score;
        } catch (e) {
            return -Infinity;
        }
    }

    // Chooses the bot's move for this turn according to
    // userSettings.botPersonality. Always returns a UCI move string (or
    // null), the same contract as StockfishEngine.getBestMove, so
    // makeAIMove doesn't need to know which personality is active.
    async function getPersonalityUciMove(fen, settings, personality) {
        if (personality === 'trickster') {
            const bookMove = getTricksterBookMove(moveHistory);
            if (bookMove) {
                // Confirm the book move is actually legal in this exact
                // position (the opponent may have transposed unexpectedly)
                // before committing to it — never force an illegal move.
                try {
                    const scratch = new Chess(fen);
                    if (scratch.move(uciToMoveObject(bookMove))) return bookMove;
                } catch (e) { /* fall through to the engine below */ }
            }
            return await StockfishEngine.getBestMove(fen, { movetime: settings.movetime });
        }

        if (personality === 'aggressive' || personality === 'defensive' || personality === 'endgame') {
            const result = await StockfishEngine.getTopMoves(fen, { movetime: settings.movetime, multipv: 3 });
            if (!result || !result.lines || result.lines.length === 0) {
                return result ? result.bestMove : null;
            }
            const best = result.lines[0];
            const bestScoreCp = best.cp !== undefined ? best.cp : (best.mate !== undefined ? (best.mate > 0 ? 100000 : -100000) : 0);
            // Only ever consider candidates within this many centipawns of
            // the engine's actual best line, so personality never
            // meaningfully weakens the bot below its selected difficulty —
            // it only breaks ties among moves that are already roughly as
            // good as each other.
            const CP_TOLERANCE = 80;
            const candidates = result.lines.filter((l) => {
                const cp = l.cp !== undefined ? l.cp : (l.mate !== undefined ? (l.mate > 0 ? 100000 : -100000) : -100000);
                return (bestScoreCp - cp) <= CP_TOLERANCE;
            });
            const pool = candidates.length ? candidates : [best];
            let chosen = pool[0];
            let bestPersonalityScore = -Infinity;
            pool.forEach((candidate) => {
                const s = scorePersonalityMove(fen, candidate, personality);
                if (s > bestPersonalityScore) {
                    bestPersonalityScore = s;
                    chosen = candidate;
                }
            });
            return chosen.move || result.bestMove;
        }

        // No personality-specific handling needed — just the engine's
        // single best move at the selected difficulty.
        return await StockfishEngine.getBestMove(fen, { movetime: settings.movetime });
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
            // Routes through the personality layer (see getPersonalityUciMove
            // above) so Aggressive/Defensive/Endgame/Trickster each play in
            // their own style while staying at the same underlying strength
            // as the selected difficulty.
            const uciMove = await withTimeout(
                getPersonalityUciMove(game.fen(), settings, userSettings.botPersonality),
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
            endGame("White surrendered. Black wins!", false, 'loss');
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

    // ===== Live in-game board theme / piece set switcher =====
    // Lets the player change to any board theme or piece set they've
    // already unlocked (purchased individually, or via an active Premium
    // subscription) WITHOUT resetting the board or losing the current
    // position — createBoard()/updateBoard() both just redraw from the
    // existing `game` object, they never touch its actual state. Opening
    // the modal pauses the game clock the exact same way the Help and
    // Advice icons already do (pauseTimer() is a no-op on Easy, which has
    // no clock to pause), so browsing themes never costs the player time.
    const THEME_SWATCHES = [
        { id: 'brown', label: 'Brown' },
        { id: 'green', label: 'Green' },
        { id: 'pink', label: 'Pink' },
        { id: 'blue', label: 'Blue' }
    ];
    const PIECESET_SWATCHES = [
        { id: 'neo', label: 'Neo' },
        { id: 'wood', label: 'Wood' },
        { id: 'glass', label: 'Glass' },
        { id: 'marble', label: 'Marble' }
    ];

    // Shared badge builder for the three swatch grids below. Only ever
    // called for items that CAN be locked (the always-free default in each
    // category — Brown/Neo/Aggressive Attacker — never gets a badge at
    // all, matching how the theme/pieceset/bot selection pages never show
    // a lock-overlay on their free default card either). For everything
    // else: closed grey padlock while locked, open GREEN padlock once
    // purchased/unlocked — same visual language as setCardLockState() uses
    // on the selection pages, so "purchased" reads the same way everywhere
    // in the app instead of just silently losing its badge here.
    function buildSwatchLockBadge(unlocked) {
        const badge = document.createElement('div');
        badge.className = 'swatch-lock-badge' + (unlocked ? ' unlocked-badge' : '');
        badge.innerHTML = `<i class="fas ${unlocked ? 'fa-lock-open' : 'fa-lock'}"></i>`;
        return badge;
    }

    // Selections made in the modal are staged here first — clicking a
    // swatch only moves the "selected" outline and updates this object;
    // nothing actually reaches the board/userSettings until the Apply
    // button is pressed (see the apply-game-settings-btn handler below).
    // Reset to a fresh copy of userSettings every time the modal opens so
    // stale picks from a previous visit never leak in.
    let pendingGameSettings = null;

    function renderGameSettingsModal() {
        const activeSettings = pendingGameSettings || userSettings;
        const themeGrid = document.getElementById('settings-theme-grid');
        const pieceSetGrid = document.getElementById('settings-pieceset-grid');
        if (themeGrid) {
            themeGrid.innerHTML = '';
            THEME_SWATCHES.forEach(({ id, label }) => {
                const unlocked = isThemeUnlocked(id);
                const swatch = document.createElement('div');
                swatch.className = `settings-swatch theme-swatch-${id}`;
                swatch.classList.toggle('locked', !unlocked);
                swatch.classList.toggle('selected', activeSettings.theme === id);
                swatch.setAttribute('role', 'button');
                swatch.setAttribute('tabindex', '0');
                swatch.setAttribute('aria-label', `${label} theme${unlocked ? '' : ' (locked)'}`);
                if (LOCKABLE_THEMES.includes(id)) {
                    swatch.appendChild(buildSwatchLockBadge(unlocked));
                }
                const labelEl = document.createElement('div');
                labelEl.className = 'swatch-label';
                labelEl.textContent = label;
                swatch.appendChild(labelEl);
                swatch.addEventListener('click', () => handleGameSettingsSwatchClick('theme', id, unlocked));
                themeGrid.appendChild(swatch);
            });
        }
        if (pieceSetGrid) {
            pieceSetGrid.innerHTML = '';
            PIECESET_SWATCHES.forEach(({ id, label }) => {
                const unlocked = isPieceSetUnlocked(id);
                const swatch = document.createElement('div');
                swatch.className = 'settings-swatch pieceset-swatch';
                swatch.classList.toggle('locked', !unlocked);
                swatch.classList.toggle('selected', activeSettings.pieceSet === id);
                swatch.setAttribute('role', 'button');
                swatch.setAttribute('tabindex', '0');
                swatch.setAttribute('aria-label', `${label} piece set${unlocked ? '' : ' (locked)'}`);
                // Preview the set with a white knight — reuses the exact
                // same CDN paths/fallback chain as the real board pieces
                // (see getPieceImageSources), so if a set's images are
                // ever unavailable this preview degrades the same way the
                // board itself does.
                const img = document.createElement('img');
                img.className = 'swatch-piece-preview';
                img.draggable = false;
                img.alt = `${label} knight preview`;
                const sources = getPieceImageSources('n', 'w', id);
                let sourceIndex = 0;
                img.src = sources[sourceIndex];
                img.onerror = function() {
                    sourceIndex++;
                    if (sourceIndex < sources.length) {
                        img.src = sources[sourceIndex];
                    } else {
                        img.remove();
                        swatch.textContent = '♘';
                    }
                };
                swatch.appendChild(img);
                if (LOCKABLE_PIECE_SETS.includes(id)) {
                    swatch.appendChild(buildSwatchLockBadge(unlocked));
                }
                const labelEl = document.createElement('div');
                labelEl.className = 'swatch-label';
                labelEl.textContent = label;
                swatch.appendChild(labelEl);
                swatch.addEventListener('click', () => handleGameSettingsSwatchClick('pieceset', id, unlocked));
                pieceSetGrid.appendChild(swatch);
            });
        }
        const botGrid = document.getElementById('settings-bot-grid');
        if (botGrid) {
            botGrid.innerHTML = '';
            BOT_PERSONALITY_ORDER.forEach((id) => {
                const meta = BOT_PERSONALITIES[id];
                if (!meta) return;
                const unlocked = isBotPersonalityUnlocked(id);
                const swatch = document.createElement('div');
                swatch.className = 'settings-swatch bot-swatch';
                swatch.classList.toggle('locked', !unlocked);
                swatch.classList.toggle('selected', activeSettings.botPersonality === id);
                swatch.setAttribute('role', 'button');
                swatch.setAttribute('tabindex', '0');
                swatch.setAttribute('aria-label', `${meta.name}${unlocked ? '' : ' (locked)'}`);
                const icon = document.createElement('i');
                icon.className = `fas ${meta.icon}`;
                swatch.appendChild(icon);
                if (LOCKABLE_BOT_PERSONALITIES.includes(id)) {
                    swatch.appendChild(buildSwatchLockBadge(unlocked));
                }
                const labelEl = document.createElement('div');
                labelEl.className = 'swatch-label';
                labelEl.textContent = meta.name;
                swatch.appendChild(labelEl);
                swatch.addEventListener('click', () => handleGameSettingsSwatchClick('bot', id, unlocked));
                botGrid.appendChild(swatch);
            });
        }
    }

    function handleGameSettingsSwatchClick(kind, id, unlocked) {
        if (!unlocked) {
            // Send them straight to the existing paywall for this exact
            // item instead of leaving a locked swatch as a dead end. Close
            // this modal first (rather than stacking modals) — the unlock
            // modal's own close/cancel/complete paths already resume the
            // timer, so the pause started when this modal opened is still
            // honored correctly either way.
            const settingsModal = document.getElementById('game-settings-modal');
            if (settingsModal) settingsModal.style.display = 'none';
            showUnlockModal(kind === 'theme' ? 'theme' : kind === 'pieceset' ? 'pieceset' : 'bot', id);
            return;
        }
        // Stage the pick only — nothing is applied to the board/game until
        // the Apply button is pressed (see apply-game-settings-btn below).
        if (!pendingGameSettings) {
            pendingGameSettings = {
                theme: userSettings.theme,
                pieceSet: userSettings.pieceSet,
                botPersonality: userSettings.botPersonality
            };
        }
        const key = kind === 'theme' ? 'theme' : kind === 'pieceset' ? 'pieceSet' : 'botPersonality';
        if (pendingGameSettings[key] === id) return;
        pendingGameSettings[key] = id;
        renderGameSettingsModal(); // refresh the "selected" outline
    }

    const gameSettingsBtn = document.getElementById('game-settings-btn');
    const gameSettingsModal = document.getElementById('game-settings-modal');
    if (gameSettingsBtn) {
        gameSettingsBtn.addEventListener('click', function() {
            pauseTimer();
            // Fresh staging copy every time the modal is opened, so picks
            // left over from a visit that was closed without Applying
            // never leak into this one.
            pendingGameSettings = {
                theme: userSettings.theme,
                pieceSet: userSettings.pieceSet,
                botPersonality: userSettings.botPersonality
            };
            renderGameSettingsModal();
            if (gameSettingsModal) gameSettingsModal.style.display = 'block';
        });
    }

    // Apply button: commits whatever is currently staged in
    // pendingGameSettings to userSettings and pushes it onto the actual
    // board/game in one go, then closes the modal.
    const applyGameSettingsBtn = document.getElementById('apply-game-settings-btn');
    if (applyGameSettingsBtn) {
        const applyBtnDefaultLabel = applyGameSettingsBtn.textContent;
        applyGameSettingsBtn.addEventListener('click', async function() {
            if (!pendingGameSettings) {
                if (gameSettingsModal) gameSettingsModal.style.display = 'none';
                resumeTimer();
                return;
            }
            // Re-verify every pending pick is still something the player is
            // actually entitled to right now — not just "was unlocked at
            // the moment they tapped the swatch". Belt-and-suspenders
            // against a Premium subscription lapsing (or any other unlock
            // state changing) in the few seconds the modal was open; a
            // pick that's no longer valid is silently dropped back to
            // whatever's already applied instead of being pushed to the
            // board. This also guarantees the preload step below can never
            // be asked to warm the cache for a piece set the player hasn't
            // paid for.
            if (!isThemeUnlocked(pendingGameSettings.theme)) {
                pendingGameSettings.theme = userSettings.theme;
            }
            if (!isPieceSetUnlocked(pendingGameSettings.pieceSet)) {
                pendingGameSettings.pieceSet = userSettings.pieceSet;
            }
            if (!isBotPersonalityUnlocked(pendingGameSettings.botPersonality)) {
                pendingGameSettings.botPersonality = userSettings.botPersonality;
            }
            const pieceSetChanging = userSettings.pieceSet !== pendingGameSettings.pieceSet;
            // If the piece set is changing, fetch every piece image for the
            // new set into the browser cache FIRST, while the old set is
            // still showing normally — so the actual swap below (once
            // everything's ready) is instant instead of trickling in piece
            // by piece as each image finishes downloading.
            if (pieceSetChanging) {
                applyGameSettingsBtn.disabled = true;
                applyGameSettingsBtn.textContent = 'Loading…';
                try {
                    await preloadPieceSetImages(pendingGameSettings.pieceSet);
                } finally {
                    applyGameSettingsBtn.disabled = false;
                    applyGameSettingsBtn.textContent = applyBtnDefaultLabel;
                }
                // The player may have re-opened/changed their mind or closed
                // the modal while the images were loading — only proceed if
                // there's still a pending selection to apply.
                if (!pendingGameSettings) return;
                // Re-check once more: a Premium subscription could have
                // expired in the seconds spent preloading. If it's no
                // longer valid, fall back to whatever's already applied
                // rather than committing it.
                if (!isPieceSetUnlocked(pendingGameSettings.pieceSet)) {
                    pendingGameSettings.pieceSet = userSettings.pieceSet;
                }
            }
            let changed = false;
            if (userSettings.theme !== pendingGameSettings.theme) {
                userSettings.theme = pendingGameSettings.theme;
                applyTheme(userSettings.theme);
                changed = true;
            }
            if (userSettings.pieceSet !== pendingGameSettings.pieceSet) {
                userSettings.pieceSet = pendingGameSettings.pieceSet;
                updateBoard();
                changed = true;
            }
            if (userSettings.botPersonality !== pendingGameSettings.botPersonality) {
                // Switching personality mid-game is safe to do live: unlike
                // the difficulty level, the bot's personality is never
                // signed into the game token or factored into leaderboard
                // scoring (see requestGameToken/submit-score.js) — it only
                // changes which roughly-equal-strength candidate move the
                // engine prefers on the bot's NEXT turn (getPersonalityUciMove
                // is re-evaluated fresh every move), so there's no game
                // state to reconcile and nothing to exploit by changing it
                // mid-game.
                userSettings.botPersonality = pendingGameSettings.botPersonality;
                const botTextEl = document.getElementById('bot-text');
                if (botTextEl) {
                    const meta = BOT_PERSONALITIES[userSettings.botPersonality];
                    botTextEl.textContent = meta ? meta.name : i18next.t('blacksTurn');
                }
                changed = true;
            }
            if (changed) updateCurrentSettings();
            pendingGameSettings = null;
            if (gameSettingsModal) gameSettingsModal.style.display = 'none';
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
            switchPage(2);
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
            
            // Get counter from localStorage or initialize to 1
            let exportCounter = parseInt(localStorage.getItem('chessPiExportCounter') || '0') + 1;
            localStorage.setItem('chessPiExportCounter', exportCounter.toString());
            
            const filename = `chesspi-${exportCounter}.pgn`;
            
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
            // An imported PGN isn't a game actually played against the
            // bot in real time, so it must never be eligible for a
            // leaderboard credit — drop any pending game token.
            currentGameToken = null;
            
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
        const modals = ['import-pgn-modal', 'promotion-modal', 'surrender-modal', 'stats-modal', 'leaderboard-modal', 'game-settings-modal'];
       
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal && event.target == modal) {
                modal.style.display = 'none';
                if (modalId === 'stats-modal' || modalId === 'leaderboard-modal') {
                    // These modals are only ever opened from the Game Over
                    // screen, so dismissing them by clicking outside should
                    // bring the player back to it — not leave the game stuck
                    // with no modal visible at all.
                    const gameOverModal = document.getElementById('game-over-modal');
                    if (gameOverModal) gameOverModal.style.display = 'block';
                } else {
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

    // Shortens a username for display on the public leaderboard, keeping
    // only the first 5 characters (4 for shorter names) and appending an
    // ellipsis — this trims off the END of the name (not the start), so
    // the visible prefix is always the real beginning of the username.
    // Protects player privacy and keeps the list visually tidy.
    function maskUsername(name) {
        if (!name) return 'Guest';
        const trimmed = name.trim();
        if (trimmed.length <= 5) return trimmed;
        return trimmed.slice(0, 5) + '···';
    }

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
                const rankNum = index + 1;
                const wins = entry.wins || 0;
                const played = entry.gamesPlayed || 0;
                const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
                const points = Number.isFinite(entry.score) ? entry.score : wins;
                const username = maskUsername(entry.username);

                const li = document.createElement('li');
                li.className = 'leaderboard-item';
                if (rankNum <= 3) li.classList.add('leaderboard-top', `rank-${rankNum}`);
                if (piUserUid && entry.uid === piUserUid) {
                    li.classList.add('leaderboard-me');
                }

                const rank = document.createElement('div');
                rank.className = 'leaderboard-rank';
                if (rankNum <= 3) {
                    rank.classList.add('leaderboard-medal');
                    rank.innerHTML = ['🥇', '🥈', '🥉'][rankNum - 1];
                } else {
                    rank.textContent = `#${rankNum}`;
                }

                const info = document.createElement('div');
                info.className = 'leaderboard-info';

                const name = document.createElement('div');
                name.className = 'leaderboard-name';
                const nameText = document.createElement('span');
                nameText.className = 'leaderboard-username-text';
                nameText.textContent = username;
                name.appendChild(nameText);
                if (entry.isVip) {
                    const vipBadge = document.createElement('span');
                    vipBadge.className = 'leaderboard-vip-badge';
                    vipBadge.innerHTML = '<i class="fas fa-crown"></i>';
                    vipBadge.title = (typeof i18next !== 'undefined' && i18next.t) ? i18next.t('vipBadgeTooltip') : 'Pi VIP — Premium subscriber or has purchased premium content';
                    name.appendChild(vipBadge);
                }

                const stats = document.createElement('div');
                stats.className = 'leaderboard-stats';
                stats.innerHTML = `<span class="leaderboard-wins"><i class="fas fa-trophy"></i> ${wins} wins</span><span class="leaderboard-dot">•</span><span class="leaderboard-played">${played} played</span><span class="leaderboard-dot">•</span><span class="leaderboard-winrate-inline">${winRate}%</span>`;

                info.appendChild(name);
                info.appendChild(stats);

                const rate = document.createElement('div');
                rate.className = 'leaderboard-winrate';
                rate.innerHTML = `${points}<span class="leaderboard-points-label">pts</span>`;

                li.appendChild(rank);
                li.appendChild(info);
                li.appendChild(rate);
                listEl.appendChild(li);
            });
        } catch (err) {
            console.error('loadLeaderboard failed:', err);
            noteEl.textContent = 'Could not load the leaderboard right now. Please try again later.';
            noteEl.style.display = 'block';
        }
    }

    // How many leaderboard points a win at each difficulty is worth.
    // Ranking uses this weighted total (see submit-score.js /
    // get-leaderboard.js) instead of raw win count, so a Hard/Expert win
    // counts for more than an Easy one — raw "wins" is still shown in the
    // UI as-is.
    const DIFFICULTY_SCORE_WEIGHTS = { easy: 1, medium: 2, hard: 3, expert: 4 };

    function calculateWeightedScore() {
        const byDiff = comprehensiveStats.byDifficulty || {};
        return Object.keys(DIFFICULTY_SCORE_WEIGHTS).reduce((total, level) => {
            const wins = (byDiff[level] && byDiff[level].wins) || 0;
            return total + wins * DIFFICULTY_SCORE_WEIGHTS[level];
        }, 0);
    }

    // Submits this player's current lifetime stats to the shared
    // leaderboard. Safe to call anytime; silently does nothing if the
    // player isn't signed in with Pi (no identity to attach the score to).
    // Submits this game's result to the shared leaderboard using the
    // signed game token issued at the start of the game (see
    // requestGameToken / start-game.js). The server — not this function —
    // is the source of truth for difficulty, timing, and the running
    // totals; all we send is "here's the token for the game that just
    // ended, and here's how it turned out". Safe to call anytime; does
    // nothing if the player isn't signed in or no valid token exists for
    // this game (e.g. an imported PGN).
    async function submitScoreToLeaderboard(result) {
        if (!piAccessToken || !currentGameToken) return;
        const gameToken = currentGameToken;
        currentGameToken = null; // single-use: never resend the same token
        try {
            await fetch('/.netlify/functions/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: piAccessToken,
                    gameToken,
                    result
                }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (err) {
            console.error('submitScoreToLeaderboard failed:', err);
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
                saveComprehensiveStats();
                displayComprehensiveStatistics();
                showCustomAlert("Statistics have been reset successfully!");
            }
        });
    }

    // ============================================================
    // PUZZLE MODE
    // ------------------------------------------------------------
    // Deliberately built as a self-contained module with its own board(s)
    // (#puzzle-chessboard / #rush-chessboard), its own Chess.js instance
    // (puzzleState.chess) and its own click handler — it does NOT touch
    // `game`, `chessboard`, or handleSquareClick(). Those already carry a
    // lot of state (bot AI, timer, hints) and reusing them here would
    // risk destabilizing the main game loop for a feature that doesn't
    // need any of that. It DOES reuse createPieceElement()/the
    // .square/.piece CSS classes so puzzles look identical to the main
    // board for free, and it reuses showPremiumModal()/isPremiumActive()/
    // setCardLockState()/renderLockState() for gating, so Premium behaves
    // and looks identical everywhere else in the app.
    //
    // Puzzle data/format follows the Lichess Puzzle Database (CC0
    // licensed: https://database.lichess.org/#puzzles) exactly:
    //   FEN    = position BEFORE the opponent's setup move.
    //   moves  = UCI move list. moves[0] is that opponent setup move
    //            (played automatically); moves[1] is the first move the
    //            PLAYER must find; moves then alternate opponent/player.
    // This means a puzzles.json generated straight from the official
    // lichess_db_puzzle.csv (see tools/build-puzzles.py) drops in with
    // zero conversion.
    //
    // GATING MODEL: unlike themes/piece sets/bot personalities/difficulty
    // levels (which support per-item Pi purchases AND a one-time free
    // trial), puzzle TYPE and puzzle DIFFICULTY are gated purely on
    // Premium subscription status — one card (Tactical) and one
    // difficulty (Easy) are free forever, everything else requires an
    // active subscription, with no per-item purchase and no free trial.
    // That's a deliberate scope decision (see the chat write-up), not an
    // oversight — flag it back if per-item puzzle purchases turn out to
    // be wanted after all.

    // ---- Category / difficulty classification (derived from Lichess
    // theme tags already present in puzzles.json, so the data file itself
    // never needs a "category" column) ----
    const PUZZLE_TYPE_META = {
        tactical: { free: true },
        rush:     { free: false },
        mateInX:  { free: false },
        endgame:  { free: false }
    };
    const PUZZLE_DIFFICULTY_META = {
        easy:   { free: true },
        medium: { free: false },
        hard:   { free: false },
        expert: { free: false }
    };
    const DIFFICULTY_POINTS = { easy: 5, medium: 10, hard: 15, expert: 20 };

    function isPuzzleTypeUnlocked(type) {
        const meta = PUZZLE_TYPE_META[type];
        return !!meta && (meta.free || isPremiumActive());
    }
    function isPuzzleDifficultyUnlocked(diff) {
        const meta = PUZZLE_DIFFICULTY_META[diff];
        return !!meta && (meta.free || isPremiumActive());
    }
    function getPuzzleCategory(p) {
        const themes = p.themes || [];
        if (themes.indexOf('mate') !== -1) return 'mateInX';
        if (themes.indexOf('endgame') !== -1) return 'endgame';
        return 'tactical';
    }
    function getPuzzleDifficultyBucket(p) {
        const r = p.rating || 1200;
        if (r < 1200) return 'easy';
        if (r < 1600) return 'medium';
        if (r < 2000) return 'hard';
        return 'expert';
    }
    function getMateInCount(p) {
        const themes = p.themes || [];
        for (let i = 0; i < themes.length; i++) {
            const m = /^mateIn(\d+)$/.exec(themes[i]);
            if (m) return parseInt(m[1], 10);
        }
        // Fallback if the theme tag is missing: every other move starting
        // at index 1 is the player's, so that's the mate-in count.
        return Math.max(1, Math.ceil((p.moves.length - 1) / 2));
    }
    const ENDGAME_TIPS = {
        promotion: "Push your pawn toward promotion — every tempo counts.",
        advancedPawn: "Push your pawn toward promotion — every tempo counts.",
        zugzwang: "Look for a quiet move that puts your opponent in zugzwang — any move they make weakens their position.",
        fortress: "Look for a defensive setup your opponent can't break through.",
        defensiveMove: "Look for a defensive setup your opponent can't break through.",
        rookEndgame: "Activate your rook and cut off the enemy king.",
        pawnEndgame: "Count the tempo carefully — king position decides pawn races.",
        queenEndgame: "Watch for perpetual check or a favorable queen trade.",
        knightEndgame: "Centralize your knight and target weak pawns.",
        bishopEndgame: "Use your bishop's long diagonal to control key squares."
    };
    function getEndgameTip(p) {
        const themes = p.themes || [];
        for (let i = 0; i < themes.length; i++) {
            if (ENDGAME_TIPS[themes[i]]) return ENDGAME_TIPS[themes[i]];
        }
        return "Look for the most forcing continuation — checks, captures, and threats first.";
    }

    // ---- Points (a simple cumulative score, not a true Elo/Glicko
    // rating — awarding an actual skill rating would need real
    // opponent-strength comparisons, which a static puzzle set can't do
    // honestly) ----
    function getPuzzlePoints() {
        let pts = 0;
        try { pts = parseInt(localStorage.getItem('chessPiPuzzlePoints') || '0', 10) || 0; } catch (e) {}
        return pts;
    }
    function addPuzzlePoints(n) {
        const pts = getPuzzlePoints() + n;
        try { localStorage.setItem('chessPiPuzzlePoints', String(pts)); } catch (e) {}
        const el = document.getElementById('puzzle-points');
        if (el) el.textContent = pts;
        return pts;
    }

    let puzzleState = {
        allPuzzles: null,       // loaded once from puzzles.json
        current: null,          // the puzzle object currently loaded
        chess: null,            // Chess.js instance for the puzzle board
        playerColor: 'w',
        moveIndex: 0,           // index into current.moves for the NEXT move
        solved: false,
        selectedType: 'tactical',
        selectedDifficulty: 'easy',
        category: 'tactical',
        mode: 'normal',         // 'normal' | 'rush'
        boardId: 'puzzle-chessboard',
        feedbackId: 'puzzle-feedback',
        mateRemaining: 0,
        endgameTipText: ''
    };

    function getPuzzleStats() {
        const today = new Date().toISOString().slice(0, 10);
        let stats;
        try {
            stats = JSON.parse(localStorage.getItem('chessPiPuzzleStats') || 'null');
        } catch (e) {
            stats = null;
        }
        if (!stats || stats.date !== today) {
            stats = { date: today, solvedToday: 0, totalSolved: stats ? (stats.totalSolved || 0) : 0, solvedIds: [] };
        }
        if (!Array.isArray(stats.solvedIds)) stats.solvedIds = [];
        return stats;
    }
    function savePuzzleStats(stats) {
        try {
            localStorage.setItem('chessPiPuzzleStats', JSON.stringify(stats));
        } catch (e) {
            console.error('savePuzzleStats failed:', e);
        }
    }

    async function loadPuzzlesData() {
        if (puzzleState.allPuzzles) return puzzleState.allPuzzles;
        try {
            const res = await fetch('puzzles.json');
            if (!res.ok) throw new Error('puzzles.json HTTP ' + res.status);
            puzzleState.allPuzzles = await res.json();
        } catch (err) {
            console.error('Failed to load puzzles.json:', err);
            puzzleState.allPuzzles = [];
        }
        return puzzleState.allPuzzles;
    }

    // Picks the next puzzle matching the selected type + difficulty
    // (already gated at card-click time — see the type/difficulty click
    // handlers below — so no premium re-check needed here), preferring
    // ones not already solved. Falls back to relaxing difficulty, then
    // type, rather than showing nothing if a combination is thin in the
    // seed dataset.
    async function pickNextPuzzle() {
        const all = await loadPuzzlesData();
        if (!all.length) return null;
        const type = puzzleState.selectedType || 'tactical';
        const diff = puzzleState.selectedDifficulty || 'easy';
        const matchesType = (p) => (type === 'rush' || getPuzzleCategory(p) === type);

        let pool = all.filter(p => matchesType(p) && getPuzzleDifficultyBucket(p) === diff);
        if (!pool.length) pool = all.filter(matchesType);
        if (!pool.length) pool = all;

        const stats = getPuzzleStats();
        const unsolved = pool.filter(p => !stats.solvedIds.includes(p.id));
        const chooseFrom = unsolved.length ? unsolved : pool;
        return chooseFrom[Math.floor(Math.random() * chooseFrom.length)];
    }

    function createPuzzleBoard() {
        const boardId = puzzleState.boardId || 'puzzle-chessboard';
        const board = document.getElementById(boardId);
        if (!board) return;
        board.innerHTML = '';
        const flip = puzzleState.playerColor === 'b';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const row = flip ? 7 - r : r;
                const col = flip ? 7 - c : c;
                const square = document.createElement('div');
                square.classList.add('square');
                square.classList.add((row + col) % 2 === 0 ? 'white' : 'black');
                square.dataset.row = row;
                square.dataset.col = col;
                square.tabIndex = 0;
                square.setAttribute('role', 'button');
                square.addEventListener('click', () => handlePuzzleSquareClick(row, col));
                square.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlePuzzleSquareClick(row, col); });
                board.appendChild(square);
            }
        }
    }

    let puzzleSelectedSquare = null;

    function updatePuzzleBoard() {
        const boardId = puzzleState.boardId || 'puzzle-chessboard';
        const currentPieceSet = ['neo', 'wood', 'glass', 'marble'].includes(userSettings.pieceSet) ? userSettings.pieceSet : 'neo';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const squareName = String.fromCharCode(97 + col) + (8 - row);
                const piece = puzzleState.chess.get(squareName);
                const squareEl = document.querySelector(`#${boardId} .square[data-row="${row}"][data-col="${col}"]`);
                if (!squareEl) continue;
                squareEl.innerHTML = '';
                squareEl.classList.remove('selected', 'legal-move', 'hint-from', 'hint-to');
                if (piece) squareEl.appendChild(createPieceElement(piece.type, piece.color, currentPieceSet));
            }
        }
    }

    function clearPuzzleSelection() {
        const boardId = puzzleState.boardId || 'puzzle-chessboard';
        puzzleSelectedSquare = null;
        document.querySelectorAll(`#${boardId} .square`).forEach(sq => sq.classList.remove('selected', 'legal-move'));
    }

    function handlePuzzleSquareClick(row, col) {
        if (!puzzleState.current || puzzleState.solved) return;
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        const piece = puzzleState.chess.get(squareName);

        if (puzzleSelectedSquare) {
            const from = puzzleSelectedSquare;
            if (from === squareName) { clearPuzzleSelection(); return; }
            const attempt = { from, to: squareName, promotion: 'q' };
            const legal = puzzleState.chess.moves({ square: from, verbose: true })
                .some(m => m.to === squareName);
            clearPuzzleSelection();
            if (!legal) {
                // Might just be selecting a different one of the player's own pieces.
                if (piece && piece.color === puzzleState.chess.turn()) {
                    selectPuzzleSquare(squareName);
                }
                return;
            }
            attemptPuzzleMove(attempt);
            return;
        }

        if (piece && piece.color === puzzleState.chess.turn()) {
            selectPuzzleSquare(squareName);
        }
    }

    function selectPuzzleSquare(squareName) {
        const boardId = puzzleState.boardId || 'puzzle-chessboard';
        puzzleSelectedSquare = squareName;
        const col = squareName.charCodeAt(0) - 97;
        const row = 8 - parseInt(squareName[1]);
        const squareEl = document.querySelector(`#${boardId} .square[data-row="${row}"][data-col="${col}"]`);
        if (squareEl) squareEl.classList.add('selected');
        puzzleState.chess.moves({ square: squareName, verbose: true }).forEach(m => {
            const tCol = m.to.charCodeAt(0) - 97;
            const tRow = 8 - parseInt(m.to[1]);
            const tEl = document.querySelector(`#${boardId} .square[data-row="${tRow}"][data-col="${tCol}"]`);
            if (tEl) tEl.classList.add('legal-move');
        });
    }

    // Highlights the correct next move's origin/target squares (reusing
    // the same .hint-from/.hint-to styling the bot game's own Hint
    // feature uses) rather than auto-playing it — the player still has to
    // make the move themselves. For Endgame puzzles specifically, also
    // reveals a short plain-language tip about the general idea, per the
    // "hints that explain the general endgame idea if the player gets
    // stuck" requirement.
    function providePuzzleHint() {
        if (!puzzleState.current || puzzleState.solved) return;
        const boardId = puzzleState.boardId || 'puzzle-chessboard';
        document.querySelectorAll(`#${boardId} .square`).forEach(sq => sq.classList.remove('hint-from', 'hint-to'));
        const uci = puzzleState.current.moves[puzzleState.moveIndex];
        if (!uci) return;
        const from = uci.slice(0, 2), to = uci.slice(2, 4);
        const highlight = (sq, cls) => {
            const col = sq.charCodeAt(0) - 97;
            const row = 8 - parseInt(sq[1]);
            const el = document.querySelector(`#${boardId} .square[data-row="${row}"][data-col="${col}"]`);
            if (el) el.classList.add(cls);
        };
        highlight(from, 'hint-from');
        highlight(to, 'hint-to');

        if (puzzleState.category === 'endgame') {
            const tipEl = document.getElementById('puzzle-endgame-tip');
            if (tipEl) {
                tipEl.textContent = puzzleState.endgameTipText || getEndgameTip(puzzleState.current);
                tipEl.style.display = 'block';
            }
        }
    }

    // Decrements the "Mate in N" badge — called once per correct PLAYER
    // move only (not the opponent's automatic replies), since the count
    // tracks moves remaining for the player to deliver mate.
    function updateMateCounter() {
        if (puzzleState.mode === 'rush' || puzzleState.category !== 'mateInX') return;
        puzzleState.mateRemaining = Math.max(0, (puzzleState.mateRemaining || 1) - 1);
        const el = document.getElementById('puzzle-mate-counter');
        if (el) el.textContent = puzzleState.mateRemaining > 0 ? `Mate in ${puzzleState.mateRemaining}` : 'Mate!';
    }

    function attemptPuzzleMove(attempt) {
        const expectedUci = puzzleState.current.moves[puzzleState.moveIndex];
        const playedUci = attempt.from + attempt.to + (attempt.promotion && isPuzzlePromotion(attempt) ? attempt.promotion : '');
        const expectedNoPromo = expectedUci.slice(0, 4);
        const playedNoPromo = playedUci.slice(0, 4);
        const feedbackEl = document.getElementById(puzzleState.feedbackId || 'puzzle-feedback');

        if (playedNoPromo !== expectedNoPromo) {
            if (!isMuted && sounds['illegal']) sounds['illegal'].play();
            if (puzzleState.mode === 'rush') {
                rushState.mistakes++;
                if (feedbackEl) { feedbackEl.textContent = 'Wrong — next puzzle.'; feedbackEl.className = 'puzzle-feedback wrong'; }
                if (rushState.mode === 'survival') {
                    const livesEl = document.getElementById('rush-mistakes-left');
                    if (livesEl) livesEl.textContent = String(Math.max(0, 3 - rushState.mistakes));
                    if (rushState.mistakes >= 3) {
                        setTimeout(endRushRun, 600);
                        return;
                    }
                }
                setTimeout(loadNextRushPuzzle, 600);
            } else if (feedbackEl) {
                feedbackEl.textContent = 'Not quite — try again.';
                feedbackEl.className = 'puzzle-feedback wrong';
            }
            return;
        }

        // Correct — apply it for real (with promotion piece from the puzzle data if any).
        const promo = expectedUci.length > 4 ? expectedUci[4] : undefined;
        puzzleState.chess.move({ from: attempt.from, to: attempt.to, promotion: promo || 'q' });
        updatePuzzleBoard();
        if (!isMuted && sounds['move-self']) sounds['move-self'].play();
        puzzleState.moveIndex++;
        updateMateCounter();
        maybeAdvancePuzzle();
    }

    function isPuzzlePromotion(attempt) {
        const piece = puzzleState.chess.get(attempt.from);
        return piece && piece.type === 'p' && (attempt.to[1] === '8' || attempt.to[1] === '1');
    }

    function maybeAdvancePuzzle() {
        const moves = puzzleState.current.moves;
        const feedbackEl = document.getElementById(puzzleState.feedbackId || 'puzzle-feedback');
        if (puzzleState.moveIndex >= moves.length) {
            finishPuzzle(true);
            return;
        }
        // Next move belongs to the opponent — play it automatically after a
        // short beat so it reads as a reply, not an instant swap.
        if (feedbackEl) { feedbackEl.textContent = 'Good move!'; feedbackEl.className = 'puzzle-feedback correct'; }
        setTimeout(() => {
            const uci = moves[puzzleState.moveIndex];
            const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.length > 4 ? uci[4] : undefined;
            puzzleState.chess.move({ from, to, promotion: promo || 'q' });
            updatePuzzleBoard();
            if (!isMuted && sounds['move-opponent']) sounds['move-opponent'].play();
            puzzleState.moveIndex++;
            if (puzzleState.moveIndex >= moves.length) {
                finishPuzzle(true);
            } else if (feedbackEl) {
                feedbackEl.textContent = 'Your move.';
                feedbackEl.className = 'puzzle-feedback';
            }
        }, 500);
    }

    function finishPuzzle(success) {
        puzzleState.solved = success;
        const feedbackEl = document.getElementById(puzzleState.feedbackId || 'puzzle-feedback');
        if (success) {
            if (feedbackEl) { feedbackEl.textContent = 'Puzzle solved! 🎉'; feedbackEl.className = 'puzzle-feedback correct'; }
            if (!isMuted && sounds['game-win']) sounds['game-win'].play();
            const stats = getPuzzleStats();
            if (!stats.solvedIds.includes(puzzleState.current.id)) {
                stats.solvedIds.push(puzzleState.current.id);
                stats.solvedToday++;
                stats.totalSolved++;
                savePuzzleStats(stats);
            }
            const diffKey = puzzleState.selectedDifficulty || getPuzzleDifficultyBucket(puzzleState.current);
            addPuzzlePoints(DIFFICULTY_POINTS[diffKey] || 5);

            if (puzzleState.mode === 'rush') {
                rushState.solved++;
                const solvedEl = document.getElementById('rush-solved-count');
                if (solvedEl) solvedEl.textContent = String(rushState.solved);
                setTimeout(loadNextRushPuzzle, 500);
                return; // rush mode advances automatically — no Next Puzzle button
            }
        }
        const nextBtn = document.getElementById('puzzle-next-btn');
        if (nextBtn) nextBtn.style.display = success ? 'inline-block' : 'none';
    }

    async function loadPuzzleIntoBoard(puzzle) {
        puzzleState.current = puzzle;
        puzzleState.chess = new Chess(puzzle.fen);
        puzzleState.moveIndex = 0;
        puzzleState.solved = false;
        puzzleState.category = getPuzzleCategory(puzzle);
        puzzleState.endgameTipText = getEndgameTip(puzzle);
        // Player plays the side to move AFTER the opponent's automatic
        // setup move (moves[0]) is applied — i.e. the opposite of whoever
        // is to move in the raw FEN.
        puzzleState.playerColor = puzzleState.chess.turn() === 'w' ? 'b' : 'w';
        createPuzzleBoard();
        updatePuzzleBoard();

        const isRush = puzzleState.mode === 'rush';

        const ratingEl = document.getElementById('puzzle-rating');
        if (ratingEl && !isRush) ratingEl.textContent = puzzle.rating ? ('~' + puzzle.rating) : '';

        const nextBtn = document.getElementById('puzzle-next-btn');
        if (nextBtn) nextBtn.style.display = 'none';

        const tipEl = document.getElementById('puzzle-endgame-tip');
        if (tipEl) tipEl.style.display = 'none'; // only revealed via Hint

        const mateCounterEl = document.getElementById('puzzle-mate-counter');
        if (mateCounterEl) {
            if (!isRush && puzzleState.category === 'mateInX') {
                puzzleState.mateRemaining = getMateInCount(puzzle);
                mateCounterEl.textContent = `Mate in ${puzzleState.mateRemaining}`;
                mateCounterEl.style.display = 'inline-flex';
            } else {
                mateCounterEl.style.display = 'none';
            }
        }

        const feedbackEl = document.getElementById(puzzleState.feedbackId || 'puzzle-feedback');
        if (feedbackEl) {
            feedbackEl.textContent = 'Find the best move for ' + (puzzleState.playerColor === 'w' ? 'White' : 'Black') + '.';
            feedbackEl.className = 'puzzle-feedback';
        }

        // Apply the opponent's automatic setup move (moves[0]) after a
        // short beat so the player sees the starting position first
        // (snappier in Puzzle Rush, where speed matters).
        setTimeout(() => {
            const uci = puzzle.moves[0];
            const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.length > 4 ? uci[4] : undefined;
            puzzleState.chess.move({ from, to, promotion: promo || 'q' });
            updatePuzzleBoard();
            if (!isMuted && sounds['move-opponent']) sounds['move-opponent'].play();
            puzzleState.moveIndex = 1;
        }, isRush ? 150 : 400);
    }

    // Entry point for the standard (non-rush) puzzles page — type and
    // difficulty were already chosen (and gated) on the two pages before
    // this one.
    async function startNextPuzzle() {
        puzzleState.mode = 'normal';
        puzzleState.boardId = 'puzzle-chessboard';
        puzzleState.feedbackId = 'puzzle-feedback';
        const pointsEl = document.getElementById('puzzle-points');
        if (pointsEl) pointsEl.textContent = getPuzzlePoints();
        const puzzle = await pickNextPuzzle();
        if (!puzzle) {
            const fb = document.getElementById('puzzle-feedback');
            if (fb) { fb.textContent = 'No puzzles available right now.'; fb.className = 'puzzle-feedback'; }
            return;
        }
        loadPuzzleIntoBoard(puzzle);
    }

    // ---- Puzzle Rush ----
    // NOTE: "Today's Best" / "This Week's Best" below are tracked
    // per-device in localStorage. There's no shared backend in this
    // project, so a real cross-player leaderboard isn't wired up — the
    // page says so explicitly rather than implying a competition that
    // isn't really happening.
    let rushState = {
        active: false,
        mode: null,       // 'time3' | 'time5' | 'survival'
        solved: 0,
        mistakes: 0,
        timeLeftSec: 0,
        timerInterval: null
    };

    function resetRushUI() {
        const modeSelectEl = document.getElementById('rush-mode-select');
        const playAreaEl = document.getElementById('rush-play-area');
        const resultsEl = document.getElementById('rush-results');
        if (modeSelectEl) modeSelectEl.style.display = 'flex';
        if (playAreaEl) playAreaEl.style.display = 'none';
        if (resultsEl) resultsEl.style.display = 'none';
        stopRushRun();
    }

    function stopRushRun() {
        if (rushState.timerInterval) clearInterval(rushState.timerInterval);
        rushState.timerInterval = null;
        rushState.active = false;
    }

    function updateRushTimerDisplay() {
        const m = Math.floor(rushState.timeLeftSec / 60);
        const s = rushState.timeLeftSec % 60;
        const el = document.getElementById('rush-time-left');
        if (el) el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function startRushRun(mode) {
        rushState.active = true;
        rushState.mode = mode;
        rushState.solved = 0;
        rushState.mistakes = 0;
        puzzleState.mode = 'rush';
        puzzleState.boardId = 'rush-chessboard';
        puzzleState.feedbackId = 'rush-feedback';

        const modeSelectEl = document.getElementById('rush-mode-select');
        const playAreaEl = document.getElementById('rush-play-area');
        const resultsEl = document.getElementById('rush-results');
        if (modeSelectEl) modeSelectEl.style.display = 'none';
        if (resultsEl) resultsEl.style.display = 'none';
        if (playAreaEl) playAreaEl.style.display = 'flex';
        const solvedCountEl = document.getElementById('rush-solved-count');
        if (solvedCountEl) solvedCountEl.textContent = '0';

        const timerDisplay = document.getElementById('rush-timer-display');
        const mistakesDisplay = document.getElementById('rush-mistakes-display');
        if (mode === 'survival') {
            if (timerDisplay) timerDisplay.style.display = 'none';
            if (mistakesDisplay) mistakesDisplay.style.display = 'inline-flex';
            const livesEl = document.getElementById('rush-mistakes-left');
            if (livesEl) livesEl.textContent = '3';
        } else {
            if (timerDisplay) timerDisplay.style.display = 'inline-flex';
            if (mistakesDisplay) mistakesDisplay.style.display = 'none';
            rushState.timeLeftSec = mode === 'time5' ? 300 : 180;
            updateRushTimerDisplay();
            rushState.timerInterval = setInterval(() => {
                rushState.timeLeftSec--;
                updateRushTimerDisplay();
                if (rushState.timeLeftSec <= 0) endRushRun();
            }, 1000);
        }
        loadNextRushPuzzle();
    }

    async function loadNextRushPuzzle() {
        if (!rushState.active) return;
        puzzleState.selectedType = 'rush';
        const puzzle = await pickNextPuzzle();
        if (!puzzle) { endRushRun(); return; }
        loadPuzzleIntoBoard(puzzle);
    }

    function getIsoWeekKey() {
        const d = new Date();
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${week}`;
    }
    function getRushBests() {
        try { return JSON.parse(localStorage.getItem('chessPiRushBests') || '{}'); } catch (e) { return {}; }
    }
    function saveRushBests(bests) {
        try { localStorage.setItem('chessPiRushBests', JSON.stringify(bests)); } catch (e) {}
    }

    function endRushRun() {
        stopRushRun();
        const playAreaEl = document.getElementById('rush-play-area');
        const resultsEl = document.getElementById('rush-results');
        if (playAreaEl) playAreaEl.style.display = 'none';
        if (resultsEl) resultsEl.style.display = 'block';
        const summaryEl = document.getElementById('rush-results-summary');
        if (summaryEl) summaryEl.textContent = `You solved ${rushState.solved} puzzle${rushState.solved === 1 ? '' : 's'}.`;

        const bests = getRushBests();
        const todayKey = new Date().toISOString().slice(0, 10);
        const weekKey = 'week:' + getIsoWeekKey();
        if (!bests[todayKey] || rushState.solved > bests[todayKey]) bests[todayKey] = rushState.solved;
        if (!bests[weekKey] || rushState.solved > bests[weekKey]) bests[weekKey] = rushState.solved;
        saveRushBests(bests);
        const bestTodayEl = document.getElementById('rush-best-today');
        const bestWeekEl = document.getElementById('rush-best-week');
        if (bestTodayEl) bestTodayEl.textContent = bests[todayKey] || 0;
        if (bestWeekEl) bestWeekEl.textContent = bests[weekKey] || 0;
    }

    // ---- Wiring: mode-select page ----
    const modePlayCardEl = document.getElementById('mode-play-card');
    if (modePlayCardEl) {
        modePlayCardEl.addEventListener('click', () => switchPage(2));
    }
    const modePuzzlesCardEl = document.getElementById('mode-puzzles-card');
    if (modePuzzlesCardEl) {
        modePuzzlesCardEl.addEventListener('click', () => switchPage(7));
    }

    // ---- Wiring: puzzle type selection page ----
    document.querySelectorAll('.puzzle-type-card').forEach((card) => {
        card.addEventListener('click', function() {
            if (this.classList.contains('locked')) {
                showPremiumModal();
                return;
            }
            puzzleState.selectedType = this.getAttribute('data-puzzle-type');
            switchPage(8);
        });
    });
    const puzzleTypeBackBtnEl = document.getElementById('puzzle-type-back-btn');
    if (puzzleTypeBackBtnEl) {
        puzzleTypeBackBtnEl.addEventListener('click', () => switchPage(1));
    }

    // ---- Wiring: puzzle difficulty selection page ----
    document.querySelectorAll('.puzzle-difficulty-card').forEach((card) => {
        card.addEventListener('click', function() {
            if (this.classList.contains('locked')) {
                showPremiumModal();
                return;
            }
            puzzleState.selectedDifficulty = this.getAttribute('data-puzzle-difficulty');
            switchPage(puzzleState.selectedType === 'rush' ? 10 : 9);
        });
    });
    const puzzleDifficultyBackBtnEl = document.getElementById('puzzle-difficulty-back-btn');
    if (puzzleDifficultyBackBtnEl) {
        puzzleDifficultyBackBtnEl.addEventListener('click', () => switchPage(7));
    }

    // ---- Wiring: puzzles page (normal, non-rush) ----
    const puzzleNextBtnEl = document.getElementById('puzzle-next-btn');
    if (puzzleNextBtnEl) {
        puzzleNextBtnEl.addEventListener('click', startNextPuzzle);
    }
    const puzzleHintBtnEl = document.getElementById('puzzle-hint-btn');
    if (puzzleHintBtnEl) {
        puzzleHintBtnEl.addEventListener('click', providePuzzleHint);
    }
    const puzzleBackBtnEl = document.getElementById('puzzle-back-btn');
    if (puzzleBackBtnEl) {
        puzzleBackBtnEl.addEventListener('click', () => switchPage(8));
    }

    // ---- Wiring: puzzle rush page ----
    document.querySelectorAll('.rush-mode-card').forEach((card) => {
        card.addEventListener('click', function() {
            startRushRun(this.getAttribute('data-rush-mode'));
        });
    });
    const rushPlayAgainBtnEl = document.getElementById('rush-play-again-btn');
    if (rushPlayAgainBtnEl) {
        rushPlayAgainBtnEl.addEventListener('click', resetRushUI);
    }
    const puzzleRushBackBtnEl = document.getElementById('puzzle-rush-back-btn');
    if (puzzleRushBackBtnEl) {
        puzzleRushBackBtnEl.addEventListener('click', () => { stopRushRun(); switchPage(8); });
    }
});
