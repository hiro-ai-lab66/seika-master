export type SerialTaskQueue = {
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

export const createSerialTaskQueue = (): SerialTaskQueue => {
  let tail: Promise<void> = Promise.resolve();

  return {
    run: <T>(task: () => Promise<T>) => {
      const result = tail.then(task, task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    }
  };
};
