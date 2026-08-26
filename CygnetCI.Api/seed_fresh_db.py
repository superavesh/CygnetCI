"""
Seed a FRESH CygnetCI database with the minimum reference data the app needs.

Run this ONCE after the API has created the tables (the API calls
`Base.metadata.create_all` on startup). It is idempotent — safe to re-run.

Seeds:
  1. roles         -> Administrator (full), Developer, Viewer   [required for RBAC]
  2. customers     -> one "default" customer                    [agents/users reference it]
  3. environments  -> Development, QA, Staging, Production       [required for releases]
  4. users         -> one admin superuser (bcrypt password)     [needed to log in]
  5. user_roles    -> admin -> Administrator
  6. user_customers-> admin -> default customer (is_default)

Usage:
    python seed_fresh_db.py
Optionally override the admin credentials via environment variables:
    ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
"""
import os
import sys
import bcrypt

# Embeddable Python (._pth) does not add the script's own directory to sys.path
# when run by path, so ensure local modules (database, models, config) import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
import models

# Ensure tables exist even if the API hasn't been started yet.
Base.metadata.create_all(bind=engine)

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@cygnetci.local")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# ---- Reference data ------------------------------------------------------

ROLES = [
    {
        "name": "Administrator",
        "description": "Full system access",
        "is_system": True,
        "permissions": {
            "roles": ["create", "read", "update", "delete"],
            "users": ["create", "read", "update", "delete"],
            "agents": ["create", "read", "update", "delete"],
            "releases": ["create", "read", "update", "delete", "deploy"],
            "pipelines": ["create", "read", "update", "delete", "execute"],
            "monitoring": ["read", "update"],
            "overview": ["read", "update"],
            "transfer": ["create", "read", "delete"],
            "rollback": ["create", "read", "execute", "delete"],
            "customers": ["create", "read", "update", "delete"],
            "tasks": ["read", "delete"],
            "tickets": ["create", "read", "update", "delete"],
            "services": ["create", "read", "update", "delete"],
            "email": ["create", "read", "update", "delete"],
        },
    },
    {
        "name": "Developer",
        "description": "Can manage pipelines and releases",
        "is_system": True,
        "permissions": {
            "agents": ["read"],
            "releases": ["create", "read", "update", "deploy"],
            "pipelines": ["create", "read", "update", "delete", "execute"],
            "monitoring": ["read"],
            "overview": ["read"],
            "transfer": ["create", "read"],
            "rollback": ["create", "read", "execute"],
            "tasks": ["read"],
            "tickets": ["create", "read", "update"],
            "services": ["read"],
        },
    },
    {
        "name": "Viewer",
        "description": "Read-only access",
        "is_system": True,
        "permissions": {
            "agents": ["read"],
            "releases": ["read"],
            "pipelines": ["read"],
            "monitoring": ["read"],
            "overview": ["read"],
            "transfer": ["read"],
            "rollback": ["read"],
            "tasks": ["read"],
            "tickets": ["read"],
            "services": ["read"],
            "email": ["read"],
        },
    },
]

ENVIRONMENTS = [
    {"name": "Development", "description": "Development environment for testing", "order_index": 1, "requires_approval": False},
    {"name": "QA", "description": "Quality Assurance environment", "order_index": 2, "requires_approval": False},
    {"name": "Staging", "description": "Staging environment for pre-production testing", "order_index": 3, "requires_approval": True},
    {"name": "Production", "description": "Production environment", "order_index": 4, "requires_approval": True},
]

DEFAULT_CUSTOMER = {
    "name": "default",
    "display_name": "Default Customer",
    "description": "Default tenant created during initial setup",
    "is_active": True,
}


def main():
    db = SessionLocal()
    try:
        # 1) Roles
        role_by_name = {}
        for r in ROLES:
            existing = db.query(models.Role).filter(models.Role.name == r["name"]).first()
            if existing:
                role_by_name[r["name"]] = existing
                print(f"[=] Role exists: {r['name']}")
            else:
                role = models.Role(**r)
                db.add(role)
                db.flush()
                role_by_name[r["name"]] = role
                print(f"[+] Created role: {r['name']}")

        # 2) Default customer
        customer = db.query(models.Customer).filter(models.Customer.name == DEFAULT_CUSTOMER["name"]).first()
        if not customer:
            customer = models.Customer(**DEFAULT_CUSTOMER)
            db.add(customer)
            db.flush()
            print(f"[+] Created customer: {customer.display_name}")
        else:
            print(f"[=] Customer exists: {customer.display_name}")

        # 3) Environments
        for e in ENVIRONMENTS:
            existing = db.query(models.Environment).filter(models.Environment.name == e["name"]).first()
            if existing:
                print(f"[=] Environment exists: {e['name']}")
            else:
                db.add(models.Environment(**e))
                print(f"[+] Created environment: {e['name']}")

        # 4) Admin user
        admin = db.query(models.User).filter(models.User.username == ADMIN_USERNAME).first()
        if not admin:
            pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            admin = models.User(
                username=ADMIN_USERNAME,
                email=ADMIN_EMAIL,
                full_name="System Administrator",
                password_hash=pw_hash,
                is_active=True,
                is_superuser=True,
            )
            db.add(admin)
            db.flush()
            print(f"[+] Created admin user: {ADMIN_USERNAME} (password: {ADMIN_PASSWORD})")
        else:
            print(f"[=] Admin user exists: {ADMIN_USERNAME}")

        # 5) admin -> Administrator role
        admin_role = role_by_name.get("Administrator")
        if admin_role:
            link = db.query(models.UserRole).filter(
                models.UserRole.user_id == admin.id,
                models.UserRole.role_id == admin_role.id,
            ).first()
            if not link:
                db.add(models.UserRole(user_id=admin.id, role_id=admin_role.id))
                print("[+] Linked admin -> Administrator role")

        # 6) admin -> default customer (default)
        uc = db.query(models.UserCustomer).filter(
            models.UserCustomer.user_id == admin.id,
            models.UserCustomer.customer_id == customer.id,
        ).first()
        if not uc:
            db.add(models.UserCustomer(user_id=admin.id, customer_id=customer.id, is_default=True))
            print("[+] Linked admin -> default customer")

        db.commit()
        print("\n[SUCCESS] Fresh database seeded.")
        print(f"    Login with: {ADMIN_USERNAME} / {ADMIN_PASSWORD}")
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
