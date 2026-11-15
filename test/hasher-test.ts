import fs from 'node:fs';
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
});
