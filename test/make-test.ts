import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
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

    it('Errors when pieceLength is less than 14', (done) => {
      nt.make(tracker, folder, files, { pieceLength: 10 }, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal(
          '`opts.pieceLength` must be an integer between 14 and 30',
        );
        done();
      });
    });

    it('Errors when pieceLength is not an integer', (done) => {
      nt.make(
        tracker,
        folder,
        files,
        { pieceLength: 'bad' as unknown as number },
        (err) => {
          expect(err).to.be.an('error');
          expect(err?.message).to.equal(
            '`opts.pieceLength` must be an integer between 14 and 30',
          );
          done();
        },
      );
    });

    it('Errors when pieceLength is greater than 30', (done) => {
      nt.make(tracker, folder, files, { pieceLength: 31 }, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal(
          '`opts.pieceLength` must be an integer between 14 and 30',
        );
        done();
      });
    });

    it('Errors when pieceLength is not a whole number', (done) => {
      nt.make(tracker, folder, files, { pieceLength: 14.5 }, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal(
          '`opts.pieceLength` must be an integer between 14 and 30',
        );
        done();
      });
    });

    it('Errors when custom name contains invalid characters', (done) => {
      nt.make(tracker, folder, files, { name: '../invalid' }, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal('`name` contains invalid characters');
        done();
      });
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

  describe('Stream inputs', () => {
    it('Supports a stream without a directory argument', (done) => {
      const pt = new PassThrough();
      nt.make(tracker, pt, options, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('stream');
        expect(torrent?.metadata.info.length).to.equal(87582);
        done();
      });
      fs.createReadStream(path.join(folder, 'click.jpg')).pipe(pt);
    });

    it('Names a path-less stream after opts.name when no directory is given', (done) => {
      const pt = new PassThrough();
      const opts = { ...options, name: 'custom', multimode: true };
      nt.make(tracker, pt, opts, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('custom');
        expect(torrent?.metadata.info.files?.[0].path).to.deep.equal([
          'custom',
        ]);
        done();
      });
      pt.end(Buffer.alloc(100));
    });

    it('Supports StreamEntry arrays without a directory argument', (done) => {
      const entries: nt.StreamEntry[] = [
        {
          stream: fs.createReadStream(path.join(folder, 'click.jpg')),
          path: 'click.jpg',
        },
      ];
      nt.make(tracker, entries, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('click.jpg');
        done();
      });
    });

    it('Supports null options without a directory argument', (done) => {
      const rs = new PassThrough();
      rs.end(Buffer.alloc(10));
      nt.make(
        tracker,
        rs,
        null as unknown as nt.MakeOptions,
        (err, torrent) => {
          expect(err).to.be.null;
          expect(torrent).to.be.an('object');
          done();
        },
      );
    });

    it('Supports a single ReadStream and infers its length and path', (done) => {
      const rs = fs.createReadStream(path.join(folder, 'click.jpg'));
      const makeStream = nt.make(
        tracker,
        folder,
        rs,
        options,
        (err, torrent) => {
          expect(err).to.be.null;
          expect(torrent?.infoHash()).to.equal(
            '2fff646b166f37f4fd131778123b25a01639e0b3',
          );
          done();
        },
      );
      makeStream.on('ready', () => {
        expect(makeStream.unknownLengths).to.be.false;
        expect(makeStream.files).to.deep.equal([
          { length: 87582, path: ['click.jpg'] },
        ]);
      });
    });

    it('Infers a missing StreamEntry path from its ReadStream', (done) => {
      const entry = {
        stream: fs.createReadStream(path.join(folder, 'click.jpg')),
      } as unknown as nt.StreamEntry;
      nt.make(tracker, folder, entry, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('click.jpg');
        expect(torrent?.metadata.info.length).to.equal(87582);
        done();
      });
    });

    it('Falls back to the directory name for a path-less StreamEntry', (done) => {
      const pt = new PassThrough();
      const entry = { stream: pt } as unknown as nt.StreamEntry;
      nt.make(tracker, folder, entry, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('files');
        done();
      });
      pt.end(Buffer.alloc(10));
    });

    it('Infers the length of a ranged ReadStream', (done) => {
      const rs = fs.createReadStream(path.join(folder, 'click.jpg'), {
        start: 10,
        end: 19,
      });
      nt.make(tracker, rs, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.name).to.equal('click.jpg');
        expect(torrent?.metadata.info.length).to.equal(10);
        done();
      });
    });

    it('Supports a PassThrough stream without path and pipes to nt.read', (done) => {
      const pt = new PassThrough();
      fs.createReadStream(path.join(folder, 'click.jpg')).pipe(pt);
      const makeStream = nt.make(
        tracker,
        path.join(folder, 'click.jpg'),
        pt,
        options,
      );
      nt.read(makeStream, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.infoHash()).to.equal(
          '2fff646b166f37f4fd131778123b25a01639e0b3',
        );
        done();
      });
    });

    it('Supports multiple StreamEntry objects with unknown lengths and multi-piece chunks', (done) => {
      const entries: nt.StreamEntry[] = [
        {
          stream: fs.createReadStream(path.join(folder, 'click.jpg')),
          path: 'click.jpg',
        },
        {
          stream: fs.createReadStream(path.join(folder, 'heart.jpg')),
          path: ['heart.jpg'],
        },
      ];
      nt.make(tracker, folder, entries, { pieceLength: 15 }, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.files?.length).to.equal(2);
        done();
      });
    });

    it('Supports StreamEntry with known length (streaming header early)', (done) => {
      const entry: nt.StreamEntry = {
        stream: fs.createReadStream(path.join(folder, 'click.jpg')),
        path: 'click.jpg',
        length: 87582,
      };
      const makeStream = nt.make(tracker, folder, entry, options);
      nt.read(makeStream, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.infoHash()).to.equal(
          '2fff646b166f37f4fd131778123b25a01639e0b3',
        );
        done();
      });
    });

    it('Supports unknown-length stream whose total size is an exact multiple of pieceLength', (done) => {
      const pt = new PassThrough();
      const makeStream = nt.make(tracker, folder, pt, { pieceLength: 14 });
      nt.read(makeStream, (err, torrent) => {
        expect(err).to.be.null;
        expect(torrent?.metadata.info.length).to.equal(32768);
        done();
      });
      pt.end(Buffer.alloc(32768, 'a'));
    });

    it('Writes no pieces for an empty unknown-length stream', (done) => {
      const pt = new PassThrough();
      const makeStream = nt.make(tracker, folder, pt, { pieceLength: 14 });
      nt.read(makeStream, (err, torrent) => {
        if (!torrent) return done(err);
        expect((torrent.metadata.info.pieces as Buffer).length).to.equal(0);
        done();
      });
      pt.end();
    });

    it('Handles errors emitted by input stream', (done) => {
      const pt = new PassThrough();
      nt.make(tracker, folder, pt, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal('stream boom');
        done();
      });
      setImmediate(() => {
        pt.emit('error', new Error('stream boom'));
      });
    });

    it('Errors when StreamEntry attempts path traversal with unknown length', (done) => {
      const entry = {
        stream: new PassThrough(),
        path: ['..', 'secret.txt'],
      };
      nt.make(tracker, folder, entry, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Path traversal detected');
        done();
      });
    });

    it('Errors when StreamEntry attempts path traversal with known length', (done) => {
      const entry = {
        stream: new PassThrough(),
        path: ['..', 'secret.txt'],
        length: 10,
      };
      nt.make(tracker, folder, entry, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Path traversal detected');
        done();
      });
    });

    it('Errors when streams and file paths are mixed', (done) => {
      const mixed = [new PassThrough(), 'click.jpg'] as unknown as nt.MakeFiles;
      nt.make(tracker, folder, mixed, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal(
          'Cannot mix streams with file paths in the same list',
        );
        done();
      });
    });

    it('Errors when a stream length is negative', (done) => {
      const entry = {
        stream: new PassThrough(),
        path: 'invalid.txt',
        length: -1,
      };
      nt.make(tracker, folder, entry, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Invalid stream length');
        done();
      });
    });

    it('Errors when a stream length is not an integer', (done) => {
      const entry = {
        stream: new PassThrough(),
        path: 'invalid.txt',
        length: 1.5,
      };
      nt.make(tracker, folder, entry, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Invalid stream length');
        done();
      });
    });

    it('Errors when a known-length stream is shorter than declared', (done) => {
      const pt = new PassThrough();
      const entry = { stream: pt, path: 'short.txt', length: 100 };
      nt.make(tracker, folder, entry, {}, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Stream length mismatch');
        done();
      });
      pt.end(Buffer.alloc(10));
    });

    it('Errors when a known-length stream is longer than declared', (done) => {
      const pt = new PassThrough();
      const entry = { stream: pt, path: 'long.txt', length: 10 };
      nt.make(tracker, folder, entry, {}, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.contain('Stream length mismatch');
        done();
      });
      pt.end(Buffer.alloc(20));
    });

    it('Gives multiple unnamed streams unique paths', (done) => {
      const first = new PassThrough();
      const second = new PassThrough();
      nt.make(tracker, folder, [first, second], {}, (err, torrent) => {
        expect(err).to.be.null;
        expect(
          torrent?.metadata.info.files?.map((file) => file.path),
        ).to.deep.equal([['files'], ['files-1']]);
        done();
      });
      first.end(Buffer.alloc(10));
      second.end(Buffer.alloc(10));
    });

    it('Errors when stream paths are duplicated', (done) => {
      const entries: nt.StreamEntry[] = [
        { stream: new PassThrough(), path: 'same.txt' },
        { stream: new PassThrough(), path: 'same.txt' },
      ];
      nt.make(tracker, folder, entries, (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal('Duplicate stream path: same.txt');
        done();
      });
    });
  });

  describe('Piece counts', () => {
    let dir: string;

    before(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-pieces-'));
    });

    after(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const makePieces = (
      files: string[],
      options?: nt.MakeOptions,
    ): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        nt.read(nt.make(tracker, dir, files, options), (err, torrent) => {
          if (err || !torrent) return reject(err ?? new Error('No torrent'));
          resolve(torrent.metadata.info.pieces as Buffer);
        });
      });

    it('Writes one piece when the size equals the default pieceLength', async () => {
      fs.writeFileSync(path.join(dir, 'exact.bin'), Buffer.alloc(262144, 1));
      const pieces = await makePieces(['exact.bin']);
      expect(pieces.length).to.equal(20);
    });

    it('Writes a whole piece when the total size divides evenly', async () => {
      fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(32768, 1));
      fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.alloc(32768, 2));
      const pieces = await makePieces(['a.bin', 'b.bin'], { pieceLength: 14 });
      expect(pieces.length).to.equal(80);
    });

    it('Writes no pieces for a zero-byte torrent', async () => {
      fs.writeFileSync(path.join(dir, 'empty.bin'), Buffer.alloc(0));
      expect(
        (await makePieces(['empty.bin'], { pieceLength: 14 })).length,
      ).to.equal(0);
    });

    it('Writes no pieces when every file is empty', async () => {
      fs.writeFileSync(path.join(dir, 'e1.bin'), Buffer.alloc(0));
      fs.writeFileSync(path.join(dir, 'e2.bin'), Buffer.alloc(0));
      expect(
        (await makePieces(['e1.bin', 'e2.bin'], { pieceLength: 14 })).length,
      ).to.equal(0);
    });

    it('Errors when a directory has no files', (done) => {
      fs.mkdirSync(path.join(dir, 'empty-dir'));
      nt.make(tracker, dir, ['empty-dir'], (err) => {
        expect(err).to.be.an('error');
        expect(err?.message).to.equal('no files found');
        done();
      });
    });

  });
});
