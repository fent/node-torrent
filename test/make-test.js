var   nt = require('..'),
    vows = require('vows'),

  assert = require('assert'),
    path = require('path'),
      fs = require('fs');


var output = __dirname + '/result/new.torrent',
   tracker = 'http://faketracker.com',
    folder = __dirname + '/files',
     files = ['click.jpg'],
   options = {
     pieceLength: 18, // 256 KB
     private: true
   };


vows.describe('Make')
  .addBatch({
    'Make a torrent file': {
      topic: function() {
        nt.make(tracker, folder, files, options, this.callback);
      },

      'Info hash matches torrent previously made by mktorrent':
        function(torrent) {
          assert.equal(nt.getInfoHash(torrent),
              '2fff646b166f37f4fd131778123b25a01639e0b3');
        }
    },

    'Make a torrent file with folder, files, and pipe to read': {
      topic: function() {
        var rs = nt.make(tracker, folder, ['.']);

        var cb = this.callback;
        rs.on('error', cb);
        nt.readStream(rs, cb);
      },

      'Info hash matches': function(err, torrent) {
        assert.equal(nt.getInfoHash(torrent),
                     'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Make and write a torrent file with just the folder': {
      topic: function() {
        var rs = nt.makeWrite(output, tracker, folder);

        var cb = this.callback;
        rs.on('error', cb);

        rs.on('end', function() {
          nt.readFile(output, function(err, torrent) {
            fs.unlinkSync(output);
            cb(err, torrent);
          });
        });
      },

      'Info hash matches': function(torrent) {
        assert.equal(nt.getInfoHash(torrent),
                     'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    }
  })
  .export(module);
