/**
 * Creates a queue
 *
 * @param {Function(data, callback)} worker
 * @param {number|Function(workers, task)} concurrency
 * @return {Object}
 */
module.exports = (worker, concurrency) => {
  let workers = 0;
  const tasks = [];
  const q = {
    saturated: null,
    empty: null,
    drain: null,
    push(data, callback) {
      const length = tasks.push({ data, callback });
      if (q.saturated && concurrency(workers, null, length)) {
        q.saturated();
      }
      process.nextTick(q.process);
    },
    process() {
      if (tasks.length > 0) {
        const task = tasks.shift();
        if (q.concurrency(workers, task.data)) {
          if (q.empty && tasks.length === 0) q.empty();
          workers++;
          worker(task.data, (...args) => {
            workers--;
            if (task.callback) task.callback(...args);
            if (q.drain && tasks.length + workers === 0) {
              q.drain();
            } else {
              q.process();
            }
          });
        } else {
          return tasks.unshift(task);
        }
      }
    },
    length: () => tasks.length,
    running: () => workers,
    get concurrency() { return concurrency; },
    set concurrency(c) {
      if (typeof c !== 'function') {
        concurrency = (workers, task, length) => {
          return length ? length === c : workers < c;
        };
      } else {
        concurrency = c;
      }
    }
  };

  q.concurrency = concurrency;
  return q;
};
