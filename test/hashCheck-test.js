var nt     = require('..');
var vows   = require('vows');
var assert = require('assert');
var path   = require('path');


var file = path.join(__dirname, 'torrents', 'files.torrent');
var folder = path.join(__dirname, 'files');


vows.describe('Hash Check')
  .addBatch({
    'Read a torrent and hash check it': {
      topic: function() {
        var cb = this.callback;

        nt.read(file, function(err, torrent) {
          if (err) throw err;
          var hasher = torrent.hashCheck(folder);

          hasher.on('matcherror', function(i, file) {
            throw new Error('Could not match file ' + file);
          });

          var percent;
          hasher.on('match', function(index, hash, percentMatched) {
            percent = percentMatched;
          });

          hasher.on('end', function() {
            cb(null, percent);
          });
        });
      },

      '100% match': function(percent) {
        assert.equal(percent, 100);
      }
    }
  })
  .export(module);
