from apps.core.serialization import to_jsonable


def payment_to_dict(payment):
    return to_jsonable(payment)
