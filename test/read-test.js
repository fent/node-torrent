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
      let result;

      before(function(done) {
        nt.read(file2, (err, torrent) => {
          if (err) return done(err);
          result = torrent;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.be.an('object');
        expect(result.infoHash()).to.equal('2fff646b166f37f4fd131778123b25a01639e0b3');
      });

      it('Announce URL is correct', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.have.property('announce');
        expect(result.metadata.announce).to.equal('http://hello.2u');
      });

      it('Single file mode', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.have.property('info');
        expect(result.metadata.info).to.have.property('name');
        expect(result.metadata.info.name).to.equal('click.jpg');
        expect(result.metadata.info).to.not.have.property('files');
        expect(result.metadata.info).to.have.property('length');
        expect(result.metadata.info.length).to.equal(87582);
      });

      it('256 KB piece length', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.have.property('info');
        expect(result.metadata.info).to.have.property('piece length');
        expect(result.metadata.info['piece length']).to.equal(262144);
      });

      it('Private torrent', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.have.property('info');
        expect(result.metadata.info).to.have.property('private');
        expect(result.metadata.info.private).to.equal(1);
      });
    });

    describe('that holds a big video file', function() {
      let result;

      before(function(done) {
        nt.read(file4, (err, torrent) => {
          if (err) return done(err);
          result = torrent;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.be.an('object');
        expect(result.infoHash()).to.equal('a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
      });
    });
  });

  describe('Read a stream', function() {
    describe('that holds a big video file', function() {
      let result;

      before(function(done) {
        nt.read(fs.createReadStream(file4), (err, torrent) => {
          if (err) return done(err);
          result = torrent;
          done();
        });
      });

      it('Info hash matches', function() {
        expect(result).to.be.an('object');
        expect(result.metadata).to.be.an('object');
        expect(result.infoHash()).to.equal('a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
      });
    });
  });
});
