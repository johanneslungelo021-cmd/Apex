<<<<<<< HEAD
export const showResonanceMatrix = async () => {
  const raw = process.env.SHOW_RESONANCE_MATRIX;
  if (raw === undefined) return true;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};
=======
import 'server-only';

export const showResonanceMatrix = async () => {
  // This is a server-only flag that can be used to toggle features
  return true;
};
>>>>>>> 097c105623b61ee771be9fab160cbbefb0fc1705
