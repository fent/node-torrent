const nt = require('..');
const Torrent = require('../lib/torrent');
const { expect } = require('chai');
const path = require('path');

describe('Hash Check', function() {
  describe('Read a torrent and hash check it', function() {
    const file = path.join(__dirname, 'torrents', 'files.torrent');
    const folder = path.join(__dirname, 'files');

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

  describe('Read a non-alphabetical torrent and hash check it', function() {
    const file = path.join(__dirname, 'torrents', 'files-reverse.torrent');
    const folder = path.join(__dirname, 'files');

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

  describe('Path traversal attempt in hashCheck', function() {
    it('Emits error when task attempts to read outside base directory', function(done) {
      const folder = path.join(__dirname, 'files');
      const maliciousTorrent = new Torrent({
        info: {
          name: 'safe_name',
          'piece length': 262144,
          pieces: Buffer.alloc(20),
          files: [{ length: 10, path: ['..', 'secret.txt'] }]
        }
      });
      const hasher = maliciousTorrent.hashCheck(folder);
      hasher.on('error', (err) => {
        expect(err.message).to.contain('Path traversal detected');
        done();
      });
    });
  });
});

