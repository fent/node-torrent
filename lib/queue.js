/**
 * Creates a queue
 *
 * @param {Function(data, callback)} worker
 * @param {Number|Function(workers, task)} concurrency
 * @return {Object}
 */
module.exports = (worker, concurrency) => {
  var workers = 0;
  var tasks = [];
  var q = {
    saturated: null,
    empty: null,
    drain: null,
    push: (data, callback) => {
      var length = tasks.push({ data, callback });
      if (q.saturated && concurrency(workers, null, length)) {
        q.saturated();
      }
      process.nextTick(q.process);
    },
    process: () => {
      if (tasks.length > 0) {
        var task = tasks.shift();
        if (q.concurrency(workers, task.data)) {
          if (q.empty && tasks.length === 0) q.empty();
          workers++;
          worker(task.data, function() {
            workers--;
            if (task.callback) task.callback.apply(task, arguments);
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
  };

  q.__defineGetter__('concurrency', () => concurrency);
  q.__defineSetter__('concurrency', (c) => {
    if (typeof c !== 'function') {
      concurrency = (workers, task, length) => {
        return length ? length === c : workers < c;
      };
    } else {
      concurrency = c;
    }
  });

  q.concurrency = concurrency;
  return q;
};
