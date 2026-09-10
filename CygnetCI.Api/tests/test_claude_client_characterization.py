"""Tests for the consolidated Anthropic adapter (claude_client.py) and its three
call sites: claude_service.py (rollback script analysis), and routers/tickets.py's
ai_chat (streaming) and ai_assist (tool-use loop).

These replace 3 previously-separate integration points (1 SDK-based, 2 raw
httpx) that had zero test coverage. No real network calls are made — the
Anthropic API boundary (claude_client.create_message / stream_text) is mocked
directly with unittest.mock, verifying each call site preserves the exact
output contract it sent to its caller (our own frontend, in the HTTP cases)
before the consolidation.

DB-touching tests use the db_session fixture's rolled-back transaction (see
conftest.py) — nothing here is ever committed to the real database.
"""
import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

import models
from database import get_db
from routers.tickets import _encrypt


class _FakeBlock:
    """Stand-in for an SDK content-block (TextBlock/ToolUseBlock) — only
    implements what the calling code actually touches."""

    def __init__(self, **kwargs):
        self._data = kwargs
        for k, v in kwargs.items():
            setattr(self, k, v)

    def model_dump(self):
        return dict(self._data)


class _FakeMessage:
    def __init__(self, content, stop_reason=None):
        self.content = content
        self.stop_reason = stop_reason
        self.id = "msg_fake"
        self.model = "claude-3-5-sonnet-20241022"


@pytest.fixture
def client_with_rolled_back_db(client, db_session):
    from main import app
    app.dependency_overrides[get_db] = lambda: db_session
    yield client
    app.dependency_overrides.pop(get_db, None)


def _make_customer(db):
    customer = models.Customer(name=f"test-customer-{uuid.uuid4().hex[:8]}", display_name="Test Customer")
    db.add(customer)
    db.flush()
    return customer


def _make_ai_settings(db, customer_id, api_key="fake-anthropic-key"):
    settings = models.AISettings(
        provider="anthropic",
        model="claude-3-5-sonnet-20241022",
        api_key_encrypted=_encrypt(api_key),
        customer_id=customer_id,
    )
    db.add(settings)
    db.flush()
    return settings


# ---------------------------------------------------------------------------
# claude_service.py — rollback script analysis (one-shot, non-streaming)
# ---------------------------------------------------------------------------

def test_analyze_database_script_parses_markdown_fenced_json():
    import claude_service

    fake_message = _FakeMessage(content=[SimpleNamespace(
        type="text",
        text='```json\n{"DbDetails": [{"DbName": "mydb", "TableNames": ["orders"]}]}\n```'
    )])

    with patch("claude_service.claude_client.create_message", new=AsyncMock(return_value=fake_message)) as mock_create:
        service = claude_service.ClaudeAIService()
        result = asyncio.run(service.analyze_database_script("CREATE TABLE orders (id int);"))

    assert result == {"DbDetails": [{"DbName": "mydb", "TableNames": ["orders"]}]}
    # Confirms the service delegates to the shared adapter with its configured
    # model/key, rather than constructing its own SDK client.
    assert mock_create.await_args.kwargs["api_key"] == service.api_key
    assert mock_create.await_args.kwargs["model"] == service.model


def test_analyze_database_script_no_json_object_raises():
    import claude_service

    fake_message = _FakeMessage(content=[SimpleNamespace(type="text", text="Sorry, I can't do that.")])

    with patch("claude_service.claude_client.create_message", new=AsyncMock(return_value=fake_message)):
        service = claude_service.ClaudeAIService()
        with pytest.raises(Exception, match="No JSON object found"):
            asyncio.run(service.analyze_database_script("not sql"))


# ---------------------------------------------------------------------------
# routers/tickets.py — ai_chat (streaming)
# ---------------------------------------------------------------------------

def test_ai_chat_streams_expected_sse_format(client_with_rolled_back_db, db_session, su_headers):
    async def fake_stream_text(**kwargs):
        for chunk in ["Hello", " world"]:
            yield chunk

    customer = _make_customer(db_session)
    _make_ai_settings(db_session, customer.id)

    with patch("routers.tickets.claude_client.stream_text", new=fake_stream_text):
        resp = client_with_rolled_back_db.post(
            "/tickets/ai-chat",
            headers=su_headers,
            json={"messages": [{"role": "user", "content": "hi"}], "customer_id": customer.id},
        )

    assert resp.status_code == 200
    assert resp.text == (
        'data: {"text": "Hello"}\n\n'
        'data: {"text": " world"}\n\n'
        "data: [DONE]\n\n"
    )


def test_ai_chat_not_configured_returns_400(client_with_rolled_back_db, db_session, su_headers):
    customer = _make_customer(db_session)  # no AISettings row for this customer

    resp = client_with_rolled_back_db.post(
        "/tickets/ai-chat",
        headers=su_headers,
        json={"messages": [{"role": "user", "content": "hi"}], "customer_id": customer.id},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# routers/tickets.py — ai_assist (tool-use loop)
# ---------------------------------------------------------------------------

def test_ai_assist_creates_ticket_via_tool_then_ends_turn(client_with_rolled_back_db, db_session, su_headers):
    customer = _make_customer(db_session)
    _make_ai_settings(db_session, customer.id)

    tool_use_message = _FakeMessage(
        stop_reason="tool_use",
        content=[_FakeBlock(
            type="tool_use", id="tu_1", name="create_ticket",
            input={"title": "Test ticket from AI", "customer_id": customer.id},
        )],
    )
    end_turn_message = _FakeMessage(
        stop_reason="end_turn",
        content=[_FakeBlock(type="text", text="Created the ticket.")],
    )

    with patch(
        "routers.tickets.claude_client.create_message",
        new=AsyncMock(side_effect=[tool_use_message, end_turn_message]),
    ):
        resp = client_with_rolled_back_db.post(
            "/tickets/ai-assist",
            headers=su_headers,
            json={
                "messages": [{"role": "user", "content": "create a ticket titled Test ticket from AI"}],
                "customer_id": customer.id,
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "Created the ticket."
    assert len(body["actions"]) == 1
    assert body["actions"][0]["type"] == "created"
    assert body["actions"][0]["ticket"]["title"] == "Test ticket from AI"

    created = db_session.query(models.Ticket).filter(models.Ticket.title == "Test ticket from AI").first()
    assert created is not None


def test_ai_assist_stops_after_max_rounds(client_with_rolled_back_db, db_session, su_headers):
    """Regression guard for the 6-round cap — if the model never reaches
    end_turn, the loop must terminate gracefully rather than looping forever."""
    customer = _make_customer(db_session)
    _make_ai_settings(db_session, customer.id)

    # Always responds with a no-op tool call, never end_turn. Scoped to this
    # freshly-created test customer (which has zero tickets) so the assertion
    # below doesn't depend on whatever real tickets already exist in the DB.
    forever_tool_use = _FakeMessage(
        stop_reason="tool_use",
        content=[_FakeBlock(
            type="tool_use", id="tu_x", name="search_tickets", input={"customer_id": customer.id}
        )],
    )

    with patch(
        "routers.tickets.claude_client.create_message",
        new=AsyncMock(return_value=forever_tool_use),
    ) as mock_create:
        resp = client_with_rolled_back_db.post(
            "/tickets/ai-assist",
            headers=su_headers,
            json={"messages": [{"role": "user", "content": "keep searching"}], "customer_id": customer.id},
        )

    assert resp.status_code == 200
    assert resp.json() == {"reply": "Completed.", "actions": [{"type": "found", "tickets": []}] * 6}
    assert mock_create.await_count == 6
