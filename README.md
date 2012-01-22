# node-torrent [![Build Status](https://secure.travis-ci.org/fent/node-torrent.png)](http://travis-ci.org/fent/node-torrent)

Read, make, and hash check torrents with node.js!

# Usage

## Read a torrent

```javascript
var nt = require('nt');

nt.read('path/to/file.torrent', function(err, torrent) {
  if (err) throw err;
  console.log('Info hash:', nt.getInfoHash(torrent));
});


// if remote file is given, it will be downloaded
nt.read('http://torrents.me/download.php?id=2342', function(err, torrent) {
  if (err) throw err;
  console.log(torrent);
});
```

## Make a torrent

```javascript
var rs = nt.make('http://myannounce.net/url', __dirname + '/files');
rs.pipe(fs.createWriteStream('mytorrent.torrent'));

// callback style
nt.makeWrite('outputfile', 'http://announce.me', __dirname + '/files',
  ['somefile.ext', 'another.one', 'inside/afolder.mkv', 'afolder'],
  function(err, torrent) {
    if (err) throw err;
    console.log('Finished writing torrent!');
  });
```

## Hash check a torrent

```js
nt.read(file, function(err, torrent) {
  if (err) throw err;
  var hasher = nt.hashCheck(torrent, __dirname + '/files');

  var p;
  hahser.on('match', function(i, hash, percent) {
    p = percent;
  });

  hasher.on('end', function() {
    console.log('Hash Check:', p + '%', 'matched');
  });
});
```


# API

### read(file, [requestOptions], callback(err, torrent))
Reads a local file, remote file, or a readable stream. If `file` is a URL, it will be downloaded. `requestOptions` is optional, and can be used to customize the http request made by [request](https://github.com/mikeal/request). Returns readable stream.

### readURL(url, [requestOptions], callback(err, torrent))
Downloads a torrent from a URL. `requestOptions` optionally can be used to customize the request. Returns readable stream.

### readFile(file, callback(err, torrent))
Reads a torrent file. Returns readable stream.

### readStream(readstream, callback(err, torrent))
Reads torrent data from a readable stream. Returns the readable stream.

### readRaw(data, callback(err, torrent))
Parses raw torrent data. `data` must be a buffer.

All of the read functions will pass a torrent object to the callback such as the following

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

An error can be returned if the torrent is formatted incorrectly. Does not check if the dictonaries are listed alphabetically. Refer to the [BitTorrent Specification](http://wiki.theory.org/BitTorrentSpecification) for more info on torrent metainfo.

### getInfoHash(torrent)
Returns the info hash of a torrent object. Useful for identifying torrents.

```js
nt.read('some.torrent', function(err, torrent) {
  console.log('info hash:', nt.getInfoHash(torrent);
});
```

### make(announceURL, dir, [files], [options], [callback(err, torrent)])

Writes a new torrent file. `dir` is root directory of the torrent. The `files` array will relatively read files from there. If files is omitted, it implicitly adds all of the files in `dir` to the torrent. `options` can have the following:

* `announceList` - An array of arrays of additional announce URLs.
* `comment`
* `name` - Can be used only in multi file mode. If not given, defaults to name of directory.
* `pieceLength` - How to break up the pieces. Must be an integer `n` that says piece length will be `2^n`. Default is 256KB, or 2^18.
* `private` - Set true if this is a private torrent.
* `source` - This goes into the `info` dictionary of the torrent. Useful if you want to make a torrent have a unique info hash from a certain tracker.
* `maxFiles` - Max files to open during piece hashing. Defaults to 500.

`callback` is called with a possible `err`, and a `torrent` object when hashing is finished.

`make` returns a ReadableStream that also emits `error` events and has `.pause()` and `.resume()` like a regular readable stream. Here are all of the events it emits:

* 'data': `function (data) { }`
Bencoded raw torrent data that can be written to a file.

* 'progress' `function (percent, speed, avgSpeed) { }`
Whenever a piece is hashed, will emit a percentage that can be used to track progress. `speed` and `avgSpeed` are in bytes.

* 'error' `function (err) { }`
If there is an error this will be emitted. Most likely IO error.

* 'end' `function (torrent) { }`
Called when torrent is finished hashing.

### makeWrite(output, annlounce, dir, [files], [options], [callback(err, torrent)])

A shortcut that pumps the returned readable stream from `make` into a writable stream that points to the file `output`. Returns readable stream.

### edit(torrent, [options], [callback(err, torrent)])

Edits a torrent file with given `options`. Faster than rehashing all the pieces by calling `make` again. `torrent` can be a local/remote path, a readable stream, or a torrent object. Returns a readable stream that emits `data` events of raw bencoded torrent data. `options` can have the following keys:

* `announce`
* `announceList` *
* `comment` *
* `name` ** - Can only be changed if torrent is multi file mode
* `private` * **
* `source` * **

`*` If false, will delete the key from the torrent.

`**` If changed, will cause the torrent to have a different info hash.

### editWrite(output, torrent, [options], [callback(err, torrent)])

Shortcut that pumps the returned readable stream from `edit` into a writable stream that points to the file `output`. Returns readable stream.

### hashCheck(torrent, dir, [options])

Hash check a directory where a torrent's files should be. `torrent` must be a torrent object. Options can have `maxMemory` and `maxFiles`. Which default to 512 MB and 500 respectively.

It returns an event emitter that emits the following events:

* 'ready' `function () { }`
Emitter is ready to start hashing.

* 'progress' `function (percent, speed, avgSpeed) { }`
Emits the progress calculated by amount of bytes read from files. `speed` and `avgSpeed` are in bytes.

* 'hash' `function (index, hash, file, position, length) { }`
Emitted when a piece is hashed along with hash position and source.

* 'match' `function (index, hash, percentMatched, file, position, length) { }`
Emitted when a piece matches with its `index`, the piece, and the percentage of pieces matched so far.

* 'matcherror' `function (index, file, position, length) { }`
Emitted when a piece does not match.

* 'error' `function (err) { }`
Error hash checking. Most likely an IO error.

* 'end' `function () { }`
Hash checking is finished.

The emitter also has `pause()`, `resume()`, `destroy()` and `start()` functions. `start()` is automatically called when the emitter is ready.


# Command Line
nt can be ran from the command line too! Install it with the `-g` flag with npm and use it with the command `nt`.

![example img](http://i.imgur.com/y47Sc.png)


# Install

```bash
npm -g install nt
```


# Tests
Tests are written with [vows](http://vowsjs.org/)

```bash
npm test
```


# License

MIT
