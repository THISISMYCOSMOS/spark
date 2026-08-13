import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..config import get_settings


@dataclass(frozen=True)
class PushProviderResult:
    accepted: bool
    message_ids: list[str]
    error: str | None = None


class MockPushProvider:
    name = "MOCK"

    def send(self, tokens: list[str], title: str, body: str, data: dict) -> PushProviderResult:
        return PushProviderResult(True, [f"mock-{index + 1}" for index in range(len(tokens))])


class ExpoPushProvider:
    name = "EXPO"

    def send(self, tokens: list[str], title: str, body: str, data: dict) -> PushProviderResult:
        settings = get_settings()
        messages = [{"to": token, "title": title, "body": body, "sound": "default", "data": data} for token in tokens]
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if settings.expo_access_token:
            headers["Authorization"] = f"Bearer {settings.expo_access_token}"
        request = Request(settings.expo_push_api_url, data=json.dumps(messages).encode(), headers=headers, method="POST")
        try:
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, ValueError):
            return PushProviderResult(False, [], "EXPO_REQUEST_FAILED")
        tickets = payload.get("data", [])
        if not isinstance(tickets, list) or len(tickets) != len(tokens):
            return PushProviderResult(False, [], "EXPO_INVALID_RESPONSE")
        errors = [ticket.get("details", {}).get("error", "EXPO_REJECTED") for ticket in tickets if ticket.get("status") != "ok"]
        ids = [ticket["id"] for ticket in tickets if ticket.get("status") == "ok" and ticket.get("id")]
        return PushProviderResult(not errors, ids, errors[0] if errors else None)
