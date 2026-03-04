export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
  backoff: number = 2,
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }

      console.warn(
        `Retry attempt ${attempt}/${retries} failed. Retrying in ${delay}ms...`,
        (error as Error).message,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= backoff;
    }
  }
  throw new Error("Max retries exceeded");
}
