import re

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?\d[\d\s-]{6,}$")


def strong_password(value):
    v = str(value or "")
    if len(v) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        return "Password must include both letters and numbers."
    return None


def validate_register(data):
    errors = []
    name = str(data.get("name", "")).strip()
    if not (2 <= len(name) <= 60):
        errors.append({"msg": "Name must be between 2 and 60 characters.", "param": "name"})

    email = str(data.get("email", "")).strip()
    if not EMAIL_RE.match(email):
        errors.append({"msg": "Enter a valid email address.", "param": "email"})

    pw_error = strong_password(data.get("password"))
    if pw_error:
        errors.append({"msg": pw_error, "param": "password"})

    phone = data.get("phone")
    if phone and not (8 <= len(str(phone)) <= 20):
        errors.append({"msg": "Phone number must be between 8 and 20 digits.", "param": "phone"})

    return errors


def validate_login(data):
    errors = []
    raw = str(data.get("identifier") or data.get("email") or "").strip()
    if len(raw) < 3:
        errors.append({"msg": "Enter your email or mobile number.", "param": "identifier"})
    else:
        is_email = "@" in raw
        if is_email and not EMAIL_RE.match(raw):
            errors.append({"msg": "Enter a valid email address.", "param": "identifier"})
        elif not is_email and not PHONE_RE.match(raw):
            errors.append({"msg": "Enter a valid mobile number.", "param": "identifier"})

    password = str(data.get("password", ""))
    if len(password) < 8:
        errors.append({"msg": "Password must be at least 8 characters.", "param": "password"})

    remember_me = data.get("rememberMe")
    if remember_me is not None and not isinstance(remember_me, bool):
        errors.append({"msg": "Remember me must be true or false.", "param": "rememberMe"})

    return errors


def validate_email_field(data):
    email = str(data.get("email", "")).strip()
    if not EMAIL_RE.match(email):
        return [{"msg": "Enter a valid email address.", "param": "email"}]
    return []


def validate_reset(data):
    errors = []
    token = str(data.get("token", ""))
    if len(token) < 20:
        errors.append({"msg": "Reset token is missing or invalid.", "param": "token"})
    pw_error = strong_password(data.get("password"))
    if pw_error:
        errors.append({"msg": pw_error, "param": "password"})
    return errors


def validate_verify_email(data):
    token = str(data.get("token", ""))
    if len(token) < 20:
        return [{"msg": "Verification token is missing or invalid.", "param": "token"}]
    return []


def validate_change_password(data):
    errors = []
    current = str(data.get("currentPassword", ""))
    if len(current) < 8:
        errors.append({"msg": "Current password must be at least 8 characters.", "param": "currentPassword"})
    pw_error = strong_password(data.get("newPassword"))
    if pw_error:
        errors.append({"msg": pw_error, "param": "newPassword"})
    return errors


def validate_update_profile(data):
    errors = []
    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if name and not (2 <= len(name) <= 60):
            errors.append({"msg": "Name must be between 2 and 60 characters.", "param": "name"})
    phone = data.get("phone")
    if phone and not (8 <= len(str(phone)) <= 20):
        errors.append({"msg": "Phone number must be between 8 and 20 digits.", "param": "phone"})
    return errors
