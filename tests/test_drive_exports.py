from __future__ import annotations

import hashlib
import sys
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from myanmar_agri_geo.drive_exports import (
    DownloadIntegrityError,
    download_drive_exports,
)


class _Request:
    def __init__(self, response: dict[str, Any]) -> None:
        self.response = response

    def execute(self) -> dict[str, Any]:
        return self.response


class _Files:
    def __init__(self, records: list[dict[str, Any]], content: bytes) -> None:
        self.records = records
        self.content = content
        self.media_requests: list[str] = []

    def list(self, **_kwargs: Any) -> _Request:
        return _Request({"files": self.records})

    def get_media(self, *, fileId: str) -> bytes:
        self.media_requests.append(fileId)
        return self.content


class _Service:
    def __init__(self, records: list[dict[str, Any]], content: bytes) -> None:
        self.files_resource = _Files(records, content)

    def files(self) -> _Files:
        return self.files_resource


class _Downloader:
    def __init__(self, handle: Any, media: bytes) -> None:
        self.handle = handle
        self.media = media

    def next_chunk(self) -> tuple[None, bool]:
        self.handle.write(self.media)
        return None, True


def _install_fake_drive_modules(
    monkeypatch: pytest.MonkeyPatch,
    records: list[dict[str, Any]],
    content: bytes,
) -> _Service:
    service = _Service(records, content)
    discovery = ModuleType("googleapiclient.discovery")
    discovery.build = lambda *_args, **_kwargs: service  # type: ignore[attr-defined]
    http = ModuleType("googleapiclient.http")
    http.MediaIoBaseDownload = _Downloader  # type: ignore[attr-defined]
    monkeypatch.setitem(
        sys.modules,
        "ee",
        SimpleNamespace(data=SimpleNamespace(get_persistent_credentials=lambda: object())),
    )
    monkeypatch.setitem(sys.modules, "googleapiclient.discovery", discovery)
    monkeypatch.setitem(sys.modules, "googleapiclient.http", http)
    return service


def _record(name: str, content: bytes, **overrides: Any) -> dict[str, Any]:
    record: dict[str, Any] = {
        "id": "drive-file-1",
        "name": name,
        "size": str(len(content)),
        "md5Checksum": hashlib.md5(content).hexdigest(),
    }
    record.update(overrides)
    return record


def test_download_verifies_size_and_md5_before_atomic_publish(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = b"grid_id,year_month\nmm_1,2018-01\n"
    _install_fake_drive_modules(
        monkeypatch, [_record("regional.csv", content)], content
    )

    records = download_drive_exports(
        folder_id="folder-1",
        destination_dir=tmp_path,
        credentials=object(),
    )

    assert (tmp_path / "regional.csv").read_bytes() == content
    assert not (tmp_path / "regional.csv.part").exists()
    assert records[0]["status"] == "downloaded"


@pytest.mark.parametrize(
    "unsafe_name",
    [
        "../escape.csv",
        "/tmp/escape.csv",
        "nested/escape.csv",
        r"nested\escape.csv",
        "..",
    ],
)
def test_download_rejects_out_of_destination_names(
    tmp_path, monkeypatch: pytest.MonkeyPatch, unsafe_name: str
) -> None:
    content = b"unsafe"
    service = _install_fake_drive_modules(
        monkeypatch, [_record(unsafe_name, content)], content
    )

    with pytest.raises(ValueError, match="Unsafe Google Drive filename"):
        download_drive_exports(
            folder_id="folder-1",
            destination_dir=tmp_path,
            credentials=object(),
        )

    assert service.files_resource.media_requests == []
    assert list(tmp_path.iterdir()) == []


def test_download_rejects_partial_symlink_that_points_outside_destination(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "downloads"
    destination.mkdir()
    outside = tmp_path / "outside.csv"
    partial = destination / "regional.csv.part"
    partial.symlink_to(outside)
    content = b"must-not-be-written"
    service = _install_fake_drive_modules(
        monkeypatch, [_record("regional.csv", content)], content
    )

    with pytest.raises(ValueError, match="outside the destination"):
        download_drive_exports(
            folder_id="folder-1",
            destination_dir=destination,
            credentials=object(),
        )

    assert not outside.exists()
    assert partial.is_symlink()
    assert service.files_resource.media_requests == []


def test_size_mismatch_removes_partial_and_preserves_existing_file(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "regional.csv"
    target.write_bytes(b"previous-good-export")
    content = b"new-export"
    _install_fake_drive_modules(
        monkeypatch,
        [_record("regional.csv", content, size=str(len(content) + 1))],
        content,
    )

    with pytest.raises(DownloadIntegrityError, match="byte-size mismatch"):
        download_drive_exports(
            folder_id="folder-1",
            destination_dir=tmp_path,
            overwrite=True,
            credentials=object(),
        )

    assert target.read_bytes() == b"previous-good-export"
    assert not (tmp_path / "regional.csv.part").exists()


def test_md5_mismatch_never_publishes_partial_file(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = b"downloaded-but-corrupt"
    _install_fake_drive_modules(
        monkeypatch,
        [_record("regional.csv", content, md5Checksum="0" * 32)],
        content,
    )

    with pytest.raises(DownloadIntegrityError, match="MD5 mismatch"):
        download_drive_exports(
            folder_id="folder-1",
            destination_dir=tmp_path,
            credentials=object(),
        )

    assert not (tmp_path / "regional.csv").exists()
    assert not (tmp_path / "regional.csv.part").exists()


def test_existing_file_is_verified_and_fingerprinted(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = b"grid_id,year_month\nmm_1,2018-01\n"
    target = tmp_path / "regional.csv"
    target.write_bytes(content)
    service = _install_fake_drive_modules(
        monkeypatch, [_record("regional.csv", content)], b"unused"
    )

    records = download_drive_exports(
        folder_id="folder-1",
        destination_dir=tmp_path,
        credentials=object(),
    )

    assert service.files_resource.media_requests == []
    assert records[0]["status"] == "verified_existing"
    assert records[0]["local_size"] == len(content)
    assert records[0]["local_md5"] == hashlib.md5(content).hexdigest()
    assert records[0]["local_sha256"] == hashlib.sha256(content).hexdigest()


def test_corrupt_existing_file_is_not_silently_skipped(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    expected = b"expected"
    target = tmp_path / "regional.csv"
    target.write_bytes(b"corrupt")
    _install_fake_drive_modules(
        monkeypatch, [_record("regional.csv", expected)], b"unused"
    )

    with pytest.raises(DownloadIntegrityError, match="byte-size mismatch"):
        download_drive_exports(
            folder_id="folder-1",
            destination_dir=tmp_path,
            credentials=object(),
        )

    assert target.read_bytes() == b"corrupt"
