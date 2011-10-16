var   nt = require('../lib/torrent'),
    vows = require('vows'),

  assert = require('assert'),
    path = require('path'),
      fs = require('fs');


var file = __dirname + '/torrents/files.torrent',
  folder = __dirname + '/files';

vows.describe('Hash Check')
  .addBatch({
    'Read a torrent and hash check it': {
      topic: function() {
        var cb = this.callback;

        nt.readFile(file, function(err, result) {
          if (err) throw err;
          nt.hashCheck(result, folder, function(err, emitter) {
            if (err) throw err;

            emitter.on('matcherror', function(err) {
              throw err;
            });

            var percent;
            emitter.on('match', function(index, hash, percentMatched) {
              percent = percentMatched;
            });

            emitter.on('end', function() {
              cb(null, percent);
            });
          });
        });
      },

      '100% match': function(err, percent) {
        assert.equal(percent, 100);
      }
    }
  })
  .export(module);
