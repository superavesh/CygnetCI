"""Single Anthropic API adapter, used by claude_service.py (rollback script
analysis) and routers/tickets.py (AI chat + AI ticket assistant tool-use).

Previously these were 3 separate integration points: one through the official
SDK (claude_service.py), two through raw httpx calls hand-building requests
and, in one case, manually parsing SSE events (routers/tickets.py). All three
now go through this one module, on the async SDK client — one place to change
API version, auth, or error handling for this external dependency.
"""
from typing import Any, AsyncIterator, Dict, List, Optional

import anthropic


def get_client(api_key: str) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key)


async def create_message(
    api_key: str,
    model: str,
    max_tokens: int,
    messages: List[Dict[str, Any]],
    system: Optional[str] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: Optional[float] = None,
) -> anthropic.types.Message:
    """One-shot (non-streaming) call. Used for rollback script analysis and
    each round of the ticket AI-assistant tool-use loop."""
    client = get_client(api_key)
    kwargs: Dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system is not None:
        kwargs["system"] = system
    if tools is not None:
        kwargs["tools"] = tools
    if temperature is not None:
        kwargs["temperature"] = temperature
    return await client.messages.create(**kwargs)


async def stream_text(
    api_key: str,
    model: str,
    max_tokens: int,
    messages: List[Dict[str, Any]],
    system: Optional[str] = None,
) -> AsyncIterator[str]:
    """Streaming call — yields text deltas as they arrive. Used for the
    ticket AI-chat endpoint."""
    client = get_client(api_key)
    kwargs: Dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system is not None:
        kwargs["system"] = system
    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text
