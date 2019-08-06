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
        let cb = this.callback;

        nt.read(file, (err, torrent) => {
          if (err) throw err;
          let hasher = torrent.hashCheck(folder);

          hasher.on('matcherror', (i, file) => {
            throw Error('Could not match file ' + file);
          });

          let percent;
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
