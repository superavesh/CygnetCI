"""Shared test doubles for pure unit tests of release_service.py / pipeline_service.py.

These services no longer call db.query(...) directly (Phase 3 moved every
query into agent_repository/pipeline_repository/release_repository) — the
only things they do with `db` are add()/flush()/commit(). That means a real
database is not needed to unit-test their business logic at all: mock the
repository functions to return fake domain objects, and use FakeSession below
in place of a SQLAlchemy Session.
"""


class FakeSession:
    """Minimal stand-in for a SQLAlchemy Session. Assigns sequential ids to
    added objects on flush()/commit() (mimicking autoincrement), and otherwise
    does nothing — no real persistence, no DB connection."""

    def __init__(self):
        self.added = []
        self.committed = False
        self._next_id = 1

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id
                self._next_id += 1

    def commit(self):
        self.flush()
        self.committed = True

    def refresh(self, obj):
        pass

    def query(self, *args, **kwargs):
        raise AssertionError(
            "Service code called db.query() directly — it should go through "
            "a repository module instead (see agent_repository.py, "
            "pipeline_repository.py, release_repository.py)."
        )


class Fake:
    """Generic attribute bag standing in for an ORM model instance, for
    objects that unit tests fetch via a mocked repository (as opposed to
    objects the service constructs itself, which are real model instances)."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
