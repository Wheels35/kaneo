import { useState } from "react";

/** Shows a switch's new value while its save is in flight, then the saved one. */
export function usePendingToggle(
  saved: boolean,
  save: (value: boolean) => Promise<void>,
) {
  const [pending, setPending] = useState<boolean | null>(null);

  const toggle = async (value: boolean) => {
    setPending(value);
    try {
      await save(value);
    } finally {
      setPending(null);
    }
  };

  return [pending ?? saved, toggle] as const;
}
