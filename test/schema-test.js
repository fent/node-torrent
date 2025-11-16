const schema = require('../lib/schema');
const { expect } = require('chai');

describe('Schema', function() {
  describe('Validate invalid torrent', function() {
    let torrent;

    before(function() {
      torrent = {
        announce: Buffer.from('http://tracker.com/1234'),
        info: {
          name: Buffer.from('magic'),
          'piece length': 262144,
          pieces: Buffer.alloc(20),
          length: 20
        }
      };
    });

    it('`announce` and `announce-list` fields not found', function() {
      delete torrent.announce;
      expect(schema.checkTorrent(torrent)).to.equal('`announce` and `announce-list` fields not found');
      // Restore for next test
      torrent.announce = Buffer.from('http://tracker.com/1234');
    });

    it('`announce` is not a buffer', function() {
      torrent.announce = 43;
      expect(schema.checkTorrent(torrent)).to.equal('`announce` is not a buffer');
      // Restore for next test
      torrent.announce = Buffer.from('http://tracker.com/1234');
    });

    it('`announce` is not a URL', function() {
      torrent.announce = Buffer.from('LOL');
      expect(schema.checkTorrent(torrent)).to.equal('`announce` is not a URL');
      // Restore for next test
      torrent.announce = Buffer.from('http://tracker.com/1234');
    });

    it('`creation date` is not an integer', function() {
      torrent['creation date'] = 'hello';
      expect(schema.checkTorrent(torrent)).to.equal('`creation date` is not an integer');
      // Restore for next test
      delete torrent['creation date'];
    });

    it('`comment` is not a buffer', function() {
      torrent.comment = 2;
      expect(schema.checkTorrent(torrent)).to.equal('`comment` is not a buffer');
      // Restore for next test
      delete torrent.comment;
    });

    it('`created by` is not a buffer', function() {
      torrent['created by'] = 'me';
      expect(schema.checkTorrent(torrent)).to.equal('`created by` is not a buffer');
      // Restore for next test
      delete torrent['created by'];
    });

    it('`encoding` is not a buffer', function() {
      torrent.encoding = [];
      expect(schema.checkTorrent(torrent)).to.equal('`encoding` is not a buffer');
      // Restore for next test
      delete torrent.encoding;
    });

    it('`info` field not found', function() {
      const originalInfo = torrent.info;
      delete torrent.info;
      expect(schema.checkTorrent(torrent)).to.equal('`info` field not found');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`info.files` is not a list', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: 'no' };
      expect(schema.checkTorrent(torrent)).to.equal('`info.files` is not a list');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`length` field not found in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{}] };
      expect(schema.checkTorrent(torrent)).to.equal('`length` field not found in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`length` is not a positive integer in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 'never' }] };
      expect(schema.checkTorrent(torrent)).to.equal('`length` is not a positive integer in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`md5sum` is not a buffer', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 1, md5sum: 'no' }] };
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a buffer');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`md5sum` is not a 32 length hex in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 1, md5sum: Buffer.from('ohoh') }] };
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a 32 length hex in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`path` field not found in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` field not found in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`path` is not a list in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 1, path: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is not a list in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`path` is not a list of buffers in file', function() {
      const originalInfo = torrent.info;
      torrent.info = { files: [{ length: 1, path: [1] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is not a list of buffers in file');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('Cannot have `info.length` in multi file mode', function() {
      const originalInfo = torrent.info;
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        length: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal('Cannot have `info.length` in multi file mode');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('Cannot have `info.md5sum` in multi file mode', function() {
      const originalInfo = torrent.info;
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        md5sum: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal('Cannot have `info.md5sum` in multi file mode');
      // Restore for next test
      torrent.info = originalInfo;
    });

    it('`info.length` not found in single file mode', function() {
      const originalLength = torrent.info.length;
      delete torrent.info.length;
      expect(schema.checkTorrent(torrent)).to.equal('`info.length` not found in single file mode');
      // Restore for next test
      torrent.info.length = originalLength;
    });

    it('`info.length` is not a positive integer in file', function() {
      const originalLength = torrent.info.length;
      torrent.info.length = 'no';
      expect(schema.checkTorrent(torrent)).to.equal('`info.length` is not a positive integer in file');
      // Restore for next test
      torrent.info.length = originalLength;
    });

    it('`name` is not a buffer', function() {
      const originalName = torrent.info.name;
      torrent.info.name = 1;
      expect(schema.checkTorrent(torrent)).to.equal('`name` is not a buffer');
      // Restore for next test
      torrent.info.name = originalName;
    });

    it('`info.piece length` not found', function() {
      const originalPieceLength = torrent.info['piece length'];
      delete torrent.info['piece length'];
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` not found');
      // Restore for next test
      torrent.info['piece length'] = originalPieceLength;
    });

    it('`info.piece length` is not a positive integer', function() {
      const originalPieceLength = torrent.info['piece length'];
      torrent.info['piece length'] = 'n';
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` is not a positive integer');
      // Restore for next test
      torrent.info['piece length'] = originalPieceLength;
    });

    it('`info.pieces` not found', function() {
      const originalPieces = torrent.info.pieces;
      delete torrent.info.pieces;
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` not found');
      // Restore for next test
      torrent.info.pieces = originalPieces;
    });

    it('`info.pieces` is not a buffer', function() {
      const originalPieces = torrent.info.pieces;
      torrent.info.pieces = 'n';
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` is not a buffer');
      // Restore for next test
      torrent.info.pieces = originalPieces;
    });

    it('`info.pieces` length is not divisible by 20', function() {
      const originalPieces = torrent.info.pieces;
      torrent.info.pieces = Buffer.alloc(19);
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` length is not divisible by 20');
      // Restore for next test
      torrent.info.pieces = originalPieces;
    });

    it('`info.private` can only be 0 or 1', function() {
      torrent.info.private = 3;
      expect(schema.checkTorrent(torrent)).to.equal('`info.private` can only be 0 or 1');
      // Restore for next test
      delete torrent.info.private;
    });

    it('`source` is not a buffer', function() {
      torrent.info.source = 4;
      expect(schema.checkTorrent(torrent)).to.equal('`source` is not a buffer');
      // Restore for next test
      delete torrent.info.source;
    });

  });
});
