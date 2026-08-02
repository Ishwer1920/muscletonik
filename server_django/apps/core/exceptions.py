from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status as http_status


class ApiError(Exception):
    """Raise with a status code + message, mirroring Express's
    `const err = new Error(msg); err.statusCode = 400; throw err;` pattern."""

    def __init__(self, message, status_code=400, errors=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.errors = errors


def _validation_errors_from_drf(detail):
    """Flatten DRF's {field: [msgs]} / [msgs] validation detail into the
    express-validator-shaped list the frontend expects: [{msg, param}, ...]."""
    errors = []
    if isinstance(detail, dict):
        for field, msgs in detail.items():
            if isinstance(msgs, (list, tuple)):
                for msg in msgs:
                    errors.append({"msg": str(msg), "param": field})
            else:
                errors.append({"msg": str(msgs), "param": field})
    elif isinstance(detail, (list, tuple)):
        for msg in detail:
            errors.append({"msg": str(msg)})
    else:
        errors.append({"msg": str(detail)})
    return errors


def exception_handler(exc, context):
    if isinstance(exc, ApiError):
        body = {"message": exc.message}
        if exc.errors:
            body["errors"] = exc.errors
        return Response(body, status=exc.status_code)

    response = drf_exception_handler(exc, context)
    if response is None:
        import logging
        logging.getLogger("django").exception("Unhandled exception", exc_info=exc)
        return Response(
            {"message": "Something went wrong. Please try again."},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if response.status_code == http_status.HTTP_400_BAD_REQUEST and isinstance(response.data, (dict, list)):
        response.data = {
            "message": "Validation failed",
            "errors": _validation_errors_from_drf(response.data),
        }
        return response

    detail = response.data.get("detail") if isinstance(response.data, dict) else None
    response.data = {"message": str(detail) if detail is not None else "Request failed"}
    return response
