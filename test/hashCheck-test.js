const nt = require('..');
const { expect } = require('chai');
const path = require('path');

const file = path.join(__dirname, 'torrents', 'files.torrent');
const folder = path.join(__dirname, 'files');

describe('Hash Check', function() {
  describe('Read a torrent and hash check it', function() {
    let percent;

    before(function(done) {
      nt.read(file, (err, torrent) => {
        if (err) return done(err);

        let hasher = torrent.hashCheck(folder);

        hasher.on('matcherror', (i, file) => {
          done(new Error('Could not match file ' + file));
        });

        hasher.on('match', (index, hash, percentMatched) => {
          percent = percentMatched;
        });

        hasher.on('end', () => {
          done();
        });

        hasher.on('error', done);
      });
    });

    it('100% match', function() {
      expect(percent).to.equal(100);
    });
  });
});

