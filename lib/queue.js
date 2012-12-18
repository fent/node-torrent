/**
 * Creates a queue
 *
 * @param (function(data, callback) worker
 * @param (number|function(workers, task)) concurrency
 * @return (Object)
 */
module.exports = function(worker, concurrency) {
  var workers = 0;
  var tasks = [];
  var q = {
      saturated: null
    , empty: null
    , drain: null
    , push: function(data, callback) {
        var length = tasks.push({
          data: data,
          callback: callback
        });
        if (q.saturated && concurrency(workers, null, length)) {
          q.saturated();
        }
        process.nextTick(q.process);
      }
    , process: function() {
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
      }
    , length: function() {
        return tasks.length;
      }
    , running: function() {
        return workers;
      }
  };

  q.__defineGetter__('concurrency', function() { return concurrency; });
  q.__defineSetter__('concurrency', function(c) {
    if (typeof c !== 'function') {
      concurrency = function(workers, task, length) {
        return length ? length === c : workers < c;
      };
    } else {
      concurrency = c;
    }
  });

  q.concurrency = concurrency;
  return q;
};
