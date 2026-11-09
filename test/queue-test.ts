import { expect } from 'chai';
import queue from '../src/queue';

describe('Queue', () => {
  it('Processes tasks with numeric concurrency', (done) => {
    const results: number[] = [];
    const q = queue<number>((task, cb) => {
      results.push(task);
      setTimeout(cb, 10);
    }, 2);

    expect(q.concurrency).to.be.a('function');
    expect(q.length()).to.equal(0);
    expect(q.running()).to.equal(0);

    q.push(1);
    q.push(2);
    q.push(3);

    q.drain = () => {
      expect(results).to.deep.equal([1, 2, 3]);
      expect(q.length()).to.equal(0);
      expect(q.running()).to.equal(0);
      done();
    };
  });

  it('Supports custom function concurrency and saturated/empty events', (done) => {
    let saturatedCalled = false;
    let emptyCalled = false;
    let customConcurrencyChecked = false;

    const concurrencyFn = (
      workers: number,
      _task?: string | null,
      length?: number,
    ) => {
      customConcurrencyChecked = true;
      return length ? length >= 2 : workers < 1;
    };

    const q = queue<string>((_task, cb) => {
      setTimeout(cb, 20);
    }, concurrencyFn);

    expect(q.concurrency).to.equal(concurrencyFn);

    q.saturated = () => {
      saturatedCalled = true;
    };

    q.empty = () => {
      emptyCalled = true;
    };

    q.push('a');
    q.push('b');

    expect(saturatedCalled).to.be.true;

    q.drain = () => {
      expect(emptyCalled).to.be.true;
      expect(customConcurrencyChecked).to.be.true;
      done();
    };
  });

  it('Unshifts task if concurrency check fails during process', (done) => {
    let allowed = false;
    const processed: string[] = [];

    const q = queue<string>((task, cb) => {
      processed.push(task);
      cb();
    }, 1);

    // Override concurrency to simulate rejection on first try
    q.concurrency = () => allowed;

    q.push('task1');

    setTimeout(() => {
      expect(processed).to.deep.equal([]);
      expect(q.length()).to.equal(1);
      allowed = true;
      q.process();
    }, 15);

    q.drain = () => {
      expect(processed).to.deep.equal(['task1']);
      done();
    };
  });

  it('Calls task callback with worker arguments', (done) => {
    const q = queue<number, number>((task, cb) => {
      cb(null, task * 2);
    }, 1);

    q.push(5, (err, res) => {
      expect(err).to.be.null;
      expect(res).to.equal(10);
      done();
    });
  });

  it('Allows updating concurrency dynamically', () => {
    const q = queue<null>(() => {}, 1);
    (q as unknown as { concurrency: number }).concurrency = 4;
    expect(q.concurrency(2, null, 0)).to.be.true;
    expect(q.concurrency(4, null, 0)).to.be.false;
    expect(q.concurrency(0, null, 4)).to.be.true;
    expect(q.concurrency(0, null, 3)).to.be.false;

    const customFn = (w: number) => w < 10;
    q.concurrency = customFn;
    expect(q.concurrency).to.equal(customFn);
  });
});
