# node-torrent

Read, make, and hash check torrents with node.js!

[![Build Status](https://secure.travis-ci.org/fent/node-torrent.svg)](http://travis-ci.org/fent/node-torrent)
![Depfu](https://img.shields.io/depfu/fent/node-torrent)
[![codecov](https://codecov.io/gh/fent/node-torrent/branch/master/graph/badge.svg)](https://codecov.io/gh/fent/node-torrent)

# Usage

## Read a torrent

```javascript
const nt = require('nt');

nt.read('path/to/file.torrent', (err, torrent) => {
  if (err) throw err;
  console.log('Info hash:', torrent.infoHash());
});
```

## Make a torrent

```javascript
let rs = nt.make('http://myannounce.net/url', __dirname + '/files');
rs.pipe(fs.createWriteStream('mytorrent.torrent'));

// callback style
nt.makeWrite('outputfile', 'http://announce.me', __dirname + '/files',
  ['somefile.ext', 'another.one', 'inside/afolder.mkv', 'afolder'],
  (err, torrent) => {
    if (err) throw err;
    console.log('Finished writing torrent!');
  });
```

## Hash check a torrent

```js
let hasher = torrent.hashCheck(file);

let p;
hasher.on('match', (i, hash, percent) => {
  p = percent;
});

hasher.on('end', () => {
  console.log('Hash Check:', p + '%', 'matched');
});
```


# API

### read(file, callback(Error, Torrent))

Reads a local file, or a readable stream. Returns readable stream.

An error can be returned if the torrent is formatted incorrectly. Does not check if the dictonaries are listed alphabetically. Refer to the [BitTorrent Specification](http://wiki.theory.org/BitTorrentSpecification) for more info on torrent metainfo.

### make(announceURL, dir, [files], [options], [callback(Error, Torrent)])

Makes a new torrent. `dir` is root directory of the torrent. The `files` array will relatively read files from there. If files is omitted, it implicitly adds all of the files in `dir` to the torrent, including those in subdirectories. `options` can have the following:

* `announceList` - An array of arrays of additional announce URLs.
* `comment`
* `name` - Can be used only in multi file mode. If not given, defaults to name of directory.
* `pieceLength` - How to break up the pieces. Must be an integer `n` that says piece length will be `2^n`. Default is 256KB, or 2^18.
* `private` - Set true if this is a private torrent.
* `moreInfo` - These go into the `info` dictionary of the torrent. Useful if you want to make a torrent have a unique info hash from a certain tracker.
* `maxFiles` - Max files to open during piece hashing. Defaults to 250.

`callback` is called with a possible `Error`, and a `Torrent` object when hashing is finished.

`make` returns a Hasher object that emits raw bencoded `data` events.

### makeWrite(output, annlounce, dir, [files], [options], [callback(Error, Torrent)])

A shortcut that pumps the returned readable stream from `make` into a writable stream that points to the file `output`. Returns a Hasher object.


## Torrent

The `read` and `make` functions all call their callback with a Torrent object.

### Torrent#metadata

Contains metadata of the torrent. Example:

```js
{
  announce: 'udp://tracker.publicbt.com:80',
  'announce-list': [
    [ 'udp://tracker.publicbt.com:80' ],
    [ 'udp://tracker.ccc.de:80' ],
    [ 'udp://tracker.openbittorrent.com:80' ],
    [ 'http://tracker.thepiratebay.org/announce' ]
  ],
  comment: 'Torrent downloaded from http://thepiratebay.org',
  'creation date': 1303979726,
  info: { length: 718583808,
    name: 'ubuntu-11.04-desktop-i386.iso',
    'piece length': 524288,
    pieces: <Buffer e5 7a ...>
  }
}
```

### Torrent#infoHash()

Get a torrent's info hash.

### Torrent#createReadStream()

Creates a ReadableStream that emits raw bencoded data for this torrent. Returns the readable stream.

### Torrent#createWriteStream(filepath)

Shortcut that pipes the stream from `Torrent#createReadStream()` to a writable file stream. Returns the writable stream.

### Torrent#hashCheck(dir, [options])

Hash checks torrent against files in `dir`. Returns a Hasher object. `options` hash can have `maxFiles` to open during hashing. Defaults to `250`. Returns a Hasher object.


## Hasher

A Hasher object is returned when a torrent is created with `make` and when `Torrent#hashCheck` is called. It inherits from ReadableStream.

### Hasher#pause()

Pause hash checking.

### Hasher#resume()

Resumes hash checking.

### Hasher#toggle()

Continues hashing if paused or pauses if not.

### Hasher#destroy()

Stops hashing completely. Closes file descriptors and does not emit any more events.

### Event: 'ready'

Finished examining files to be hashed and ready to start hashing their contents.

### Event: 'data'
* `Buffer` - data

Emits raw bencoded torrent data only when hasher is returned from the `make` function.

### 'progress'
* `number` - percent
* `number` - speed
* `number` - avgSpeed

Emits the progress calculated by amount of bytes read from files. `speed` and `avgSpeed` are in bytes.

### 'hash'
* `number` - index
* `string` - hash
* `string` - file
* `number` - position
* `number` - length

Emitted when a piece is hashed along with hash position and source.

### 'match'
* `number` - index
* `string` - hash
* `number` - percentMatched
* `string` - file
* `number` - position
* `number` - length

Emitted when a piece matches with its `index`, the piece, and the percentage of pieces matched so far.

### 'matcherror'
* `number` - index
* `string` - file
* `number` - position
* `number` - length

Emitted when a piece does not match.

### 'error'
* `Error` - err

Error hash checking.

### 'end'

Hash checking is finished.


# Install

    npm install nt


# Tests
Tests are written with [vows](http://vowsjs.org/)

```bash
npm test
```
