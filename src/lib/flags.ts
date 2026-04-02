import "server-only";

export const showResonanceMatrix = async () => {
  const raw = process.env.SHOW_RESONANCE_MATRIX;
  if (raw === undefined) return true;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};
