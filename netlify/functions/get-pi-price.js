// netlify/functions/get-pi-price.js
//
// Returns the current market price of Pi (PI) in USD, so the client can
// convert fixed USD prices (theme/level/piece-set unlocks, refill) into the
// equivalent amount of Pi at checkout time.
//
// Sources, in order:
//   1) CoinGecko's public "simple price" endpoint (free, no API key needed).
//   2) CoinMarketCap's quotes endpoint, only if a CMC_API_KEY env var is
//      configured (CMC requires a paid/registered API key).
//   3) The last successfully fetched price, cached in Netlify Blobs, served
//      stale rather than failing outright.
//
// If CoinGecko, CoinMarketCap, AND the cache all fail/are empty at once
// (e.g. a brand-new deploy with both sources down), the function returns
// an error instead of guessing a price — an inaccurate price would let
// players get unlocks for the wrong amount of Pi.
//
// The result is cached for a few minutes so we don't hammer the price APIs
// on every single unlock-modal open — Pi's price doesn't move fast enough
// for that to matter, and it keeps us well under any rate limits.
const axios = require('axios');
const { getStore } = require('@netlify/blobs');

const CACHE_KEY = 'pi-usd-price';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// See get-leaderboard.js for why this manual-override helper exists.
function getBlobStore(name) {
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;
    if (siteID && token) {
        return getStore({ name, siteID, token });
    }
    return getStore(name);
}

async function fetchFromCoinGecko() {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'pi-network', vs_currencies: 'usd' },
        timeout: 8000
    });
    const price = res.data && res.data['pi-network'] && res.data['pi-network'].usd;
    if (typeof price !== 'number' || !(price > 0)) throw new Error('CoinGecko: unexpected response shape');
    return price;
}

async function fetchFromCoinMarketCap() {
    const apiKey = process.env.CMC_API_KEY;
    if (!apiKey) throw new Error('CoinMarketCap: CMC_API_KEY not configured');
    const res = await axios.get('https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest', {
        params: { symbol: 'PI' },
        headers: { 'X-CMC_PRO_API_KEY': apiKey },
        timeout: 8000
    });
    const entry = res.data && res.data.data && res.data.data.PI;
    const item = Array.isArray(entry) ? entry[0] : entry;
    const price = item && item.quote && item.quote.USD && item.quote.USD.price;
    if (typeof price !== 'number' || !(price > 0)) throw new Error('CoinMarketCap: unexpected response shape');
    return price;
}

exports.handler = async () => {
    let store;
    try {
        store = getBlobStore('pi-price-cache');
    } catch (e) {
        store = null; // Blobs unavailable in this environment; fall through to live fetch only.
    }

    // Serve a fresh cached price without calling any external API at all.
    if (store) {
        try {
            const cached = await store.get(CACHE_KEY, { type: 'json' });
            if (cached && typeof cached.price === 'number' && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ price: cached.price, source: cached.source, cached: true, timestamp: cached.timestamp })
                };
            }
        } catch (e) {
            console.error('get-pi-price: cache read failed:', e.message);
        }
    }

    let price, source;
    try {
        price = await fetchFromCoinGecko();
        source = 'coingecko';
    } catch (err1) {
        console.error('get-pi-price: CoinGecko failed:', err1.message);
        try {
            price = await fetchFromCoinMarketCap();
            source = 'coinmarketcap';
        } catch (err2) {
            console.error('get-pi-price: CoinMarketCap failed:', err2.message);
            // Both live sources are down — fall back to whatever we last
            // cached (even if stale).
            if (store) {
                try {
                    const stale = await store.get(CACHE_KEY, { type: 'json' });
                    if (stale && typeof stale.price === 'number') {
                        return {
                            statusCode: 200,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ price: stale.price, source: stale.source, cached: true, stale: true, timestamp: stale.timestamp })
                        };
                    }
                } catch (e) {
                    console.error('get-pi-price: stale cache read failed:', e.message);
                }
            }
            // No live price, and no cache to fall back on — refuse to
            // guess. The client should treat this as "price unavailable"
            // rather than proceed with a made-up number.
            return {
                statusCode: 503,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Pi price unavailable: all sources failed and no cached price exists' })
            };
        }
    }

    const timestamp = Date.now();
    if (store) {
        try {
            await store.setJSON(CACHE_KEY, { price, source, timestamp });
        } catch (e) {
            console.error('get-pi-price: cache write failed:', e.message);
        }
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price, source, cached: false, timestamp })
    };
};
