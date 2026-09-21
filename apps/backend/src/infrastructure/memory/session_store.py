"""Session persistence abstraction for agent state."""

import asyncio
from contextlib import asynccontextmanager

from src.application.domains.ride.state import ConversationSnapshot


class ConversationStore:
    """In-memory session store; replace with Redis before multi-worker deploy."""

    def __init__(self):
        self._sessions: dict[str, ConversationSnapshot] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @asynccontextmanager
    async def session(self, session_id: str):
        lock = self._locks.setdefault(session_id, asyncio.Lock())
        async with lock:
            snapshot = self._sessions.setdefault(session_id, ConversationSnapshot())
            yield snapshot

