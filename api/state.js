import { createCloudStore } from "../server/cloud-store.js";
import { handleState } from "../server/handlers.js";

async function run(request) {
  try {
    const store = await createCloudStore();
    return handleState(request, store);
  } catch (error) {
    return Response.json({ ok: false, message: error?.message || "Banco indisponível." }, { status: Number(error?.status) || 503 });
  }
}

export const GET = run;
export const PUT = run;
