
  module.exports = function(worker, concurrency) {
    var q, tasks, workers;
    workers = 0;
    tasks = [];
    q = {
      saturated: null,
      empty: null,
      drain: null,
      push: function(data, callback) {
        var length;
        length = tasks.push({
          data: data,
          callback: callback
        });
        if (q.saturated && concurrency(workers, null, length)) q.saturated();
        return process.nextTick(q.process);
      },
      process: function() {
        var task;
        task = tasks.shift();
        if (q.concurrency(workers, task.data)) {
          if (q.empty && tasks.length === 0) q.empty();
          workers += 1;
          return worker(task.data, function() {
            workers--;
            if (task.callback) task.callback.apply(task, arguments);
            if (q.drain && tasks.length + workers === 0) {
              return q.drain();
            } else if (tasks.length) {
              return q.process();
            }
          });
        } else {
          return tasks.unshift(task);
        }
      },
      length: function() {
        return tasks.length;
      },
      running: function() {
        return workers;
      }
    };
    q.__defineGetter__('concurrency', function() {
      return concurrency;
    });
    q.__defineSetter__('concurrency', function(c) {
      if (typeof c !== 'function') {
        return concurrency = function(workers, task, length) {
          var _ref;
          if (length) {
            return (_ref = length === c) != null ? _ref : {
              "true": false
            };
          }
          return workers < c;
        };
      } else {
        return concurrency = c;
      }
    });
    q.concurrency = concurrency;
    return q;
  };
