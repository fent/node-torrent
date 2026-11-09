export type ConcurrencyFn<T> = (
  workers: number,
  task?: T | null,
  length?: number,
) => boolean;

export type WorkerCallback<R = unknown> = (err?: Error | null, res?: R) => void;
export type WorkerFn<T, R = unknown> = (
  data: T,
  callback: WorkerCallback<R>,
) => void;

export interface Queue<T, R = unknown> {
  saturated: (() => void) | null;
  empty: (() => void) | null;
  drain: (() => void) | null;
  push(data: T, callback?: WorkerCallback<R>): void;
  process(): void;
  length(): number;
  running(): number;
  concurrency: ConcurrencyFn<T>;
}

/**
 * Creates a queue
 */
const createQueue = <T, R = unknown>(
  worker: WorkerFn<T, R>,
  initialConcurrency: number | ConcurrencyFn<T>,
): Queue<T, R> => {
  let workers = 0;
  let concurrency: ConcurrencyFn<T>;
  const tasks: Array<{ data: T; callback?: WorkerCallback<R> }> = [];

  const q = {
    saturated: null as (() => void) | null,
    empty: null as (() => void) | null,
    drain: null as (() => void) | null,
    push(data: T, callback?: WorkerCallback<R>) {
      const length = tasks.push({ data, callback });
      if (q.saturated && concurrency(workers, null, length)) {
        q.saturated();
      }
      process.nextTick(q.process);
    },
    process() {
      const task = tasks.shift();
      if (!task) return;
      if (q.concurrency(workers, task.data)) {
        if (q.empty && tasks.length === 0) q.empty();
        workers++;
        worker(task.data, (err?: Error | null, res?: R) => {
          workers--;
          if (task.callback) task.callback(err, res);
          if (q.drain && tasks.length + workers === 0) {
            q.drain();
          } else {
            q.process();
          }
        });
      } else {
        tasks.unshift(task);
      }
    },
    length: () => tasks.length,
    running: () => workers,
    get concurrency(): ConcurrencyFn<T> {
      return concurrency;
    },
    set concurrency(c: number | ConcurrencyFn<T>) {
      if (typeof c !== 'function') {
        concurrency = (w: number, _task?: T | null, length?: number) => {
          return length ? length === c : w < c;
        };
      } else {
        concurrency = c;
      }
    },
  };

  q.concurrency = initialConcurrency;
  return q;
};

export default createQueue;
