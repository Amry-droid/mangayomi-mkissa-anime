# Mkissa anime extension for Mangayomi

This repository contains a Mangayomi JavaScript **anime** source for
[Mkissa](https://mkissa.to).

## Install

Add this repository URL in Mangayomi:

```text
https://raw.githubusercontent.com/Amry-droid/mangayomi-mkissa-anime/main/index.json
```

Refresh the extension list, open the Anime extensions section, and install
**Mkissa**.

## Features

- Popular, latest, and search pages
- Complete episode lists, including long-running shows
- Real Mkissa upload dates for every episode where Mkissa supplies them
- Sub, dub, and raw episode availability with a preferred-audio setting
- Mkissa's encrypted rotating stream handshake
- Mangayomi extractors for MP4Upload, OK.ru, FileMoon, StreamWish, Dood,
  Streamlare, and Gogo-style hosts
- Built-in MP4Upload and OK.ru fallbacks verified against real media bytes

## Updates

- `0.0.2`: Fixes playback when Mangayomi's built-in MP4Upload or OK.ru
  extractor returns an empty result for Mkissa's current embeds.

## Validation

```sh
python3 build_index.py Amry-droid
node check_source.cjs
```

The live check validates catalog/search, a current 12-episode title, all
episodes and dates for a 1,000+ episode title, AES-GCM compatibility, Mkissa's
encrypted stream handshake, and server routing.

## Credits

The pure-JavaScript crypto and Mkissa stream-protocol implementation is adapted
from [xdfkenny/Sora-Modules](https://github.com/xdfkenny/Sora-Modules), used
under its MIT License.

This unofficial interoperability extension is not affiliated with Mkissa or
Mangayomi. Website/API changes may require an extension update.
