// An in-thread worker (Batch 43): a WorkerHost served from the thread it is created on, behind the
// WorkerLike a WorkerPool talks to. The export worker's own frame and image services reach their
// decode handlers through it (no nested worker). Messages arrive on later microtasks, as across a
// worker boundary; transferables pass by reference. After `terminate` nothing is delivered and the
// frames and bitmaps of undelivered results are closed (P13).
import { closeTransferables, type FromWorker, type Method, type ToWorker } from "./protocol.js";
import { WorkerHost, type Handlers, type HostScope } from "./WorkerHost.js";
import type { WorkerLike } from "./WorkerPool.js";

export function loopbackWorker(handlers: Handlers, concurrency: number, immediate: ReadonlySet<Method> = new Set()): WorkerLike {
  const toPool: ((event: MessageEvent<FromWorker>) => void)[] = [];
  const toHost: ((event: MessageEvent<ToWorker>) => void)[] = [];
  let terminated = false;
  const scope: HostScope = {
    postMessage: (message) => {
      queueMicrotask(() => {
        if (terminated) {
          if (message.type === "result" || message.type === "progress") closeTransferables(message.value);
          return;
        }
        for (const listener of toPool) listener({ data: message } as MessageEvent<FromWorker>);
      });
    },
    addEventListener: (_type, listener) => {
      toHost.push(listener);
    },
  };
  new WorkerHost(scope, handlers, concurrency, immediate);
  function addEventListener(type: "message", listener: (event: MessageEvent<FromWorker>) => void): void;
  function addEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  function addEventListener(type: "message" | "error" | "messageerror", listener: ((event: MessageEvent<FromWorker>) => void) | ((event: Event) => void)): void {
    // An in-thread host never crashes as a worker does: its failures are request errors.
    if (type === "message") toPool.push(listener as (event: MessageEvent<FromWorker>) => void);
  }
  return {
    postMessage: (message) => {
      queueMicrotask(() => {
        if (terminated) return;
        for (const listener of toHost) listener({ data: message } as MessageEvent<ToWorker>);
      });
    },
    addEventListener,
    terminate: () => {
      terminated = true;
    },
  };
}
