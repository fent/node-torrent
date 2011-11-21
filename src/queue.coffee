module.exports = (worker, concurrency) ->
  workers = 0
  tasks = []
  q =
    saturated: null
    empty: null
    drain: null
    push: (data, callback) ->
      length = tasks.push { data: data, callback: callback }
      if q.saturated and concurrency(workers, null, length)
        q.saturated()
      process.nextTick(q.process)

    process: ->
      task = tasks.shift()
      if q.concurrency(workers, task.data)
        if q.empty && tasks.length == 0
          q.empty()
        workers += 1
        worker task.data, ->
          workers--
          if task.callback
            task.callback.apply(task, arguments)
          if q.drain and tasks.length + workers == 0
            q.drain()
          else if tasks.length
            q.process()
      else
        tasks.unshift(task)

    length: -> tasks.length
    running: -> workers

  q.__defineGetter__ 'concurrency', -> concurrency
  q.__defineSetter__ 'concurrency', (c) ->
    if typeof c isnt 'function'
      concurrency = (workers, task, length) ->
        if length
          return length == c ? true : false
        return workers < c
    else
      concurrency = c
  q.concurrency = concurrency
  q
