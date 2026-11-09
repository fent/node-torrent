import { expect } from 'chai';
import * as schema from '../src/schema';

describe('Schema', () => {
  describe('Validate invalid torrent', () => {
    let torrent: Record<string, unknown> & {
      info: Record<string, unknown>;
    };

    beforeEach(() => {
      torrent = {
        announce: Buffer.from('http://tracker.com/1234'),
        info: {
          name: Buffer.from('magic'),
          'piece length': 262144,
          pieces: Buffer.alloc(20),
          length: 20,
        },
      };
    });

    it('`announce` is not a buffer', () => {
      torrent.announce = 43;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`announce` is not a buffer',
      );
    });

    it('`announce` is not a URL', () => {
      torrent.announce = Buffer.from('LOL');
      expect(schema.checkTorrent(torrent)).to.equal('`announce` is not a URL');
    });

    it('`creation date` is not an integer', () => {
      torrent['creation date'] = 'hello';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`creation date` is not an integer',
      );
    });

    it('`comment` is not a buffer', () => {
      torrent.comment = 2;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`comment` is not a buffer',
      );
    });

    it('`created by` is not a buffer', () => {
      torrent['created by'] = 'me';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`created by` is not a buffer',
      );
    });

    it('`encoding` is not a buffer', () => {
      torrent.encoding = [];
      expect(schema.checkTorrent(torrent)).to.equal(
        '`encoding` is not a buffer',
      );
    });

    it('`info` field not found', () => {
      delete (torrent as { info?: unknown }).info;
      expect(schema.checkTorrent(torrent)).to.equal('`info` field not found');
    });

    it('`info.files` is not a list', () => {
      torrent.info = { files: 'no' };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.files` is not a list',
      );
    });

    it('`length` field not found in file', () => {
      torrent.info = { files: [{}] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`length` field not found in file',
      );
    });

    it('`length` is not a positive integer in file', () => {
      torrent.info = { files: [{ length: 'never' }] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`length` is not a positive integer in file',
      );
    });

    it('`md5sum` is not a buffer', () => {
      torrent.info = { files: [{ length: 1, md5sum: 'no' }] };
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a buffer');
    });

    it('`md5sum` is not a 32 length hex in file', () => {
      torrent.info = { files: [{ length: 1, md5sum: Buffer.from('ohoh') }] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`md5sum` is not a 32 length hex in file',
      );
    });

    it('`path` field not found in file', () => {
      torrent.info = { files: [{ length: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` field not found in file',
      );
    });

    it('`path` is not a list in file', () => {
      torrent.info = { files: [{ length: 1, path: 1 }] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` is not a list in file',
      );
    });

    it('`path` is not a list of buffers in file', () => {
      torrent.info = { files: [{ length: 1, path: [1] }] };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` is not a list of buffers in file',
      );
    });

    it('`path` with a mix of buffers and non-buffers is invalid', () => {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('dir'), 1] }],
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` is not a list of buffers in file',
      );
    });

    it('`path` is empty in file', () => {
      torrent.info = {
        files: [{ length: 1, path: [] }],
      };
      expect(schema.checkTorrent(torrent)).to.equal('`path` is empty in file');
    });

    it('`path` contains traversal segments in file', () => {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('..'), Buffer.from('file')] }],
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` contains invalid path segments in file',
      );

      torrent.info = {
        files: [
          { length: 1, path: [Buffer.from('dir/sub'), Buffer.from('file')] },
        ],
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` contains invalid path segments in file',
      );
    });

    it('Cannot have `info.length` in multi file mode', () => {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        length: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        'Cannot have `info.length` in multi file mode',
      );
    });

    it('Cannot have `info.md5sum` in multi file mode', () => {
      torrent.info = {
        files: [{ length: 1, path: [Buffer.from('k')] }],
        md5sum: 1,
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        'Cannot have `info.md5sum` in multi file mode',
      );
    });

    it('`info.length` not found in single file mode', () => {
      delete torrent.info.length;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.length` not found in single file mode',
      );
    });

    it('`info.length` is not a positive integer in file', () => {
      torrent.info.length = 'no';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.length` is not a positive integer in file',
      );
    });

    it('`info.length` is negative in single file mode', () => {
      torrent.info.length = -5;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.length` is not a positive integer in file',
      );
    });

    it('`md5sum` is invalid in single file mode', () => {
      torrent.info.md5sum = 'invalid';
      expect(schema.checkTorrent(torrent)).to.equal('`md5sum` is not a buffer');
    });

    it('`md5sum` is valid 32 hex in single file mode', () => {
      torrent.info.md5sum = Buffer.from('d41d8cd98f00b204e9800998ecf8427e');
      expect(schema.checkTorrent(torrent)).to.be.null;
    });

    it('`md5sum` with extra characters around a valid hash is invalid', () => {
      torrent.info.md5sum = Buffer.from(
        'xx d41d8cd98f00b204e9800998ecf8427e yy',
      );
      expect(schema.checkTorrent(torrent)).to.equal(
        '`md5sum` is not a 32 length hex in file',
      );
    });

    it('`info.name` not found', () => {
      delete torrent.info.name;
      expect(schema.checkTorrent(torrent)).to.equal('`info.name` not found');
    });

    it('`name` is not a buffer', () => {
      torrent.info.name = 1;
      expect(schema.checkTorrent(torrent)).to.equal('`name` is not a buffer');
    });

    it('`name` contains invalid characters', () => {
      torrent.info.name = Buffer.from('../secret');
      expect(schema.checkTorrent(torrent)).to.equal(
        '`name` contains invalid characters',
      );
    });

    it('`info.piece length` not found', () => {
      delete torrent.info['piece length'];
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` not found',
      );
    });

    it('`info.piece length` is not a positive integer', () => {
      torrent.info['piece length'] = 'n';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` is not a positive integer',
      );

      torrent.info['piece length'] = 0;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` is not a positive integer',
      );

      torrent.info['piece length'] = -10;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` is not a positive integer',
      );
    });

    it('`info.piece length` must be a power of 2 and at least 16384', () => {
      torrent.info['piece length'] = 1;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` must be a power of 2 and at least 16384',
      );
      torrent.info['piece length'] = 8192;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` must be a power of 2 and at least 16384',
      );
      torrent.info['piece length'] = 20000;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` must be a power of 2 and at least 16384',
      );
    });

    it('`info.pieces` not found', () => {
      delete torrent.info.pieces;
      expect(schema.checkTorrent(torrent)).to.equal('`info.pieces` not found');
    });

    it('`info.pieces` is not a buffer', () => {
      torrent.info.pieces = 'n';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.pieces` is not a buffer',
      );
    });

    it('`info.pieces` length is not divisible by 20', () => {
      torrent.info.pieces = Buffer.alloc(19);
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.pieces` length is not divisible by 20',
      );
    });

    it('`info.private` can only be 0 or 1', () => {
      torrent.info.private = 3;
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.private` can only be 0 or 1',
      );
    });

    it('`source` is not a buffer', () => {
      torrent.info.source = 4;
      expect(schema.checkTorrent(torrent)).to.equal('`source` is not a buffer');
    });

    it('Torrent is not a hash', () => {
      expect(schema.checkTorrent('string')).to.equal('Torrent is not a hash');
      expect(schema.checkTorrent(null)).to.equal('Torrent is not a hash');
    });

    it('Blocks Artur Chlebicki PoC (GHSA-79x6-c2xh-3cq3)', () => {
      torrent.info = {
        name: Buffer.from('malicious'),
        'piece length': 1,
        pieces: Buffer.alloc(20),
        files: [
          {
            length: 1000000,
            path: [
              Buffer.from('..'),
              Buffer.from('..'),
              Buffer.from('..'),
              Buffer.from('etc'),
              Buffer.from('shadow'),
            ],
          },
        ],
      };
      expect(schema.checkTorrent(torrent)).to.equal(
        '`path` contains invalid path segments in file',
      );
      (torrent.info.files as { path: Buffer[] }[])[0].path = [
        Buffer.from('valid.txt'),
      ];
      expect(schema.checkTorrent(torrent)).to.equal(
        '`info.piece length` must be a power of 2 and at least 16384',
      );
    });

    it('`announce-list` is not a list', () => {
      torrent['announce-list'] = 'not a list';
      expect(schema.checkTorrent(torrent)).to.equal(
        '`announce-list` is not a list',
      );
    });

    it('`announce-list` is not a list of lists', () => {
      torrent['announce-list'] = ['not a list'];
      expect(schema.checkTorrent(torrent)).to.equal(
        '`announce-list` is not a list of lists',
      );
    });

    it('Item in `announce-list` is not a buffer', () => {
      torrent['announce-list'] = [['not a buffer']];
      expect(schema.checkTorrent(torrent)).to.equal(
        'Item in `announce-list` is not a buffer',
      );
    });

    it('Item in `announce-list` list is not a URL', () => {
      torrent['announce-list'] = [[Buffer.from('not a url')]];
      expect(schema.checkTorrent(torrent)).to.equal(
        'Item in `announce-list` list is not a URL',
      );
    });
  });

  describe('Validate', () => {
    it('Returns SchemaError on invalid torrent', (done) => {
      schema.validate('invalid', (err, result) => {
        expect(err).to.be.an('error');
        expect(err?.name).to.equal('SchemaError');
        expect(result).to.be.undefined;
        done();
      });
    });

    it('Returns Torrent instance on valid torrent', (done) => {
      const valid = {
        announce: Buffer.from('http://tracker.com/1234'),
        info: {
          name: Buffer.from('magic'),
          'piece length': 262144,
          pieces: Buffer.alloc(20),
          length: 20,
        },
      };
      schema.validate(valid, (err, t) => {
        expect(err).to.be.null;
        expect(t).to.be.an('object');
        expect(t?.metadata.announce).to.equal('http://tracker.com/1234');
        done();
      });
    });
  });

  describe('isValidPathSegment', () => {
    it('Rejects non-buffer and empty buffer', () => {
      expect(schema.isValidPathSegment('not a buffer')).to.be.false;
      expect(schema.isValidPathSegment(null)).to.be.false;
      expect(schema.isValidPathSegment(Buffer.alloc(0))).to.be.false;
    });

    it('Rejects dot and dot-dot segments', () => {
      expect(schema.isValidPathSegment(Buffer.from('.'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('..'))).to.be.false;
    });

    it('Rejects separators and null characters', () => {
      expect(schema.isValidPathSegment(Buffer.from('a/b'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('a\\b'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('a\0b'))).to.be.false;
    });

    it('Rejects Windows drive letters', () => {
      expect(schema.isValidPathSegment(Buffer.from('C:file'))).to.be.false;
      expect(schema.isValidPathSegment(Buffer.from('D:'))).to.be.false;
    });

    it('Accepts valid path segments', () => {
      expect(schema.isValidPathSegment(Buffer.from('normal-file.txt'))).to.be
        .true;
      expect(schema.isValidPathSegment(Buffer.from('folder_123'))).to.be.true;
    });
  });
});
