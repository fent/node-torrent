async = require 'async'

concurrency = true
q = async.queue (task, callback) ->
  console.log 'running task ' + task.n
  concurrency = false
  setTimeout ->
    concurrency = true
    callback()
  , 1000
, (workers, task) ->
  console.log workers
  console.log task
  console.log concurrency
  concurrency
q.drain = ->
  console.log 'finished'
f = (err) -> throw err if err
q.push { n: 1 }, f
q.push { n: 2, err: true }, f
q.push { n: 3 }, f
q.push { n: 4 }, f
