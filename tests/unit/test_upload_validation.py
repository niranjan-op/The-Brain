import hashlib

import pytest
from fastapi.testclient import TestClient

import main
from main import app
from src.kc.core.auth import get_current_user
from src.kc.core.db import get_session
from src.kc.modules.ingestion.parsers.types import MAX_FILE_SIZE


class FakeUploadSession:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.existing_doc_uuid: str | None = None

    async def execute(self, stmt, params=None):
        sql = str(stmt).strip()
        p = params or {}
        self.calls.append((sql, p))

        class _Res:
            def __init__(self, val):
                self._val = val

            def scalar_one(self):
                return self._val

            def scalar_one_or_none(self):
                return self._val

        if "INSERT INTO documents" in sql:
            assert p.get("doc_hash"), "doc_hash must be passed to INSERT INTO documents"
            return _Res(None if self.existing_doc_uuid else "doc-123")
        if "SELECT doc_uuid FROM documents" in sql:
            return _Res(self.existing_doc_uuid or "doc-123")
        if "INSERT INTO jobs" in sql:
            return _Res("job-456")
        return _Res(None)

    async def commit(self):
        pass


@pytest.fixture(autouse=True)
def _override_deps(monkeypatch):
    fake_session = FakeUploadSession()
    app.dependency_overrides[get_current_user] = lambda: {"user_uuid": "user-1"}

    async def _fake_get_session():
        yield fake_session

    app.dependency_overrides[get_session] = _fake_get_session

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(main, "upload_file", _noop)
    monkeypatch.setattr(main, "trigger_worker", _noop)
    yield fake_session
    app.dependency_overrides.clear()


client = TestClient(app)

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 10
ZIP = b"PK\x03\x04" + b"0" * 10
MIME = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
CONTENT = {
    ".pdf": b"%PDF-1.7 x",
    ".png": PNG,
    ".jpg": b"\xff\xd8\xff\xe0 x",
    ".jpeg": b"\xff\xd8\xff\xe0 x",
    ".md": b"# hi",
    ".txt": b"hi",
    ".docx": ZIP,
    ".csv": b"a,b\n1,2",
    ".xlsx": ZIP,
}


def upload(name, data, mime):
    return client.post("/upload", params={"project_uuid": "proj-1"}, files={"file": (name, data, mime)})


@pytest.mark.parametrize("ext", MIME)
def test_valid_files_accepted(ext, _override_deps):
    resp = upload(f"f{ext}", CONTENT[ext], MIME[ext])
    assert resp.status_code == 200
    expected_hash = hashlib.sha256(CONTENT[ext]).hexdigest()
    insert_calls = [p for sql, p in _override_deps.calls if "INSERT INTO documents" in sql]
    assert insert_calls[-1]["doc_hash"] == expected_hash


def test_duplicate_upload_returns_existing_doc(_override_deps):
    _override_deps.existing_doc_uuid = "existing-doc-999"
    resp = upload("f.pdf", CONTENT[".pdf"], MIME[".pdf"])
    assert resp.status_code == 200
    assert resp.json()["doc_uuid"] == "existing-doc-999"


def test_bad_extension():
    assert upload("f.exe", b"x", "application/pdf").status_code == 415


def test_bad_mime():
    assert upload("f.pdf", CONTENT[".pdf"], "application/octet-stream").status_code == 415


@pytest.mark.parametrize("ext", [".pdf", ".png", ".jpg", ".docx"])
def test_content_not_matching_extension(ext):
    assert upload(f"f{ext}", b"just text", MIME[ext]).status_code == 415


def test_too_large():
    data = b"a" * (MAX_FILE_SIZE + 1)
    assert upload("f.txt", data, "text/plain").status_code == 413
