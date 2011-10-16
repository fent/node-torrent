Install
------------

    npm install nt -g


Usage
------------------
To read a torrent
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

To write a torrent
```javascript
nt.write('outputfile', 'http://announce.me', __dirname + '/files',
  ['somefile.ext', 'another.one', 'inside/afolder.mkv', 'inside/etc'],
  function(err, emitter) {
    if (err) throw err;
    
    emitter.on('error', function(err) {
      throw err;
    });

    emitter.on('end', function() {
      console.log('Finished writing torrent!');
    });
  });
```


API
---
###read(file, [requestOptions], callback(err, torrent, buffer))
Reads a torrent file. If it's a URL, it will be downloaded. `requestOptions` is optional, and can be used to customize the request if `file` is downloaded.

###readURL(url, [requestOptions], callback(err, torrent, buffer))
Downloads a torrent from a URL. `requestOptions` optionally can be used to customize the request.

###readFile(file, callback(err, torrent, buffer))
Reads a torrent file.

###readRaw(data, callback(err, torrent, buffer))
Parses raw torrent data. `data` must be a buffer or binary encoded string.

All of the read functions will return a torrent object. Here is an example of one

```javascript
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

An error can be returned if the torrent is formatted incorrectly. Does not check if the dictonaries are listed alphabetically. Refer to the (BitTorrent Specification)[http://wiki.theory.org/BitTorrentSpecification] for more info on torrent metainfo.

###getInfoHash(torrent)
Returns the info hash of a torrent object. Useful in identifying torrents.

###edit(file, options, callback(err, output, torrent))

Edits a torrent file with given `options`. Faster than writing another file from scratch and recalculating all the pieces. `options` can have the following keys:

* `output` use this if you want to write to a new file
* `announce`
* `announceList` *
* `comment` *
* `name` can only be changed if torrent is multi file mode
* `private` *
* `source` *

`*` If false, will delete the key from the torrent.

###write(output, announceURL, dir, files, [options], callback(err, emitter, pieces, torrent)

Writes a new torrent file. `dir` is future root directory of the torrent. The `files` array will relatively read files from there. `options` can have the following:

* `announceList` - An array of arrays of additional announce URLs.
* `comment`
* `name` - Can be used only in multi file mode. If not given, defaults to name of directory.
* `pieceLength` - How to break up the pieces. Must be an integer `n` that says piece length will be `2^n`. Default is 256KB, or 2^18.
* `private` - Set true if this is a private torrent.
* `source` - This goes into the `info` dictionary of the torrent. Useful if you want to make a torrent have a unique info hash from a certain tracker.
* `maxFiles` - Max files to open during piece hashing. Defaults to 500.
* `maxMemory` - Max memory to allocate during piece hashing. Can be a string that matches `/((\d)+(\.\d+)?)(k|m|g|t)?b?/i` Defaults to 512MB.

`callback` is called with `pieces` that represents the total number of pieces the files will be spit into, and a `torrent` object without the `torrent.info.pieces` field calculated. `emitter` will emit the following events:

* 'percent' `function (percent) { }`
Whenever a piece is hashed, will emit a percentage that can be used to track progress.

* 'error' `function (err) { }`
If there is an error this will be emitted.

* 'end' `function (percentMatched) { }`
Called when torrent is finished writing.

###hashCheck(torrent, dir, [options], callback(err, emitter))

Use a torrent object to hash check a directory where its files should be. Options can have `maxMemory` and `maxFiles. Which default to 512 MB and 500 respectively. The `emitter` the `callback` is called with, emits the following:

* 'match' `function (index, hash, percentMatched, file, position, length) { }`
Emitted when a piece matches with its `index`, the piece, and the percentage of pieces matched so far.

* 'matcherror' `function (index, file, position, length) { }`
Emitted when a piece does not match.

* 'error' `function (err) { }`
Error hash checking. Most likely an IO error.

* 'end' `function () { }`
Hash checking is finished.


Command Line
------------
nt can be ran from the command line too!

    Usage: nt <action> [options] <files>...

    actions:
      make   - Make a torrent
      edit   - Read a torrent, edit its metainfo variables, and write it
               Can't change its files
      hash   - Returns info hash from a torrent
      check  - Hash checks torrent file
               If no folder is specified, will use cwd

    options:
      -a, --announce URL              Announce URL. At least one is required
      -c, --comment COMMENT           Add a comment to the metainfo
      -n, --name NAME                 Name of torrent
      -l, --piece-length INT          Set piece to 2^n bytes. Default: 256KB
      -p, --private                   Make this a private torrent
      -s, --source STR                Add source to metainfo
      -o, --output FILE               Where to write output file
      -f, --max-files INT             Max simultaneous files to open
      -m, --max-memory STR            Max amount of memory to allocate
      --folder FOLDER                 Folder to hash check
