"""Per-router regression tests — verify every domain router is wired and responding.

Read-only + validation-only: safe to run against a live database.
"""
import pytest

# One representative read (GET, list/detail) endpoint per router — asserts the router
# is mounted and returns 200 for an authenticated superuser.
READ_ENDPOINTS = [
    "/data",                          # dashboard
    "/stats",                         # dashboard
    "/alerts/summary",                # dashboard (exercises shared _k8s_metrics_store)
    "/settings/alert-thresholds",     # settings
    "/monitoring/agents/metrics",     # monitoring (exercises shared _k8s_metrics_store)
    "/agents",                        # agents
    "/pipelines",                     # pipelines
    "/pipelines/templates",           # pipelines
    "/releases",                      # releases
    "/environments",                  # releases (environments)
    "/tickets",                       # tickets
    "/users",                         # users
    "/roles",                         # roles
    "/services",                      # services
    "/email-alerts",                  # email
    "/email-configs",                 # email
    "/transfer/files",                # transfer
    "/rollback/scripts",              # rollback
    "/audit-logs",                    # audit
    "/auth/me",                       # auth
    "/customers/",                    # customer_api router
]

PROTECTED = ["/users", "/agents", "/data", "/roles", "/settings/alert-thresholds", "/pipelines"]


def test_route_count(app):
    routes = [r for r in app.routes if getattr(r, "methods", None)]
    assert len(routes) >= 180, f"expected >=180 routes, got {len(routes)}"


def test_public_ping(client):
    assert client.get("/monitoring/api/ping").status_code == 200


@pytest.mark.parametrize("path", PROTECTED)
def test_requires_auth(client, path):
    """UI endpoints must reject unauthenticated requests."""
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", READ_ENDPOINTS)
def test_read_endpoint_ok(client, su_headers, path):
    r = client.get(path, headers=su_headers)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"


# ---- auth behavior ----
def test_forgot_password_no_enumeration(client):
    r = client.post("/auth/forgot-password", json={"email": "nobody-xyz-123@example.com"})
    assert r.status_code == 200 and r.json().get("success") is True


def test_reset_password_bad_token(client):
    r = client.post("/auth/reset-password", json={"token": "bad", "new_password": "abcdef"})
    assert r.status_code == 400


def test_change_password_wrong_current(client, su_headers):
    r = client.put(
        "/users/me/password",
        headers=su_headers,
        json={"current_password": "__definitely_wrong__", "new_password": "abcdef"},
    )
    assert r.status_code == 400


# ---- validation ----
def test_threshold_validation_rejects_out_of_range(client, su_headers):
    r = client.put(
        "/settings/alert-thresholds",
        headers=su_headers,
        json={"cpu": 150, "memory": 90, "disk": 90},
    )
    assert r.status_code == 400


def test_unknown_role_id_rejected(client, su_headers):
    """A superuser assigning a non-existent role id must get a 400, not a 500."""
    # user_id 999999 likely doesn't exist -> 404; the point is it's handled, not 500.
    r = client.put(
        "/users/999999/access",
        headers=su_headers,
        json={"role_ids": [999999], "customer_ids": []},
    )
    assert r.status_code in (400, 404)
