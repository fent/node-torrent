import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'chai';
import * as nt from '../src';
import type Torrent from '../src/torrent';

const file1 = path.join(__dirname, 'torrents', 'ubuntu.torrent');
const output1 = path.join(__dirname, 'result', 'new.torrent');
const output2 = path.join(__dirname, 'result', 'ubuntu.copy.torrent');
const tracker = 'http://faketracker.com';
const folder = path.join(__dirname, 'files');
const files = ['click.jpg'];
const options = { pieceLength: 18 /* 256 KB */, private: true };

describe('Make', () => {
  describe('Make a torrent file', () => {
    let torrent!: Torrent;

    before((done) => {
      nt.make(tracker, folder, files, options, (err, result) => {
        if (err || !result) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash matches torrent previously made by mktorrent', () => {
      expect(torrent.infoHash()).to.equal(
        '2fff646b166f37f4fd131778123b25a01639e0b3',
      );
    });
  });

  describe('Make a torrent file with folder, files, and pipe to read', () => {
    let torrent!: Torrent;

    before((done) => {
      const rs = nt.make(tracker, folder, ['.']);
      rs.on('error', done);

      nt.read(rs, (err, result) => {
        if (err || !result) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash matches', () => {
      expect(torrent.infoHash()).to.equal(
        'c4397e42eb43c9801017a709eb7bce5e3b27aaf9',
      );
    });
  });

  describe('Make and write a torrent file with just the folder', () => {
    let torrent!: Torrent;

    before((done) => {
      const rs = nt.makeWrite(output1, tracker, folder);
      rs.on('error', done);

      nt.read(rs, (err, result) => {
        if (err || !result) return done(err);
        torrent = result;

        // Clean up the created file
        fs.unlink(output1, () => {
          done();
        });
      });
    });

    it('Info hash matches', () => {
      expect(torrent.infoHash()).to.equal(
        'c4397e42eb43c9801017a709eb7bce5e3b27aaf9',
      );
    });
  });

  describe('Read', () => {
    let torrent!: Torrent;

    before((done) => {
      nt.read(file1, (err, result) => {
        if (err || !result) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash from read file matches', () => {
      expect(torrent.metadata).to.be.an('object');
      expect(torrent.infoHash()).to.equal(
        'a38d02c287893842a32825aa866e00828a318f07',
      );
    });

    describe('then write new torrent file', () => {
      let writtenTorrent!: Torrent;

      before((done) => {
        const ws = torrent.createWriteStream(output2);
        ws.on('error', done);

        ws.on('close', () => {
          nt.read(output2, (err, result) => {
            if (err || !result) return done(err);
            writtenTorrent = result;

            // Clean up the created file
            fs.unlink(output2, () => {
              done();
            });
          });
        });
      });

      it('Info hash from read file matches', () => {
        expect(writtenTorrent.metadata).to.be.an('object');
        expect(writtenTorrent.infoHash()).to.equal(
          'a38d02c287893842a32825aa866e00828a318f07',
        );
      });
    });
  });

  describe('Arguments and options handling', () => {
    it('Supports callback as 3rd argument', (done) => {
      nt.make(tracker, folder, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent).to.be.an('object');
        done();
      });
    });

    it('Supports options as 3rd argument with callback as 4th', (done) => {
      nt.make(tracker, folder, { comment: 'test comment' }, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.comment).to.equal('test comment');
        done();
      });
    });

    it('Supports options as 3rd argument without callback', () => {
      const rs = nt.make(tracker, folder, { comment: 'no cb' });
      expect(rs).to.be.an('object');
    });

    it('Supports files as 3rd argument with callback as 4th', (done) => {
      nt.make(tracker, folder, files, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent).to.be.an('object');
        done();
      });
    });

    it('Supports string file as 3rd argument', (done) => {
      nt.make(tracker, folder, 'click.jpg', (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent).to.be.an('object');
        done();
      });
    });

    it('Supports undefined file', (done) => {
      nt.make(tracker, folder, undefined, {}, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent).to.be.an('object');
        done();
      });
    });

    it('Supports omitting callback and options', () => {
      const rs = nt.make(tracker, folder, files);
      expect(rs).to.be.an('object');
    });

    it('Errors on invalid tracker URL', (done) => {
      nt.make('not-a-url', folder, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Not a URL');
        done();
      });
    });

    it('Errors when files array is empty', (done) => {
      nt.make(tracker, folder, [], (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal('no files given');
        done();
      });
    });

    it('Errors when announceList is invalid', (done) => {
      nt.make(
        tracker,
        folder,
        files,
        { announceList: 'bad' as unknown as Array<Array<string | Buffer>> },
        (err) => {
          expect(err).to.be.an('error');
          expect(err?.message).to.equal('`announce-list` is not a list');
          done();
        },
      );
    });

    it('Supports valid announceList', (done) => {
      const list = [[Buffer.from('http://tracker1.com')]];
      nt.make(
        tracker,
        folder,
        files,
        { announceList: list },
        (err, torrent) => {
          expect(err).to.be.null;
          expect(torrent?.metadata['announce-list']).to.deep.equal(list);
          done();
        },
      );
    });

    it('Supports multimode, custom name, and moreInfo', (done) => {
      const opts = {
        multimode: true,
        name: 'custom-package',
        moreInfo: {
          extraField: 'hello',
          name: 'cannot-override',
        },
      };
      nt.make(tracker, folder, files, opts, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('custom-package');
        expect(torrent?.metadata.info.extraField).to.equal('hello');
        expect(torrent?.metadata.info.files).to.be.an('array');
        done();
      });
    });

    it('Passes through hasher errors to callback', (done) => {
      nt.make(tracker, '/path/that/does/not/exist', files, (err) => {
        expect(err).to.be.an('error');
        done();
      });
    });
  });
});
