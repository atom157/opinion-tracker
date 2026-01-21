import { handleOptions, getApiKey, fetchJson, ok, fail } from "./_utils.js";

export default async function handler(req, res){
  if (handleOptions(req, res)) return;

  const address = (req.query.address || "").toString().trim();
  if (!address) return fail(res, 400, "Address is required. Use ?address=0x...");
  const apiKey = getApiKey();

  // If user configured env var in Vercel, we use it. If not, we still attempt (some deployments may be whitelisted).
  const page = Number(req.query.page || 1) || 1;
  const limit = Number(req.query.limit || 200) || 200;

  const url = `https://openapi.opinion.trade/openapi/position/user/${encodeURIComponent(address)}?page=${page}&limit=${limit}`;

  try{
    const { status, json } = await fetchJson(url, apiKey);

    // pass-through on success; normalize older format used by the frontend (errno/result)
    if (json && typeof json === "object" && "code" in json){
      if (json.code === 0){
        return ok(res, { errno: 0, errmsg: "", result: json.data });
      }
      return ok(res, { errno: json.code, errmsg: json.msg || "Request failed", result: null });
    }

    // fallback
    if (status >= 200 && status < 300) return ok(res, json);
    return fail(res, status, "Upstream request failed", { upstream: json });
  } catch (e){
    return fail(res, 500, e?.message || "Server error");
  }
}
