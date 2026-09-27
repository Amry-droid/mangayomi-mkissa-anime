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
  async get(url, headers) {
    const response = await fetch(url, { headers: headers || {} });
    return {
      statusCode: response.status,
      body: await response.text()
    };
  }

  async post(url, headers, payload) {
    const response = await fetch(url, {
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
  mp4UploadExtractor: async (url) => [{
    url: 'https://media.invalid/mp4upload.mp4',
    originalUrl: url,
    quality: 'MP4Upload'
  }],
  okruExtractor: async (url) => [{
    url: 'https://media.invalid/okru.m3u8',
    originalUrl: url,
    quality: 'OK.ru'
  }],
  filemoonExtractor: async (url) => [{
    url: 'https://media.invalid/filemoon.m3u8',
    originalUrl: url,
    quality: 'FileMoon'
  }],
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(source + [
  '',
  'globalThis.__MkissaExtension = DefaultExtension;',
  'globalThis.__aaGetEpisodeParsed = aaGetEpisodeParsed;',
  'globalThis.__aaGcmSeal = aaGcmSeal;',
  'globalThis.__aaGcmOpen = aaGcmOpen;',
  'globalThis.__aaHexToBytes = aaHexToBytes;',
  'globalThis.__aaAscii = aaAscii;',
  'globalThis.__aaUtf8ToStr = aaUtf8ToStr;'
].join('\n'), context, { filename: sourcePath });

async function main() {
  const Extension = context.__MkissaExtension;
  const extension = new Extension();

  const popular = await extension.getPopular(1);
  assert(popular.list.length >= 10, 'popular list should contain anime');
  assert(popular.list.every((item) => item.link.includes('/anime/')),
    'popular links should be valid Mkissa anime links');

  const search = await extension.search('One Piece', 1, []);
  assert(search.list.some((item) => /one piece/i.test(item.name)),
    'search should find One Piece');

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
  const supportedSource = sources.find((item) =>
    item && /mp4upload|ok\.ru|bysekoze|filemoon/i.test(item.sourceUrl || '')
  );
  assert(supportedSource, 'live response should contain a Mangayomi-supported host');
  const routedVideos = await extension.extractedVideos(supportedSource, 'sub');
  assert(routedVideos.length > 0,
    'live server should be routed to Mangayomi built-in extractors');

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
    search: search.list.length,
    currentEpisodes: current.chapters.length,
    onePieceEpisodes: onePiece.chapters.length,
    datedOnePieceEpisodes: dated.length,
    streamSources: sources.length,
    routedStreams: routedVideos.length
  }, null, 2));
  console.log('Mkissa source: catalog, full dates, crypto, and streams passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
