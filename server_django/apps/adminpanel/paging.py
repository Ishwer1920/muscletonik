from datetime import datetime, time, timezone


def paging(request, max_limit=10000):
    page = max(1, int(request.query_params.get("page") or 1))
    limit = min(max_limit, max(1, int(request.query_params.get("limit") or 20)))
    return page, limit, (page - 1) * limit


def build_sort(request, allowed, default="-createdAt"):
    key = request.query_params.get("sort") or ""
    if key not in allowed:
        return default
    direction = "" if (request.query_params.get("dir") or "").lower() == "asc" else "-"
    return f"{direction}{key}"


def date_range_raw(request, field="createdAt"):
    out = {}
    frm = request.query_params.get("from")
    to = request.query_params.get("to")
    if frm:
        out["$gte"] = datetime.fromisoformat(frm).replace(tzinfo=timezone.utc)
    if to:
        d = datetime.fromisoformat(to)
        out["$lte"] = datetime.combine(d.date(), time(23, 59, 59, 999000), tzinfo=timezone.utc)
    return {field: out} if out else None
