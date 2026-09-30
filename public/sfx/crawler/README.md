# The Crawler's screams

Put short scream clips here (1–3 seconds, `.ogg` or `.mp3`, with a licence that lets us use
them, e.g. CC0), and list their file names in `list.json` in this folder:

```json
["scream-1.ogg", "scream-2.ogg"]
```

The game picks one at random each time the Crawler screams (a little faster or slower each
time). Without `list.json` it uses a made-up screech (`public/js/mobs/crawler.js`).
