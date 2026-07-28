"""Download completed Earth Engine Drive exports into the raw GEE staging area."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


class DownloadIntegrityError(RuntimeError):
    """Raised when downloaded bytes disagree with Google Drive metadata."""


def _safe_destination_path(destination: Path, filename: str) -> Path:
    """Return a single-file path contained by ``destination``.

    Google Drive names are remote input.  Reject absolute paths, parent
    traversal, and both POSIX/Windows separators before opening a local file.
    Resolving the candidate also prevents an existing symlink from redirecting
    a download outside the staging directory.
    """

    if (
        not filename
        or filename in {".", ".."}
        or "\x00" in filename
        or "/" in filename
        or "\\" in filename
        or Path(filename).is_absolute()
    ):
        raise ValueError(f"Unsafe Google Drive filename: {filename!r}")

    resolved_destination = destination.resolve()
    candidate = resolved_destination / filename
    resolved_candidate = candidate.resolve(strict=False)
    if resolved_candidate.parent != resolved_destination:
        raise ValueError(
            "Google Drive filename resolves outside the destination directory: "
            f"{filename!r}"
        )
    return candidate


def _file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_download_integrity(path: Path, file_record: dict[str, Any]) -> None:
    """Compare a completed partial file with available Drive metadata."""

    name = str(file_record.get("name", path.name))
    expected_size = file_record.get("size")
    if expected_size not in (None, ""):
        try:
            parsed_size = int(expected_size)
        except (TypeError, ValueError) as exc:
            raise DownloadIntegrityError(
                f"Invalid Drive byte-size metadata for {name!r}: {expected_size!r}"
            ) from exc
        actual_size = path.stat().st_size
        if parsed_size < 0 or actual_size != parsed_size:
            raise DownloadIntegrityError(
                f"Downloaded byte-size mismatch for {name!r}: "
                f"expected {parsed_size}, got {actual_size}"
            )

    expected_md5 = file_record.get("md5Checksum")
    if expected_md5 not in (None, ""):
        expected_digest = str(expected_md5).strip().lower()
        actual_digest = _file_md5(path)
        if actual_digest != expected_digest:
            raise DownloadIntegrityError(
                f"Downloaded MD5 mismatch for {name!r}: "
                f"expected {expected_digest}, got {actual_digest}"
            )


def download_drive_exports(
    *,
    folder_id: str,
    destination_dir: str | Path,
    filename_prefix: str | None = None,
    overwrite: bool = False,
    credentials: Any | None = None,
) -> list[dict[str, Any]]:
    """Download matching non-trashed CSV exports with atomic local writes."""

    try:
        import ee
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:  # pragma: no cover - depends on optional full extras
        raise RuntimeError(
            "Drive export download needs the project 'full' dependencies"
        ) from exc

    if not folder_id.strip():
        raise ValueError("folder_id must not be blank")
    destination = Path(destination_dir)
    destination.mkdir(parents=True, exist_ok=True)

    saved_credentials = credentials or ee.data.get_persistent_credentials()
    service = build(
        "drive",
        "v3",
        credentials=saved_credentials,
        cache_discovery=False,
    )
    query_parts = [
        f"'{folder_id}' in parents",
        "trashed = false",
        "mimeType = 'text/csv'",
    ]
    if filename_prefix:
        escaped_prefix = filename_prefix.replace("\\", "\\\\").replace("'", "\\'")
        query_parts.append(f"name contains '{escaped_prefix}'")

    files: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        response = (
            service.files()
            .list(
                q=" and ".join(query_parts),
                fields="nextPageToken, files(id,name,size,md5Checksum,modifiedTime)",
                orderBy="name",
                pageToken=page_token,
                pageSize=1000,
            )
            .execute()
        )
        files.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    records: list[dict[str, Any]] = []
    for file_record in files:
        name = str(file_record["name"])
        local_path = _safe_destination_path(destination, name)
        if local_path.exists() and not overwrite:
            _verify_download_integrity(local_path, file_record)
            records.append(
                {
                    "drive_file_id": file_record["id"],
                    "name": name,
                    "path": str(local_path),
                    "status": "verified_existing",
                    "size": file_record.get("size"),
                    "md5": file_record.get("md5Checksum"),
                    "drive_modified_time": file_record.get("modifiedTime"),
                    "local_size": local_path.stat().st_size,
                    "local_md5": _file_md5(local_path),
                    "local_sha256": _file_sha256(local_path),
                }
            )
            continue

        partial_path = _safe_destination_path(destination, f"{name}.part")
        try:
            with partial_path.open("wb") as handle:
                downloader = MediaIoBaseDownload(
                    handle,
                    service.files().get_media(fileId=file_record["id"]),
                )
                done = False
                while not done:
                    _, done = downloader.next_chunk()
            _verify_download_integrity(partial_path, file_record)
            partial_path.replace(local_path)
        except Exception:
            partial_path.unlink(missing_ok=True)
            raise
        records.append(
            {
                "drive_file_id": file_record["id"],
                "name": name,
                "path": str(local_path),
                "status": "downloaded",
                "size": file_record.get("size"),
                "md5": file_record.get("md5Checksum"),
                "drive_modified_time": file_record.get("modifiedTime"),
                "local_size": local_path.stat().st_size,
                "local_md5": _file_md5(local_path),
                "local_sha256": _file_sha256(local_path),
            }
        )
    return records
