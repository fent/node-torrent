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
      torrent.info = { files: [{ length: 1, path: [Buffer.from('dir'), 1] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is not a list of buffers in file');
    });

    it('`path` is empty in file', function() {
      torrent.info = { files: [{ length: 1, path: [] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is empty in file');
    });

    it('`path` contains invalid path segments in file', function() {
      torrent.info = { files: [{ length: 1, path: [Buffer.from('..'), Buffer.from('file')] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` contains invalid path segments in file');
      torrent.info = { files: [{ length: 1, path: [Buffer.from('dir/sub')] }] };
      expect(schema.checkTorrent(torrent)).to.equal('`path` contains invalid path segments in file');
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

    it('`info.name` not found', function() {
      delete torrent.info.name;
      expect(schema.checkTorrent(torrent)).to.equal('`info.name` not found');
    });

    it('`name` is not a buffer', function() {
      torrent.info.name = 1;
      expect(schema.checkTorrent(torrent)).to.equal('`name` is not a buffer');
    });

    it('`name` contains invalid characters', function() {
      torrent.info.name = Buffer.from('../secret');
      expect(schema.checkTorrent(torrent)).to.equal('`name` contains invalid characters');
    });

    it('`info.piece length` not found', function() {
      delete torrent.info['piece length'];
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` not found');
    });

    it('`info.piece length` is not a positive integer', function() {
      torrent.info['piece length'] = 'n';
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` is not a positive integer');
      torrent.info['piece length'] = 0;
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` is not a positive integer');
      torrent.info['piece length'] = -10;
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` is not a positive integer');
    });

    it('`info.piece length` must be a power of 2 and at least 16384', function() {
      torrent.info['piece length'] = 1;
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` must be a power of 2 and at least 16384');
      torrent.info['piece length'] = 8192;
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` must be a power of 2 and at least 16384');
      torrent.info['piece length'] = 20000;
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` must be a power of 2 and at least 16384');
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

    it('`md5sum` with extra characters around a valid hash is invalid', function() {
      torrent.info.md5sum = Buffer.from('xx d41d8cd98f00b204e9800998ecf8427e yy');
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a 32 length hex in file');
    });

    it('Torrent is not a hash', function() {
      expect(schema.checkTorrent(null)).to.equal('Torrent is not a hash');
      expect(schema.checkTorrent('not an object')).to.equal('Torrent is not a hash');
    });

    it('Blocks Artur Chlebicki PoC (GHSA-79x6-c2xh-3cq3)', function() {
      torrent.info = {
        name: Buffer.from('malicious'),
        'piece length': 1,
        pieces: Buffer.alloc(20),
        files: [{
          length: 1000000,
          path: [Buffer.from('..'), Buffer.from('..'), Buffer.from('..'), Buffer.from('etc'), Buffer.from('shadow')]
        }]
      };
      expect(schema.checkTorrent(torrent)).to.equal('`path` contains invalid path segments in file');
      torrent.info.files[0].path = [Buffer.from('valid.txt')];
      expect(schema.checkTorrent(torrent)).to.equal('`info.piece length` must be a power of 2 and at least 16384');
    });

  });

  describe('isValidPathSegment', function() {
    it('Rejects non-buffer and empty buffer', function() {
      expect(schema.isValidPathSegment('not a buffer')).to.be.false;
      expect(schema.isValidPathSegment(null)).to.be.false;
      expect(schema.isValidPathSegment(Buffer.alloc(0))).to.be.false;
    });

    it('Rejects dot and dot-dot segments', function() {
      expect(schema.isValidPathSegment(Buffer.from('.'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('..'))).to.be.false;
    });

    it('Rejects separators and null characters', function() {
      expect(schema.isValidPathSegment(Buffer.from('a/b'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('a\\b'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('a\0b'))).to.be.false;
    });

    it('Rejects Windows drive letters', function() {
      expect(schema.isValidPathSegment(Buffer.from('C:file'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('D:'))).to.be.false;
    });

    it('Accepts valid path segments', function() {
      expect(schema.isValidPathSegment(Buffer.from('normal-file.txt'))).to.be.true;
      expect(schema.isValidPathSegment(Buffer.from('folder_123'))).to.be.true;
    });
  });
});

