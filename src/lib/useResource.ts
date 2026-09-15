import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { errorMessage } from "./errors";
// Screens pass a useCallback loader. Ignore stale completions after navigation.
export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    // Only the newest refresh may update state if network responses arrive out of order.
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const value = await loader();
      if (current === generation.current) setData(value);
    } catch (e) {
      if (current === generation.current) {
        setError(errorMessage(e));
        setData(null);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(
    // Returning from an upload/post/apply screen reloads data without a global refresh bus.
    useCallback(() => {
      void refresh();
      return () => {
        generation.current++;
      };
    }, [refresh]),
  );
  return { data, loading, error, refresh };
}
