var   nt = require('../lib/torrent'),
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


vows.describe('Write')
  .addBatch({
    'Make and write a torrent file': {
      topic: function() {
        var cb = this.callback;

        // delete file from previous test
        if (path.existsSync(output)) {
          fs.unlinkSync(output);
        }

        nt.write(output, tracker, folder, files, options,
          function(err, emitter, pieces, torrent) {
            if (err) return cb(err);

            emitter.on('error', function(err) {
              cb(err);
            });

            emitter.on('end', function() {
              cb(null, torrent);
            });
          });
      },

      'Info hash matches torrent made by mktorrent':
        function(err, torrent) {
          if (err) throw err;
          assert.equal(nt.getInfoHash(torrent),
              '2fff646b166f37f4fd131778123b25a01639e0b3');
        },

      'and read newly written file': {
        topic: function(torrent) {
          var cb = this.callback;

          nt.readFile(output, function(err, result) {
            cb(err, torrent, result);
          });
        },

        'To make sure that it matches': function(err, torrent, result) {
          if (err) throw err;
          assert.equal(nt.getInfoHash(torrent), nt.getInfoHash(result));
          assert.deepEqual(torrent, result);
        }
      }
    }
  })
  .export(module);
