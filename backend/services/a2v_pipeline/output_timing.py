"""Trim A2V output to its audio window without changing the frame rate."""

from __future__ import annotations

import math
from collections.abc import Generator, Iterator

import torch

from services.services_utils import AudioOrNone


def _trim_video_chunks(
    chunks: Iterator[torch.Tensor], frame_limit: int
) -> Generator[torch.Tensor, None, None]:
    remaining = frame_limit
    try:
        for chunk in chunks:
            if remaining > 0:
                trimmed = chunk[:remaining]
                remaining -= trimmed.shape[0]
                if trimmed.shape[0] > 0:
                    yield trimmed
            # Exhaust the decoder even after the cutoff: its iterator owns GPU cleanup.
    finally:
        if isinstance(chunks, Generator):
            chunks.close()


def trim_a2v_output(
    video: torch.Tensor | Iterator[torch.Tensor],
    audio: AudioOrNone,
    *,
    duration: float,
    fps: int,
) -> tuple[torch.Tensor | Generator[torch.Tensor, None, None], AudioOrNone]:
    """Keep the requested window, capped by the decoded audio's actual length.

    Inference uses an 8n+1 frame grid; the exported clip does not. A fractional
    audio tail keeps its last video frame, with less than one frame of overhang.
    Count audio samples with integer arithmetic so exact frame boundaries do not
    accidentally gain a frame through floating-point rounding.
    """
    frame_limit = math.ceil(duration * fps)
    if audio is not None:
        from ltx_core.types import Audio

        sample_limit = min(audio.waveform.shape[-1], round(duration * audio.sampling_rate))
        frame_limit = -(-sample_limit * fps // audio.sampling_rate)
        audio = Audio(
            waveform=audio.waveform[..., :sample_limit],
            sampling_rate=audio.sampling_rate,
        )

    if frame_limit <= 0:
        raise ValueError("Audio-to-video output cannot have an empty audio window.")

    if isinstance(video, torch.Tensor):
        return video[:frame_limit], audio
    return _trim_video_chunks(video, frame_limit), audio
