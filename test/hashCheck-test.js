const nt     = require('..');
const vows   = require('vows');
const assert = require('assert');
const path   = require('path');


const file = path.join(__dirname, 'torrents', 'files.torrent');
const folder = path.join(__dirname, 'files');


vows.describe('Hash Check')
  .addBatch({
    'Read a torrent and hash check it': {
      topic: function() {
        var cb = this.callback;

        nt.read(file, (err, torrent) => {
          if (err) throw err;
          var hasher = torrent.hashCheck(folder);

          hasher.on('matcherror', (i, file) => {
            throw new Error('Could not match file ' + file);
          });

          var percent;
          hasher.on('match', (index, hash, percentMatched) => {
            percent = percentMatched;
          });

          hasher.on('end', () => {
            cb(null, percent);
          });
        });
      },

      '100% match': (percent) => {
        assert.equal(percent, 100);
      }
    }
  })
  .export(module);
