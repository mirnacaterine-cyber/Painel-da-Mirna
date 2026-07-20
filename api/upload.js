import { createCloudStore } from "../server/cloud-store.js";
import { handleUpload } from "../server/handlers.js";

export async function POST(request) {
  try {
    const store = await createCloudStore();
    return handleUpload(request, store);
  } catch (error) {
    return Response.json({ ok: false, message: error?.message || "Armazenamento indisponível." }, { status: Number(error?.status) || 503 });
  }
}
