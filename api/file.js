import { createCloudStore } from "../server/cloud-store.js";
import { handleFileDownload } from "../server/handlers.js";

export async function GET(request) {
  try {
    const store = await createCloudStore();
    return handleFileDownload(request, store);
  } catch (error) {
    return Response.json({ ok: false, message: error?.message || "Arquivo indisponível." }, { status: Number(error?.status) || 503 });
  }
}
