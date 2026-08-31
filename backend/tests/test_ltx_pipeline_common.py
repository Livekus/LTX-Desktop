"""Shared LTX pipeline helpers."""

from __future__ import annotations

import torch
from ltx_pipelines.utils.types import OffloadMode

import services.ltx_pipeline_common as common


def _bytes(gib: int) -> int:
    return gib * 1024**3


def test_full_loading_uses_no_offload() -> None:
    assert common.offload_mode_for_prefetch_count(None, torch.device("cuda")) == OffloadMode.NONE


def test_mps_streaming_uses_disk() -> None:
    assert common.offload_mode_for_prefetch_count(2, torch.device("mps")) == OffloadMode.DISK


def test_cuda_streaming_uses_disk_when_free_host_ram_is_low(monkeypatch) -> None:
    monkeypatch.delenv("LTX_CUDA_STREAMING_OFFLOAD_MODE", raising=False)
    monkeypatch.delenv("LTX_CUDA_RAM_STREAMING_MIN_FREE_GB", raising=False)
    monkeypatch.setattr(common, "host_available_bytes", lambda: _bytes(32))

    assert common.offload_mode_for_prefetch_count(2, torch.device("cuda")) == OffloadMode.DISK


def test_cuda_streaming_uses_cpu_when_free_host_ram_is_available(monkeypatch) -> None:
    monkeypatch.delenv("LTX_CUDA_STREAMING_OFFLOAD_MODE", raising=False)
    monkeypatch.delenv("LTX_CUDA_RAM_STREAMING_MIN_FREE_GB", raising=False)
    monkeypatch.setattr(common, "host_available_bytes", lambda: _bytes(64))

    assert common.offload_mode_for_prefetch_count(2, torch.device("cuda")) == OffloadMode.CPU


def test_cuda_streaming_offload_env_override(monkeypatch) -> None:
    monkeypatch.setenv("LTX_CUDA_STREAMING_OFFLOAD_MODE", "cpu")
    monkeypatch.setattr(common, "host_available_bytes", lambda: _bytes(1))
    assert common.offload_mode_for_prefetch_count(2, torch.device("cuda")) == OffloadMode.CPU

    monkeypatch.setenv("LTX_CUDA_STREAMING_OFFLOAD_MODE", "disk")
    monkeypatch.setattr(common, "host_available_bytes", lambda: _bytes(64))
    assert common.offload_mode_for_prefetch_count(2, torch.device("cuda")) == OffloadMode.DISK
