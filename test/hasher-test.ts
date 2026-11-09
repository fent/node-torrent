import fs from 'node:fs';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';
import stream from 'node:stream';
import { expect } from 'chai';
import Hasher from '../src/hasher';

describe('Hasher', () => {
  const folder = path.join(__dirname, 'files');

  it('Emits error if dir cannot be accessed', (done) => {
    const hasher = new Hasher('/non/existent/directory', ['file.txt']);
    hasher.on('error', (err) => {
      expect(err).to.be.an('error');
      done();
    });
  });

  it('Sets this.err when stopOnErr is true', (done) => {
    const hasher = new Hasher('/non/existent/directory', ['file.txt'], null, {
      stopOnErr: true,
    });
    hasher.on('error', (err) => {
      expect(hasher.err).to.equal(err);
      done();
    });
  });

  it('Emits error if _start is called before ready', (done) => {
    const hasher = new Hasher(folder, ['click.jpg']);
    hasher.on('error', (err) => {
      expect(err.message).to.equal('Cannot start before being ready');
      done();
    });
    hasher._start();
  });

  it('Handles pause, resume, toggle, and destroy lifecycle', (done) => {
    const hasher = new Hasher(folder, ['click.jpg']);

    expect(hasher.pause()).to.be.false;
    expect(hasher.resume()).to.be.false;
    expect(hasher.destroy()).to.be.false;

    hasher.on('open', () => {
      expect(hasher.pause()).to.be.true;
      expect(hasher.pause()).to.be.false;
      expect(hasher.resume()).to.be.true;
      expect(hasher.resume()).to.be.false;

      // toggle when not paused -> pauses
      expect(hasher.toggle()).to.be.true;
      expect(hasher.paused).to.be.true;

      // toggle when paused -> resumes
      expect(hasher.toggle()).to.be.true;
      expect(hasher.paused).to.be.false;

      expect(hasher.destroy()).to.be.true;
      expect(hasher.stopped).to.be.true;
      expect(hasher.hashing).to.be.false;
      done();
    });
  });

  it('Splits large chunks across multiple pieces with small pieceLength', (done) => {
    // 512 bytes piece length means a standard 64KB read chunk spans many pieces
    const hasher = new Hasher(folder, ['click.jpg'], 512);
    let pieceCount = 0;

    hasher.on('hash', () => {
      pieceCount++;
    });

    hasher.on('end', () => {
      expect(pieceCount).to.be.greaterThan(10);
      done();
    });

    hasher.on('error', done);
  });

  it('Handles read stream error during hashing', (done) => {
    const origCreateReadStream = fs.createReadStream;
    let streamCreated = false;

    (
      fs as unknown as {
        createReadStream: (...args: unknown[]) => fs.ReadStream;
      }
    ).createReadStream = (...args: unknown[]) => {
      const rs = (
        origCreateReadStream as (...a: unknown[]) => fs.ReadStream
      ).apply(fs, args);
      if (!streamCreated) {
        streamCreated = true;
        process.nextTick(() => {
          rs.emit('error', new Error('Simulated read error'));
        });
      }
      return rs;
    };

    const hasher = new Hasher(folder, ['click.jpg']);

    hasher.on('error', (err) => {
      (
        fs as unknown as { createReadStream: typeof fs.createReadStream }
      ).createReadStream = origCreateReadStream;
      expect(err.message).to.equal('Simulated read error');
      done();
    });
  });

  it('Sorts paths of different lengths with same prefix', (done) => {
    const hasher = new Hasher(folder, ['click.jpg']);

    // Mock _getFilesStats to inject paths of different lengths
    hasher._getFilesStats = (_queue, _list, callback) => {
      hasher.files = [
        { path: ['b'], length: 1 },
        { path: ['sub', 'file.txt'], length: 10 },
        { path: ['a'], length: 1 },
        { path: ['sub'], length: 5 },
      ];
      callback(new Error('stop'));
    };

    hasher.on('error', (err) => {
      expect(err.message).to.equal('stop');
      expect(hasher.files[0].path).to.deep.equal(['a']);
      expect(hasher.files[1].path).to.deep.equal(['b']);
      expect(hasher.files[2].path).to.deep.equal(['sub']);
      expect(hasher.files[3].path).to.deep.equal(['sub', 'file.txt']);
      done();
    });
  });

  it('Does not re-emit progress when percent has not changed', (done) => {
    const origCreateReadStream = fs.createReadStream;
    (
      fs as unknown as { createReadStream: () => stream.PassThrough }
    ).createReadStream = () => {
      const rs = new stream.PassThrough();
      process.nextTick(() => {
        rs.emit('open');
        rs.write(Buffer.from('a'));
        rs.write(Buffer.from('b'));
        rs.end(Buffer.alloc(87580));
      });
      return rs;
    };
    const hasher = new Hasher(folder, ['click.jpg']);
    hasher.on('end', () => {
      (
        fs as unknown as { createReadStream: typeof fs.createReadStream }
      ).createReadStream = origCreateReadStream;
      done();
    });
  });

  it('Handles error in _getFileStat when stat fails', (done) => {
    const hasher = new Hasher(folder, ['nonexistent.txt']);
    hasher.on('error', (err) => {
      expect(err).to.be.an('error');
      done();
    });
  });

  it('Handles error in _getFileStat when readdir fails', (done) => {
    const origReaddir = fs.readdir;
    (
      fs as unknown as {
        readdir: (_p: string, cb: (err: Error) => void) => void;
      }
    ).readdir = (_p, cb) => {
      cb(new Error('Simulated readdir error'));
    };
    const hasher = new Hasher(folder, ['.']);
    hasher.on('error', (err) => {
      (fs as unknown as { readdir: typeof fs.readdir }).readdir = origReaddir;
      expect(err.message).to.equal('Simulated readdir error');
      done();
    });
  });

  it('Ignores items that are neither file nor directory', (done) => {
    const origStat = fs.stat;
    (
      fs as unknown as {
        stat: (
          _p: string,
          cb: (err: null, stat: Record<string, () => boolean>) => void,
        ) => void;
      }
    ).stat = (_p, cb) => {
      (fs as unknown as { stat: typeof fs.stat }).stat = origStat;
      cb(null, {
        isDirectory: () => false,
        isFile: () => false,
      });
    };
    const hasher = new Hasher(folder, ['special']);
    hasher.on('ready', () => {
      expect(hasher.files.length).to.equal(0);
      hasher.destroy();
      done();
    });
  });

  it('Returns early from _writePiece if piece does not exist', () => {
    const hasher = new Hasher(folder, ['click.jpg']);
    expect(hasher._writePiece([], 0, 0, Buffer.alloc(0), 0, 0)).to.equal(0);
  });

  it('Emits error when task path attempts path traversal', (done) => {
    const maliciousTask = [{ length: 10, path: ['..', 'secret.txt'] }];
    const hasher = new Hasher(folder, maliciousTask);
    hasher.on('error', (err) => {
      expect(err.message).to.contain('Path traversal detected');
      done();
    });
  });

  it('Emits error when stream task path attempts path traversal', (done) => {
    const maliciousTask = [
      {
        stream: new stream.PassThrough(),
        length: 10,
        path: ['..', 'secret.txt'],
      },
    ];
    const hasher = new Hasher(folder, maliciousTask);
    hasher.on('error', (err) => {
      expect(err.message).to.contain('Path traversal detected');
      done();
    });
  });

  it('Emits error when a stream path is empty', (done) => {
    const hasher = new Hasher(folder, [
      { stream: new stream.PassThrough(), path: [] },
    ]);
    hasher.on('error', (err) => {
      expect(err.message).to.contain('Path traversal detected');
      done();
    });
  });

  it('Emits error when a stream path has non-string segments', (done) => {
    const hasher = new Hasher(folder, [
      {
        stream: new stream.PassThrough(),
        path: [1] as unknown as string[],
      },
    ]);
    hasher.on('error', (err) => {
      expect(err.message).to.contain('Path traversal detected');
      done();
    });
  });

  it('Falls back to "stream" when the directory has no basename', (done) => {
    const pt = new stream.PassThrough();
    const hasher = new Hasher('/', [pt]);
    hasher.on('end', () => {
      expect(hasher.files[0].path).to.deep.equal(['stream']);
      done();
    });
    pt.end(Buffer.alloc(10));
  });

  it('Stops other in-flight streams after an error', (done) => {
    const first = new stream.PassThrough();
    const second = new stream.PassThrough();
    const third = new stream.PassThrough();
    const hasher = new Hasher(
      folder,
      [
        { stream: first, path: 'first.txt', length: 5 },
        { stream: second, path: 'second.txt', length: 5 },
        { stream: third, path: 'third.txt', length: 5 },
      ],
      null,
      { maxFiles: 2, stopOnErr: true },
    );
    hasher.on('ready', () => {
      setImmediate(() => {
        first.emit('error', new Error('boom'));
        first.emit('error', new Error('boom again'));
        first.write(Buffer.alloc(1));
        first.end();
      });
    });
    hasher.on('error', (err) => {
      expect(err.message).to.equal('boom');
      second.write(Buffer.alloc(5));
      setImmediate(() => {
        expect(second.destroyed).to.equal(true);
        done();
      });
    });
  });

  it('Only emits the first error when stopOnErr is true', (done) => {
    const first = new stream.PassThrough();
    const second = new stream.PassThrough();
    const hasher = new Hasher(
      folder,
      [
        { stream: first, path: 'first.txt', length: 5 },
        { stream: second, path: 'second.txt', length: 5 },
      ],
      null,
      { maxFiles: 2, stopOnErr: true },
    );
    let errors = 0;
    hasher.on('error', () => {
      errors++;
    });
    hasher.on('ready', () => {
      setImmediate(() => {
        first.emit('error', new Error('one'));
        second.emit('error', new Error('two'));
        setImmediate(() => {
          expect(errors).to.equal(1);
          done();
        });
      });
    });
  });

  it('Stops processing remaining unknown-length streams after an error', (done) => {
    const first = new stream.PassThrough();
    const second = new stream.PassThrough();
    let secondRead = false;
    second.on('data', () => {
      secondRead = true;
    });
    const hasher = new Hasher(folder, [first, second], null, {
      stopOnErr: true,
    });
    hasher.on('ready', () => {
      setImmediate(() => {
        first.emit('error', new Error('boom'));
        first.emit('error', new Error('boom again'));
        first.write(Buffer.alloc(1));
        first.end();
      });
    });
    hasher.on('error', (err) => {
      expect(err.message).to.equal('boom');
      setImmediate(() => {
        expect(secondRead).to.equal(false);
        done();
      });
    });
  });

  it('Infers a path and length from an fs.ReadStream with a Buffer path', (done) => {
    const rs = fs.createReadStream(Buffer.from(path.join(folder, 'click.jpg')));
    const hasher = new Hasher(folder, [rs]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.false;
      expect(hasher.files[0].path).to.deep.equal(['click.jpg']);
      expect(hasher.files[0].length).to.equal(87582);
    });
    hasher.on('end', done);
    hasher.on('error', done);
  });

  it('Does not infer a length from a partially read stream', (done) => {
    const rs = fs.createReadStream(path.join(folder, 'click.jpg'));
    rs.once('data', (chunk) => {
      rs.pause();
      const hasher = new Hasher(folder, [rs]);
      hasher.on('ready', () => {
        expect(hasher.unknownLengths).to.be.true;
        expect(hasher.files).to.deep.equal([]);
        rs.resume();
      });
      hasher.on('end', () => {
        expect(hasher.files[0].length).to.equal(87582 - chunk.length);
        done();
      });
      hasher.on('error', done);
    });
  });

  it('Does not infer a length when an fs.ReadStream has no path', (done) => {
    fs.open(path.join(folder, 'click.jpg'), 'r', (err, fd) => {
      if (err) return done(err);
      const rs = fs.createReadStream('', { fd });
      const hasher = new Hasher(folder, [rs]);
      hasher.on('ready', () => {
        expect(hasher.unknownLengths).to.be.true;
      });
      hasher.on('end', () => {
        expect(hasher.files[0]).to.deep.equal({
          length: 87582,
          path: ['files'],
        });
        done();
      });
      hasher.on('error', done);
    });
  });

  it('Falls back to unknown length when stat fails', (done) => {
    const originalStat = fs.stat;
    (
      fs as unknown as {
        stat: (_p: unknown, cb: (err: Error) => void) => void;
      }
    ).stat = (_p, cb) => {
      (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
      cb(new Error('stat boom'));
    };
    const rs = fs.createReadStream(path.join(folder, 'click.jpg'));
    const hasher = new Hasher(folder, [rs]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.true;
    });
    hasher.on('end', done);
    hasher.on('error', (err) => {
      (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
      done(err);
    });
  });

  it('Falls back to unknown length when stat is not a file', (done) => {
    const originalStat = fs.stat;
    (
      fs as unknown as {
        stat: (
          _p: unknown,
          cb: (err: null, stat: { isFile: () => boolean }) => void,
        ) => void;
      }
    ).stat = (_p, cb) => {
      (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
      cb(null, { isFile: () => false });
    };
    const rs = fs.createReadStream(path.join(folder, 'click.jpg'));
    const hasher = new Hasher(folder, [rs]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.true;
    });
    hasher.on('end', done);
    hasher.on('error', (err) => {
      (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
      done(err);
    });
  });

  it('Infers length from an HTTP Content-Length header', (done) => {
    const res = new IncomingMessage(new Socket());
    res.headers = { 'content-length': '10' };
    const hasher = new Hasher(folder, [res]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.false;
      expect(hasher.files[0].length).to.equal(10);
    });
    hasher.on('end', done);
    hasher.on('error', done);
    res.push(Buffer.alloc(10));
    res.push(null);
  });

  it('Ignores a non-string Content-Length header', (done) => {
    const res = new IncomingMessage(new Socket());
    res.headers = { 'content-length': 10 as unknown as string };
    const hasher = new Hasher(folder, [res]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.true;
    });
    hasher.on('end', done);
    hasher.on('error', done);
    res.push(Buffer.alloc(10));
    res.push(null);
  });

  it('Ignores an invalid Content-Length header', (done) => {
    const res = new IncomingMessage(new Socket());
    res.headers = { 'content-length': 'not-a-number' };
    const hasher = new Hasher(folder, [res]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.true;
    });
    hasher.on('end', done);
    hasher.on('error', done);
    res.push(Buffer.alloc(10));
    res.push(null);
  });

  it('Ignores a negative Content-Length header', (done) => {
    const res = new IncomingMessage(new Socket());
    res.headers = { 'content-length': '-1' };
    const hasher = new Hasher(folder, [res]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.true;
    });
    hasher.on('end', done);
    hasher.on('error', done);
    res.push(Buffer.alloc(10));
    res.push(null);
  });

  it('Infers only the lengths that are missing', (done) => {
    const explicit = new stream.PassThrough();
    const file = fs.createReadStream(path.join(folder, 'click.jpg'));
    const hasher = new Hasher(folder, [
      { stream: explicit, path: 'explicit.txt', length: 10 },
      { stream: file, path: 'click.jpg' },
    ]);
    hasher.on('ready', () => {
      expect(hasher.unknownLengths).to.be.false;
      expect(hasher.files).to.deep.equal([
        { length: 10, path: ['explicit.txt'] },
        { length: 87582, path: ['click.jpg'] },
      ]);
    });
    hasher.on('end', done);
    hasher.on('error', done);
    explicit.end(Buffer.alloc(10));
  });
});
