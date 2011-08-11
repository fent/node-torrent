Usage
------------------
### Read a torrent file
    var torrent = require('torrent');
    torrent.read('path/to/file.torrent', function(err, rawdata, result) {
      console.log(result);
    });


Install
------------

    npm install rtorrent

