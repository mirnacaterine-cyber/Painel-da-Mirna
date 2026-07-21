import { createCloudStore } from "../server/cloud-store.js";
import { handleFiles } from "../server/handlers.js";

async function run(request) {
  try {
    const store = await createCloudStore();
    return handleFiles(request, store);
  } catch (error) {
    return Response.json(
      { ok: false, message: error?.message || "Arquivos indisponíveis." },
      { status: Number(error?.status) || 503 }
    );
  }
}

export const GET = run;
export const PATCH = run;
export const DELETE = run;