#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class MProvider {
  constructor() {
    this.source = {
      baseUrl: 'https://mkissa.to',
      apiUrl: 'https://api.mkissa.net/api'
    };
  }
}

class Client {
  constructor(options) {
    this.options = options || {};
  }

  async request(url, options) {
    const controller = new AbortController();
    const seconds = Number(this.options.timeout || 20);
    const timer = setTimeout(() => controller.abort(), Math.max(1, seconds) * 1000);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async get(url, headers) {
    const response = await this.request(url, { headers: headers || {} });
    return {
      statusCode: response.status,
      body: await response.text()
    };
  }

  async post(url, headers, payload) {
    const response = await this.request(url, {
      method: 'POST',
      headers: headers || {},
      body: typeof payload === 'string' ? payload : JSON.stringify(payload)
    });
    return {
      statusCode: response.status,
      body: await response.text()
    };
  }
}

class SharedPreferences {
  get() { return '0'; }
}

const sourcePath = path.join(__dirname, 'mkissa.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  RegExp,
  Error,
  Promise,
  Uint8Array,
  Uint32Array,
  Int32Array,
  DataView,
  ArrayBuffer,
  Map,
  Set,
  TextEncoder,
  TextDecoder,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isNaN,
  MProvider,
  Client,
  SharedPreferences,
  // Mirror the current bridge regression: these host extractors may exist but
  // return an empty list. Mkissa must still resolve a playable URL itself.
  mp4UploadExtractor: async () => [],
  okruExtractor: async () => [],
  filemoonExtractor: async () => [],
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(source + [
  '',
  'globalThis.__MkissaExtension = DefaultExtension;',
  'globalThis.__aaGetEpisodeParsed = aaGetEpisodeParsed;',
  'globalThis.__aaRaceSuccess = aaRaceSuccess;',
  'globalThis.__aaGcmSeal = aaGcmSeal;',
  'globalThis.__aaGcmOpen = aaGcmOpen;',
  'globalThis.__aaHexToBytes = aaHexToBytes;',
  'globalThis.__aaAscii = aaAscii;',
  'globalThis.__aaUtf8ToStr = aaUtf8ToStr;'
].join('\n'), context, { filename: sourcePath });

async function probePlayback(videos) {
  for (const video of videos) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(video.url, {
        headers: Object.assign({}, video.headers || {}, { Range: 'bytes=0-1023' }),
        signal: controller.signal
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || '';
      const textHead = bytes.subarray(0, 64).toString('utf8');
      const isHls = textHead.includes('#EXTM3U');
      const isMedia = bytes.length > 16 && !/^\s*<(?:!doctype|html)/i.test(textHead);
      if (response.ok && (isHls || isMedia)) {
        return {
          quality: video.quality,
          status: response.status,
          contentType,
          bytes: bytes.length,
          kind: isHls ? 'hls' : 'media'
        };
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function main() {
  const Extension = context.__MkissaExtension;
  const extension = new Extension();
  assert.equal(extension.client.options.useDartHttpClient, true,
    'Mangayomi requests should use the iOS-safe Dart HTTP client');

  const raced = await context.__aaRaceSuccess([
    Promise.resolve({
      streams: [{
        url: 'https://media.invalid/first.m3u8',
        originalUrl: 'https://media.invalid/first.m3u8',
        quality: 'First success'
      }],
      subtitle: ''
    }),
    new Promise(() => {})
  ]);
  assert.equal(raced.streams.length, 1,
    'the first working host should return without waiting for a stalled host');

  const liveClient = extension.client;
  const failoverAttempts = [];
  extension.client = {
    async post(url) {
      failoverAttempts.push(url);
      if (/api\.mkissa\.net/i.test(url)) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            data: { shows: null },
            errors: [{ message: 'Too many requests' }]
          })
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          data: {
            shows: {
              edges: [{
                _id: 'failover-test',
                name: 'Fallback Title',
                englishName: 'Fallback Title',
                thumbnail: 'https://example.invalid/cover.jpg'
              }],
              pageInfo: { total: 1, hasNextPage: false }
            }
          }
        })
      };
    }
  };
  const failoverSearch = await extension.search('Fallback Title', 1, []);
  assert.equal(failoverAttempts.length, 2,
    'search should fail over when the first API host returns null data');
  assert.equal(failoverSearch.list[0].name, 'Fallback Title',
    'search should use results from the fallback API host');
  extension.client = liveClient;

  const popular = await extension.getPopular(1);
  assert(popular.list.length >= 10, 'popular list should contain anime');
  assert(popular.list.every((item) => item.link.includes('/anime/')),
    'popular links should be valid Mkissa anime links');

  const search = await extension.search('One Piece', 1, []);
  assert(search.list.some((item) => /one piece/i.test(item.name)),
    'search should find One Piece');
  assert(/one piece/i.test(search.list[0].name),
    'exact title match should be ranked first');

  await new Promise((resolve) => setTimeout(resolve, 2500));
  const alternateSearch = await extension.search('Boku no Hero Academia', 1, []);
  assert(alternateSearch.list.some((item) =>
    /my hero academia|boku no hero academia/i.test(item.name)),
  'search should find anime by a common alternate title');

  const current = await extension.getDetail(
    'https://mkissa.to/anime/cDLX8Rte8LBSNTZno'
  );
  assert.equal(current.chapters.length, 12, 'current test show should have 12 episodes');
  assert(current.chapters.every((chapter) => /^\d{13}$/.test(chapter.dateUpload)),
    'all current test-show episodes should have real upload dates');

  const onePiece = await extension.getDetail(
    'https://mkissa.to/anime/ReooPAxPMsHM4KPMY'
  );
  assert(onePiece.chapters.length > 1000,
    'long-running show should return its complete episode list');
  const dated = onePiece.chapters.filter((chapter) => /^\d{13}$/.test(chapter.dateUpload));
  assert.equal(dated.length, onePiece.chapters.length,
    'every One Piece episode returned by Mkissa should have a date');

  const parsed = await context.__aaGetEpisodeParsed(
    'cDLX8Rte8LBSNTZno', '1', 'sub'
  );
  const sources = parsed && parsed.episode && parsed.episode.sourceUrls;
  assert(Array.isArray(sources) && sources.length > 0,
    'encrypted episode handshake should return stream sources');
  console.log('Live source inventory:', sources.map((item) => {
    var sourceUrl = item && item.sourceUrl || '';
    var host = sourceUrl.indexOf('--') === 0 ? 'clock' : '';
    try { if (!host) host = new URL(sourceUrl).host; } catch (_) {}
    return { name: item && item.sourceName, host };
  }));
  const supportedSource = sources.find((item) =>
    item && /ok\.ru/i.test(item.sourceUrl || '')
  ) || sources.find((item) =>
    item && /mp4upload|bysekoze|filemoon/i.test(item.sourceUrl || '')
  );
  assert(supportedSource, 'live response should contain a Mangayomi-supported host');
  const routedVideos = await extension.extractedVideos(supportedSource, 'sub');
  assert(routedVideos.length > 0,
    'live server should resolve even when Mangayomi built-in extractors return empty');
  const okSource = sources.find((item) => item && /ok\.ru/i.test(item.sourceUrl || ''));
  assert(okSource, 'live response should contain an OK.ru fallback');
  const okVideos = await extension.extractedVideos(okSource, 'sub');
  const okPlaybackProof = await probePlayback(okVideos);
  assert(okPlaybackProof && okPlaybackProof.kind === 'hls',
    'OK.ru fallback should return a live HLS playlist');

  const liveVideos = await extension.getVideoList(
    'https://mkissa.to/anime/cDLX8Rte8LBSNTZno/1?types=sub'
  );
  assert(liveVideos.length > 0, 'getVideoList should return live stream URLs');
  assert(liveVideos.every((video) => /^https?:\/\//.test(video.url || '')),
    'every returned video should have an absolute URL');

  const playbackProof = await probePlayback(liveVideos);
  assert(playbackProof, 'at least one returned stream must serve real media bytes');

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const onePieceEpisodeOne = onePiece.chapters[onePiece.chapters.length - 1];
  assert(onePieceEpisodeOne && /\/1(?:\?|$)/.test(onePieceEpisodeOne.url),
    'long-running show should include episode 1');
  const onePieceVideos = await extension.getVideoList(onePieceEpisodeOne.url);
  const onePiecePlaybackProof = await probePlayback(onePieceVideos);
  assert(onePiecePlaybackProof,
    'a second anime should also resolve to real media bytes');

  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const plain = Buffer.from('Mangayomi Mkissa AES-GCM validation');
  const sealed = context.__aaGcmSeal(
    new Uint8Array(key),
    new Uint8Array(iv),
    new Uint8Array(plain)
  );
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const expected = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  assert.deepEqual(Buffer.from(sealed.out), expected, 'AES-GCM ciphertext should match Node');
  assert.deepEqual(Buffer.from(sealed.tag), tag, 'AES-GCM tag should match Node');
  const opened = context.__aaGcmOpen(
    new Uint8Array(key),
    new Uint8Array(iv),
    new Uint8Array(expected),
    new Uint8Array(tag)
  );
  assert.equal(Buffer.from(opened).toString('utf8'), plain.toString('utf8'),
    'AES-GCM decrypt should recover plaintext');

  console.log(JSON.stringify({
    popular: popular.list.length,
    apiFailoverAttempts: failoverAttempts.length,
    search: search.list.length,
    alternateSearch: alternateSearch.list.length,
    currentEpisodes: current.chapters.length,
    onePieceEpisodes: onePiece.chapters.length,
    datedOnePieceEpisodes: dated.length,
    streamSources: sources.length,
    routedStreams: routedVideos.length,
    liveVideos: liveVideos.length,
    playbackProof,
    okPlaybackProof,
    onePieceLiveVideos: onePieceVideos.length,
    onePiecePlaybackProof
  }, null, 2));
  console.log('Mkissa source: catalog, full dates, crypto, and streams passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
