"""Versioned technical artifact generator and retrieval."""
from src.kc.modules.artifacts.service import (
    generate_project_artifact,
    get_artifact_detail,
    list_project_artifacts,
    normalize_artifact_type,
)

__all__ = [
    "generate_project_artifact",
    "get_artifact_detail",
    "list_project_artifacts",
    "normalize_artifact_type",
]
