from .models import AuditLog


def write_audit(request, action, target, details=None):
    """Direct port of server/src/utils/audit.js#writeAudit. Never throws —
    auditing must not break the operation it records."""
    try:
        auth = getattr(request, "user", None)
        AuditLog(
            actor=getattr(auth, "sub", None),
            actorEmail=getattr(auth, "email", "") or "",
            actorRole=getattr(auth, "role", "") or "",
            action=action,
            target=target,
            details=details or {},
            ip=request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR") or "",
            userAgent=request.META.get("HTTP_USER_AGENT") or "",
        ).save()
    except Exception:
        pass
