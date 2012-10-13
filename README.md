# node-torrent [![Build Status](https://secure.travis-ci.org/fent/node-torrent.png)](http://travis-ci.org/fent/node-torrent)

Read, make, and hash check torrents with node.js!

# Usage

## Read a torrent

```javascript
var nt = require('nt');

nt.read('path/to/file.torrent', function(err, torrent) {
  if (err) throw err;
  console.log('Info hash:', torrent.infoHash());
});


// if url is given, it will be downloaded
nt.read('http://torrents.me/download.php?id=2342', function(err, torrent) {
  if (err) throw err;
  console.log(torrent.metadata);
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
var hasher = nt.hashCheck(file);

var p;
hasher.on('match', function(i, hash, percent) {
  p = percent;
});

hasher.on('end', function() {
  console.log('Hash Check:', p + '%', 'matched');
});
```


# API

### read(file, [requestOptions], callback(err, Torrent))

Reads a local file, remote file, or a readable stream. If `file` is a URL, it will be downloaded. `requestOptions` is optional, and can be used to customize the http request made by [request](https://github.com/mikeal/request). Returns readable stream.

### readURL(url, [requestOptions], callback(err, Torrent))

Downloads a torrent from a URL. `requestOptions` optionally can be used to customize the request. Returns readable stream.

### readFile(file, callback(err, Torrent))

Reads a torrent file. Returns readable stream.

### readStream(readstream, callback(err, Torrent))

Reads torrent data from a readable stream. Returns the readable stream.

### readRaw(data, callback(err, Torrent))

Parses raw torrent data. `data` must be a buffer.

An error can be returned if the torrent is formatted incorrectly. Does not check if the dictonaries are listed alphabetically. Refer to the [BitTorrent Specification](http://wiki.theory.org/BitTorrentSpecification) for more info on torrent metainfo.

### make(announceURL, dir, [files], [options], [callback(err, Torrent)])

Makes a new torrent. `dir` is root directory of the torrent. The `files` array will relatively read files from there. If files is omitted, it implicitly adds all of the files in `dir` to the torrent, including those in subdirectories. `options` can have the following:

* `announceList` - An array of arrays of additional announce URLs.
* `comment`
* `name` - Can be used only in multi file mode. If not given, defaults to name of directory.
* `pieceLength` - How to break up the pieces. Must be an integer `n` that says piece length will be `2^n`. Default is 256KB, or 2^18.
* `private` - Set true if this is a private torrent.
* `source` - This goes into the `info` dictionary of the torrent. Useful if you want to make a torrent have a unique info hash from a certain tracker.
* `maxFiles` - Max files to open during piece hashing. Defaults to 250.

`callback` is called with a possible `err`, and a `Torrent` object when hashing is finished.

`make` returns a Hasher object that emits raw bencoded `data` events.

### makeWrite(output, annlounce, dir, [files], [options], [callback(err, torrent)])

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

Shortcut that pipes the stream from `Torrent#createReadStream()` to a WritableStream. Returns the readable stream.

### Torrent#hashCheck(dir, [options])

Hash checks torrent against files in `dir`. Returns a Hasher object. `options` hash can have `maxFiles` to open during hashing. Defaults to `250`. Returns a Hasher object.


## Hasher

A Hasher object is returned when a torrent is created with `make` and when a torrent is hash checked with `hashCheck` or `Torrent#hashCheck`. It inherits from ReadableStream.

### Hasher#pause()

Pause hash checking.

### Hasher#resume()

Resumes hash checking.

### Hasher#toggle()

Continues hashing if paused or pauses if not

### Hasher#destroy()

Stops hashing completely. Closes file descriptors and does not emit any more events.

### Events:

* 'ready' `function () { }`

Finished examining files to be hashed and ready to start hashing their contents.

* 'data', `function (data) { }`

Emits raw bencoded torrent data only when hasher is returned from the `make` function.

* 'progress' `function (percent, speed, avgSpeed) { }`

Emits the progress calculated by amount of bytes read from files. `speed` and `avgSpeed` are in bytes.

* 'hash' `function (index, hash, file, position, length) { }`

Emitted when a piece is hashed along with hash position and source.

* 'match' `function (index, hash, percentMatched, file, position, length) { }`

Emitted when a piece matches with its `index`, the piece, and the percentage of pieces matched so far.

* 'matcherror' `function (index, file, position, length) { }`

Emitted when a piece does not match.

* 'error' `function (err) { }`

Error hash checking.

* 'end' `function () { }`

Hash checking is finished.


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
