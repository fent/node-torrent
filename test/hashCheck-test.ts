import path from 'node:path';
import { expect } from 'chai';
import * as nt from '../src';

describe('Hash Check', () => {
  describe('Read a torrent and hash check it', () => {
    const file = path.join(__dirname, 'torrents', 'files.torrent');
    const folder = path.join(__dirname, 'files');

    let percent: number;

    before((done) => {
      nt.read(file, (err, torrent) => {
        if (err || !torrent) return done(err);

        const hasher = torrent.hashCheck(folder);

        hasher.on('matcherror', (_i, _file) => {
          hasher.on('matcherror', (_i, errFile) => {
            done(new Error(`Could not match file ${errFile}`));
          });
        });

        hasher.on('match', (_index, _hash, percentMatched) => {
          percent = percentMatched;
        });

        hasher.on('end', () => {
          done();
        });

        hasher.on('error', done);
      });
    });

    it('100% match', () => {
      expect(percent).to.equal(100);
    });
  });

  describe('Read a non-alphabetical torrent and hash check it', () => {
    const file = path.join(__dirname, 'torrents', 'files-reverse.torrent');
    const folder = path.join(__dirname, 'files');

    let percent: number;

    before((done) => {
      nt.read(file, (err, torrent) => {
        if (err || !torrent) return done(err);

        const hasher = torrent.hashCheck(folder);

        hasher.on('matcherror', (_i, _file) => {
          hasher.on('matcherror', (_i, errFile) => {
            done(new Error(`Could not match file ${errFile}`));
          });
        });

        hasher.on('match', (_index, _hash, percentMatched) => {
          percent = percentMatched;
        });

        hasher.on('end', () => {
          done();
        });

        hasher.on('error', done);
      });
    });

    it('100% match', () => {
      expect(percent).to.equal(100);
    });
  });

  describe('Read a single-file torrent and hash check with options', () => {
    const singleFile = path.join(__dirname, 'torrents', 'click.jpg.torrent');
    const folder = path.join(__dirname, 'files');
    let percent: number;

    before((done) => {
      nt.read(singleFile, (err, torrent) => {
        if (err || !torrent) return done(err);
        const hasher = torrent.hashCheck(folder, { maxFiles: 1 });
        hasher.on('match', (_idx, _h, p) => {
          percent = p;
        });
        hasher.on('end', done);
        hasher.on('error', done);
      });
    });

    it('100% match', () => {
      expect(percent).to.equal(100);
    });
  });

  describe('Read a torrent with hash mismatch', () => {
    const singleFile = path.join(__dirname, 'torrents', 'click.jpg.torrent');
    const folder = path.join(__dirname, 'files');
    let matchErrorEmitted = false;

    before((done) => {
      nt.read(singleFile, (err, torrent) => {
        if (err || !torrent) return done(err);
        // Corrupt the piece hashes
        const pieces = torrent.metadata.info.pieces as Buffer;
        torrent.metadata.info.pieces = Buffer.alloc(pieces.length);
        const hasher = torrent.hashCheck(folder);
        hasher.on('matcherror', () => {
          matchErrorEmitted = true;
        });
        hasher.on('end', done);
      });
    });

    it('Emits matcherror', () => {
      expect(matchErrorEmitted).to.be.true;
    });
  });

  describe('Path traversal attempt in hashCheck', () => {
    it('Emits error when task attempts to read outside base directory', (done) => {
      const folder = path.join(__dirname, 'files');
      const maliciousTorrent = new nt.Torrent({
        info: {
          name: 'safe_name',
          'piece length': 262144,
          pieces: Buffer.alloc(20),
          files: [{ length: 10, path: ['..', 'secret.txt'] }],
        },
      });
      const hasher = maliciousTorrent.hashCheck(folder);
      hasher.on('error', (err: Error) => {
        expect(err.message).to.contain('Path traversal detected');
        done();
      });
    });
  });
});
