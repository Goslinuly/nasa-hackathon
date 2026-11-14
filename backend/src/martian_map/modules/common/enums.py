"""Статусные словари проекта, хранимые как строки, а не PG enum."""

import enum


class VerificationStatus(enum.StrEnum):
    CANDIDATE = "candidate"
    METADATA_VERIFIED = "metadata_verified"
    DOWNLOADED = "downloaded"
    GEOMETRY_VERIFIED = "geometry_verified"
    PROCESSED = "processed"
    SCIENCE_VERIFIED = "science_verified"
    PUBLISHED = "published"


class DataLevel(enum.StrEnum):
    LOCAL_DTM = "local_dtm"
    ORBITAL_OVERVIEW = "orbital_overview"
    UNASSESSED = "unassessed"


class EvidenceType(enum.StrEnum):
    MEASUREMENT = "measurement"
    DERIVED = "derived"
    MODEL = "model"
    REFERENCE = "reference"
    NO_DATA = "no_data"


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class FootprintKind(enum.StrEnum):
    PRODUCT_EXTENT = "product_extent"
    VALID_DATA = "valid_data"
