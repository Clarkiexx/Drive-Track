/**
 * Citation reverse geocoding.
 *
 * Turns the GPS fix captured while issuing a citation into a short,
 * human-readable place label. Nominatim (OpenStreetMap) is the primary
 * provider and Photon (Komoot) is the fallback when Nominatim errors out or
 * has no usable address for the point.
 *
 * Hard rules:
 *  - No database writes and no schema knowledge — this is purely a lookup.
 *  - In-memory cache only (3 decimal places, ~110 m, 24 h TTL). Successful
 *    lookups are cached; misses re-query so a transient gap is not sticky.
 *  - Nominatim's public usage policy allows at most one request per second,
 *    so every Nominatim call is serialized through a single global queue.
 *    The limit applies across all users and all concurrent requests.
 *  - Upstream errors never escape with their raw body: the controller turns
 *    GEOCODING_UNAVAILABLE into a safe 502.
 *  - No logging of secrets or precise coordinates (the only coordinates that
 *    ever appear in a log line, if any, are the rounded cache key).
 *
 * No new npm dependencies — uses the Node 18+ global fetch.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const PHOTON_URL = 'https://photon.komoot.io/reverse';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PRECISION = 3; // decimal places -> ~110 m buckets
const MAX_CACHE_ENTRIES = 5000;

const UPSTREAM_TIMEOUT_MS = 5000;
const NOMINATIM_MIN_INTERVAL_MS = 1000; // one request per second, globally

const DEFAULT_USER_AGENT = 'DriveTrack/1.0 (citation location resolver)';
const MAX_PLACE_NAME_LENGTH = 120;

/** key `lat.toFixed(3),lng.toFixed(3)` -> { value, expiresAt } */
const cache = new Map();

/** Tail of the global Nominatim request chain. */
let nominatimQueue = Promise.resolve();
let lastNominatimStart = 0;

