import pytest
from fastapi.testclient import TestClient

from main import app
from src.kc.modules.ingestion.parsers.types import MAX_FILE_SIZE

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
    return client.post("/upload", files={"file": (name, data, mime)})


@pytest.mark.parametrize("ext", MIME)
def test_valid_files_accepted(ext):
    assert upload(f"f{ext}", CONTENT[ext], MIME[ext]).status_code == 200


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
