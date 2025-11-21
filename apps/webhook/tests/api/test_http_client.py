import os

import httpx
import pytest

os.environ["WEBHOOK_SKIP_DB_FIXTURES"] = "1"

from api.deps import get_http_client


@pytest.mark.asyncio
async def test_get_http_client_singleton():
    client1 = await get_http_client()
    client2 = await get_http_client()
    assert client1 is client2
    assert isinstance(client1, httpx.AsyncClient)
