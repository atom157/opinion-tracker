import { handleOptions, getApiKey, fetchJson, ok, fail } from "./_utils.js";

export default async function handler(req, res){
  if (handleOptions(req, res)) return;

  const marketId = (req.query.marketId || req.query.id || "").toString().trim();
  if (!marketId) return fail(res, 400, "Market ID is required. Use ?marketId=123");
  const apiKey = getApiKey();

  const base = "https://openapi.opinion.trade/openapi/market";
  const url1 = `${base}/${encodeURIComponent(marketId)}`;
  const url2 = `${base}/categorical/${encodeURIComponent(marketId)}`;

  try{
    // Try binary first
    let r1 = await fetchJson(url1, apiKey);
    let j1 = r1.json;

    if (j1 && typeof j1 === "object" && "code" in j1 && j1.code !== 0){
      // fallback to categorical
      const r2 = await fetchJson(url2, apiKey);
      const j2 = r2.json;
      if (j2 && typeof j2 === "object" && "code" in j2){
        if (j2.code === 0) return ok(res, { errno: 0, errmsg: "", result: j2.data });
        return ok(res, { errno: j2.code, errmsg: j2.msg || "Request failed", result: null });
      }
      if (r2.status >= 200 && r2.status < 300) return ok(res, j2);
      return fail(res, r2.status, "Upstream request failed", { upstream: j2 });
    }

    if (j1 && typeof j1 === "object" && "code" in j1){
      if (j1.code === 0) return ok(res, { errno: 0, errmsg: "", result: j1.data });
      return ok(res, { errno: j1.code, errmsg: j1.msg || "Request failed", result: null });
    }

    if (r1.status >= 200 && r1.status < 300) return ok(res, j1);
    return fail(res, r1.status, "Upstream request failed", { upstream: j1 });

  } catch (e){
    return fail(res, 500, e?.message || "Server error");
  }
}
