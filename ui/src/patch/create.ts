import { api, errorMessage } from '../api/client';
import type { PatchPayload } from '../api/gen/PatchPayload';
import { useToast } from '../ui/toastStore';

/** Saves a patch through the folder picker (never overwriting), and says where it went. */
export async function savePatch(pending: Promise<PatchPayload>): Promise<void> {
  const toast = useToast.getState().show;
  try {
    const patch = await pending;
    const path = await api.saveExport(patch.name, patch.text);
    if (path) toast(`Saved ${path}`);
  } catch (e) {
    toast(errorMessage(e), { error: true });
  }
}
