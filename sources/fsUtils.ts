export async function mutex<T>(p: string, cb: () => Promise<T>) {
  return await cb();
}
