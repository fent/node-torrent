const nt = require('..');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

const file2 = path.join(__dirname, 'torrents', 'click.jpg.torrent');
const file4 = path.join(__dirname, 'torrents', 'chipcheezum.torrent');

describe('Read', function() {
  // This torrent was created with mktorrent.
  describe('Read a local file', function() {
    describe('made by mktorrent', function() {
      let torrent;

      before(function(done) {
        nt.read(file2, (err, torrentData) => {
          if (err) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal('2fff646b166f37f4fd131778123b25a01639e0b3');
      });

      it('Announce URL is correct', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('announce');
        expect(torrent.metadata.announce).to.equal('http://hello.2u');
      });

      it('Single file mode', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('name');
        expect(torrent.metadata.info.name).to.equal('click.jpg');
        expect(torrent.metadata.info).to.not.have.property('files');
        expect(torrent.metadata.info).to.have.property('length');
        expect(torrent.metadata.info.length).to.equal(87582);
      });

      it('256 KB piece length', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('piece length');
        expect(torrent.metadata.info['piece length']).to.equal(262144);
      });

      it('Private torrent', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.have.property('info');
        expect(torrent.metadata.info).to.have.property('private');
        expect(torrent.metadata.info.private).to.equal(1);
      });
    });

    describe('that holds a big video file', function() {
      let torrent;

      before(function(done) {
        nt.read(file4, (err, torrentData) => {
          if (err) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal('a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
      });
    });
  });

  describe('Read a stream', function() {
    describe('that holds a big video file', function() {
      let torrent;

      before(function(done) {
        nt.read(fs.createReadStream(file4), (err, torrentData) => {
          if (err) return done(err);
          torrent = torrentData;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(torrent).to.be.an('object');
        expect(torrent.metadata).to.be.an('object');
        expect(torrent.infoHash()).to.equal('a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
      });
    });
  });
});