function userAgent() {
  return process.env.GEOCODING_USER_AGENT || DEFAULT_USER_AGENT;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(lat, lng) {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
    // Still full: evict the oldest inserted entry (Map preserves order).
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Runs `task` on the global Nominatim chain, waiting long enough that the
 * previous request started at least NOMINATIM_MIN_INTERVAL_MS ago. A failed
 * request never blocks the queue — the chain always settles.
 */
function scheduleNominatim(task) {
  const run = nominatimQueue.then(async () => {
    const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimStart);
    if (wait > 0) await delay(wait);
    lastNominatimStart = Date.now();
    return task();
  });
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function upstreamError(provider) {
  const err = new Error(`${provider} reverse geocoding is unavailable`);
  err.code = 'GEOCODING_UNAVAILABLE';
  return err;
}

/**
 * Fetches JSON with a hard timeout. The upstream response body is never
 * attached to the thrown error — callers only ever see a safe coded error.
 */
async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pick(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function sameText(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function capPlaceName(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_PLACE_NAME_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_PLACE_NAME_LENGTH - 1).trimEnd()}…`;
}

function joinDistinct(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    if (!part) continue;
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out;
}

/**
 * Nominatim address -> concise label. Road + locality is the useful pair for
 * a citation (e.g. "Gorordo Avenue, Cebu City"); POI/neighbourhood names are
 * used only when there is no road.
 */
function buildPlaceNameFromNominatim(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const address = payload.address && typeof payload.address === 'object' ? payload.address : {};

  const road = pick(address, ['road', 'pedestrian', 'residential', 'footway', 'path']);
  const locality = pick(address, [
    'city',
    'town',
    'village',
    'municipality',
    'suburb',
    'neighbourhood',
    'county',
  ]);

  if (road && locality && !sameText(road, locality)) {
    return capPlaceName(`${road}, ${locality}`);
  }
  if (road) return capPlaceName(road);

  const specific = pick(address, [
    'amenity',
    'neighbourhood',
    'suburb',
    'village',
    'town',
    'city',
    'municipality',
    'county',
  ]);
  if (specific) return capPlaceName(specific);

  const name = pick(payload, ['name']);
  if (name) return capPlaceName(name);

  const display = pick(payload, ['display_name']);
  if (display) return capPlaceName(display.split(',')[0]);

  return null;
}

function buildDisplayNameFromNominatim(payload) {
  return pick(payload, ['display_name']) || null;
}

/**
 * Photon properties -> concise label. Photon has no display_name; `name` is
 * usually the street or POI and `city`/`district`/`county` supply context.
 */
function buildPlaceNameFromPhoton(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const props = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};

  const specific = pick(props, ['name', 'street']);
  const locality = pick(props, ['city', 'town', 'village', 'district', 'county', 'state']);

  if (specific && locality && !sameText(specific, locality) && !specific.toLowerCase().includes(locality.toLowerCase())) {
    return capPlaceName(`${specific}, ${locality}`);
  }
  if (specific) return capPlaceName(specific);
  if (locality) return capPlaceName(locality);
  return null;
}

function buildDisplayNameFromPhoton(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const props = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};

  const streetLine = pick(props, ['street']);
  const houseNumber = pick(props, ['housenumber']);
  const name = pick(props, ['name']);

  const parts = joinDistinct([
    houseNumber && streetLine ? `${houseNumber} ${streetLine}` : '',
    name,
    !houseNumber && streetLine ? streetLine : '',
    pick(props, ['district']),
    pick(props, ['city']),
    pick(props, ['county']),
    pick(props, ['state']),
    pick(props, ['country']),
  ]);

  return parts.length > 0 ? parts.join(', ') : null;
}

async function lookupNominatim(lat, lng) {
  const url =
    `${NOMINATIM_URL}?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    '&format=jsonv2&zoom=16&addressdetails=1&accept-language=en';

  const payload = await scheduleNominatim(() =>
    fetchJson(url, {
      'User-Agent': userAgent(),
      Accept: 'application/json',
      'Accept-Language': 'en',
    })
  );

  const placeName = buildPlaceNameFromNominatim(payload);
  if (!placeName) return null;
  return {
    placeName,
    displayName: buildDisplayNameFromNominatim(payload) || placeName,
    source: 'nominatim',
    cached: false,
  };
}

async function lookupPhoton(lat, lng) {
  const url =
    `${PHOTON_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&lang=en`;

  const payload = await fetchJson(url, {
    'User-Agent': userAgent(),
    Accept: 'application/json',
  });

  const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
  if (!feature) return null;

  const placeName = buildPlaceNameFromPhoton(feature);
  if (!placeName) return null;
  return {
    placeName,
    displayName: buildDisplayNameFromPhoton(feature) || placeName,
    source: 'photon',
    cached: false,
  };
}

const EMPTY_RESULT = { placeName: null, displayName: null, source: null, cached: false };

/**
 * Resolves coordinates to a place label.
 *
 * @returns {Promise<{placeName: string|null, displayName: string|null,
 *   source: 'nominatim'|'photon'|'cache'|null, cached: boolean}>}
 * @throws coded error (GEOCODING_UNAVAILABLE) when no upstream could be
 *   reached. A reachable upstream that simply has no address for the point
 *   yields the empty result instead — that is not a failure.
 */
async function reverseGeocode(lat, lng) {
  const key = cacheKey(lat, lng);

  const hit = readCache(key);
  if (hit) {
    return { ...hit, source: 'cache', cached: true };
  }

  let upstreamReachable = false;
  let result = null;

  try {
    result = await lookupNominatim(lat, lng);
    upstreamReachable = true;
  } catch {
    // Nominatim failed (timeout, HTTP error, malformed body): fall back.
  }

  if (!result) {
    try {
      result = await lookupPhoton(lat, lng);
      upstreamReachable = true;
    } catch {
      // Photon failed too — handled below.
    }
  }

  if (result) {
    writeCache(key, result);
    return result;
  }
  if (upstreamReachable) {
    return { ...EMPTY_RESULT };
  }
  throw upstreamError('Nominatim/Photon');
}

module.exports = {
  reverseGeocode,
  // Exported for focused unit checks (no network, no cache side effects).
  buildPlaceNameFromNominatim,
  buildPlaceNameFromPhoton,
  buildDisplayNameFromNominatim,
  buildDisplayNameFromPhoton,
  cacheKey,
};
