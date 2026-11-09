import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import { expect } from 'chai';
import * as nt from '../src';
import type Torrent from '../src/torrent';

const file2 = path.join(__dirname, 'torrents', 'click.jpg.torrent');
const file4 = path.join(__dirname, 'torrents', 'chipcheezum.torrent');

describe('Read', () => {
  // This torrent was created with mktorrent.
  describe('Read a local file', () => {
    describe('made by mktorrent', () => {
      let torrent!: Torrent;

      before((done) => {
        nt.read(file2, (err, torrentData) => {
          if (err || !torrentData) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal(
          '2fff646b166f37f4fd131778123b25a01639e0b3',
        );
      });

      it('Announce URL is correct', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('announce');
        expect(torrent.metadata.announce).to.equal('http://hello.2u');
      });

      it('Single file mode', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('name');
        expect(torrent.metadata.info.name).to.equal('click.jpg');
        expect(torrent.metadata.info).to.not.have.property('files');
        expect(torrent.metadata.info).to.have.property('length');
        expect(torrent.metadata.info.length).to.equal(87582);
      });

      it('256 KB piece length', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('piece length');
        expect(torrent.metadata.info['piece length']).to.equal(262144);
      });

      it('Private torrent', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('private');
        expect(torrent.metadata.info.private).to.equal(1);
      });
    });

    describe('that holds a big video file', () => {
      let torrent!: Torrent;

      before((done) => {
        nt.read(file4, (err, torrentData) => {
          if (err || !torrentData) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal(
          'a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4',
        );
      });
    });

    describe('with validate = false', () => {
      it('Info hash matches', (done) => {
        nt.read(file2, false, (err, torrent) => {
          expect(err).to.be.null;
          expect(torrent).to.be.an('object');
          expect(torrent?.metadata).to.be.an('object');
          done();
        });
      });
    });

    describe('without callback', () => {
      it('Returns stream', () => {
        const rs = nt.read(file2);
        expect(rs).to.be.an('object');
      });
    });
  });

  describe('Read a stream', () => {
    describe('that holds a big video file', () => {
      let torrent!: Torrent;

      before((done) => {
        nt.read(fs.createReadStream(file4), (err, torrentData) => {
          if (err || !torrentData) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', () => {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal(
          'a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4',
        );
      });
    });

    describe('with invalid bencoded data', () => {
      it('Emits error and closes fd', (done) => {
        const rs = new stream.PassThrough() as stream.PassThrough & {
          fd?: number;
        };
        rs.fd = 999;
        const origClose = fs.close;
        let closedFd: number | null = null;
        (
          fs as unknown as { close: (fd: number, cb?: () => void) => void }
        ).close = (fd: number, cb?: () => void) => {
          closedFd = fd;
          if (cb) cb();
        };

        nt.read(rs, (err) => {
          (fs as unknown as { close: typeof fs.close }).close = origClose;
          expect(err).to.be.an('error');
          expect(closedFd).to.equal(999);
          done();
        });

        rs.write('not bencoded data!!!');
        rs.end();
      });

      it('Emits error when stream has no fd', (done) => {
        const rs = new stream.PassThrough();
        nt.read(rs, (err) => {
          expect(err).to.be.an('error');
          done();
        });
        rs.write('not bencoded data!!!');
        rs.end();
      });
    });
  });
});
