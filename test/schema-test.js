const schema = require('../lib/schema');
const { expect } = require('chai');

describe('Schema', function() {
  describe('Validate invalid torrent', function() {
    let torrent;

    beforeEach(function() {
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
    });

    it('`announce` is not a buffer', function() {
      torrent.announce = 43;
      expect(schema.checkTorrent(torrent)).to.equal('`announce` is not a buffer');
    });

    it('`announce` is not a URL', function() {
      torrent.announce = Buffer.from('LOL');
      expect(schema.checkTorrent(torrent)).to.equal('`announce` is not a URL');
    });

    it('`creation date` is not an integer', function() {
      torrent['creation date'] = 'hello';
      expect(schema.checkTorrent(torrent)).to.equal('`creation date` is not an integer');
    });

    it('`comment` is not a buffer', function() {
      torrent.comment = 2;
      expect(schema.checkTorrent(torrent)).to.equal('`comment` is not a buffer');
    });

    it('`created by` is not a buffer', function() {
      torrent['created by'] = 'me';
      expect(schema.checkTorrent(torrent)).to.equal('`created by` is not a buffer');
    });

    it('`encoding` is not a buffer', function() {
      torrent.encoding = [];
      expect(schema.checkTorrent(torrent)).to.equal('`encoding` is not a buffer');
    });

    it('`info` field not found', function() {
      delete torrent.info;
      expect(schema.checkTorrent(torrent)).to.equal('`info` field not found');
    });

    it('`info.files` is not a list', function() {
      torrent.info = { files: 'no' };
      expect(schema.checkTorrent(torrent)).to.equal('`info.files` is not a list');
    });

    it('`length` field not found in file', function() {
      torrent.info = { files: [{}] };
      expect(schema.checkTorrent(torrent)).to.equal('`length` field not found in file');
    });

    it('`length` is not a positive integer in file', function() {
      torrent.info = { files: [{ length: 'never' }] };
      expect(schema.checkTorrent(torrent)).to.equal('`length` is not a positive integer in file');
    });

    it('`md5sum` is not a buffer', function() {
      torrent.info = { files: [{ length: 1, md5sum: 'no' }] };
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a buffer');
    });

    it('`md5sum` is not a 32 length hex in file', function() {
      torrent.info = { files: [{ length: 1, md5sum: Buffer.from('ohoh') }] };
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a 32 length hex in file');
    });

    it('`path` field not found in file', function() {
      torrent.info = { files: [{ length: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` field not found in file');
    });

    it('`path` is not a list in file', function() {
      torrent.info = { files: [{ length: 1, path: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is not a list in file');
    });

    it('`path` is not a list of buffers in file', function() {
      torrent.info = { files: [{ length: 1, path: [1] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is not a list of buffers in file');
    });

    it('Cannot have `info.length` in multi file mode', function() {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        length: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal('Cannot have `info.length` in multi file mode');
    });

    it('Cannot have `info.md5sum` in multi file mode', function() {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        md5sum: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal('Cannot have `info.md5sum` in multi file mode');
    });

    it('`info.length` not found in single file mode', function() {
      delete torrent.info.length;
      expect(schema.checkTorrent(torrent)).to.equal('`info.length` not found in single file mode');
    });

    it('`info.length` is not a positive integer in file', function() {
      torrent.info.length = 'no';
      expect(schema.checkTorrent(torrent)).to.equal('`info.length` is not a positive integer in file');
    });

    it('`name` is not a buffer', function() {
      torrent.info.name = 1;
      expect(schema.checkTorrent(torrent)).to.equal('`name` is not a buffer');
    });

    it('`info.piece length` not found', function() {
      delete torrent.info['piece length'];
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` not found');
    });

    it('`info.piece length` is not a positive integer', function() {
      torrent.info['piece length'] = 'n';
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` is not a positive integer');
    });

    it('`info.pieces` not found', function() {
      delete torrent.info.pieces;
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` not found');
    });

    it('`info.pieces` is not a buffer', function() {
      torrent.info.pieces = 'n';
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` is not a buffer');
    });

    it('`info.pieces` length is not divisible by 20', function() {
      torrent.info.pieces = Buffer.alloc(19);
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` length is not divisible by 20');
    });

    it('`info.private` can only be 0 or 1', function() {
      torrent.info.private = 3;
      expect(schema.checkTorrent(torrent)).to.equal('`info.private` can only be 0 or 1');
    });

    it('`source` is not a buffer', function() {
      torrent.info.source = 4;
      expect(schema.checkTorrent(torrent)).to.equal('`source` is not a buffer');
    });

  });
});