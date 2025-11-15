const nt = require('..');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

const file1 = path.join(__dirname, 'torrents', 'ubuntu.torrent');
const output1 = path.join(__dirname, 'result', 'new.torrent');
const output2 = path.join(__dirname, 'result', 'ubuntu.copy.torrent');
const tracker = 'http://faketracker.com';
const folder = path.join(__dirname, 'files');
const files = ['click.jpg'];
const options = { pieceLength: 18 /* 256 KB */, private: true };

describe('Make', function() {
  describe('Make a torrent file', function() {
    let torrent;

    before(function(done) {
      nt.make(tracker, folder, files, options, (err, result) => {
        if (err) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash matches torrent previously made by mktorrent', function() {
      expect(torrent.infoHash()).to.equal('2fff646b166f37f4fd131778123b25a01639e0b3');
    });
  });

  describe('Make a torrent file with folder, files, and pipe to read', function() {
    let torrent;

    before(function(done) {
      let rs = nt.make(tracker, folder, ['.']);
      rs.on('error', done);

      nt.read(rs, (err, result) => {
        if (err) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash matches', function() {
      expect(torrent.infoHash()).to.equal('c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
    });
  });

  describe('Make and write a torrent file with just the folder', function() {
    let torrent;

    before(function(done) {
      let rs = nt.makeWrite(output1, tracker, folder);
      rs.on('error', done);

      nt.read(rs, (err, result) => {
        if (err) return done(err);
        torrent = result;

        // Clean up the created file
        fs.unlink(output1, () => {
          done();
        });
      });
    });

    it('Info hash matches', function() {
      expect(torrent.infoHash()).to.equal('c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
    });
  });

  describe('Read', function() {
    let torrent;

    before(function(done) {
      nt.read(file1, (err, result) => {
        if (err) return done(err);
        torrent = result;
        done();
      });
    });

    it('Info hash from read file matches', function() {
      expect(torrent.metadata).to.be.an('object');
      expect(torrent.infoHash()).to.equal('a38d02c287893842a32825aa866e00828a318f07');
    });

    describe('then write new torrent file', function() {
      let writtenTorrent;

      before(function(done) {
        let ws = torrent.createWriteStream(output2);
        ws.on('error', done);

        ws.on('close', () => {
          nt.read(output2, (err, result) => {
            if (err) return done(err);
            writtenTorrent = result;

            // Clean up the created file
            fs.unlink(output2, () => {
              done();
            });
          });
        });
      });

      it('Info hash from read file matches', function() {
        expect(writtenTorrent.metadata).to.be.an('object');
        expect(writtenTorrent.infoHash()).to.equal('a38d02c287893842a32825aa866e00828a318f07');
      });
    });
  });
});