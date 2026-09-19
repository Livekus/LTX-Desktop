"""CPU and real MP4 regression coverage for A2V padding accumulating between clips."""

from __future__ import annotations

from collections.abc import Generator
from fractions import Fraction

import av
import pytest
import torch
from ltx_core.types import Audio

from services.a2v_pipeline.output_timing import trim_a2v_output
from services.ltx_pipeline_common import encode_video_output


def _audio(duration: float, sample_rate: int = 48000) -> Audio:
    return Audio(
        waveform=torch.zeros(2, round(duration * sample_rate)),
        sampling_rate=sample_rate,
    )


@pytest.mark.parametrize(
    ("requested_duration", "audio_duration", "generated_frames", "expected_frames", "expected_samples"),
    [
        (20, 20, 481, 480, 960000),
        (20, 481 / 24, 481, 480, 960000),
        (4.25, 4.25, 121, 102, 204000),
        (4.25, 121 / 24, 121, 102, 204000),
        (20, 3.5, 481, 84, 168000),
        (5, 4.734, 121, 114, 227232),
        (5, 103 / 24, 121, 103, 206000),
    ],
)
def test_trim_preserves_frame_order_and_audio_samples(
    requested_duration, audio_duration, generated_frames, expected_frames, expected_samples
):
    frames = torch.arange(generated_frames).reshape(-1, 1, 1, 1)
    audio = _audio(audio_duration)
    # Non-silent data catches any unintended audio offset or resampling.
    audio.waveform[:] = torch.linspace(-0.25, 0.25, audio.waveform.shape[-1])

    video, trimmed_audio = trim_a2v_output(frames, audio, duration=requested_duration, fps=24)

    assert isinstance(video, torch.Tensor)
    assert torch.equal(video, frames[:expected_frames])
    assert trimmed_audio is not None
    assert trimmed_audio.sampling_rate == audio.sampling_rate
    assert torch.equal(trimmed_audio.waveform, audio.waveform[..., :expected_samples])
    overhang = expected_frames / 24 - expected_samples / audio.sampling_rate
    assert 0 <= overhang < 1 / 24


@pytest.mark.parametrize("frame_limit", [480, 102, 96])
def test_streamed_trim_exhausts_decoder_and_preserves_frames(frame_limit):
    frames = torch.arange(481).reshape(-1, 1, 1, 1)
    events = []

    def decode():
        try:
            for chunk in frames.split(48):
                yield chunk
            events.append("exhausted")
        finally:
            events.append("released")

    video, _ = trim_a2v_output(decode(), _audio(20), duration=frame_limit / 24, fps=24)
    assert events == []  # Decoding remains lazy and does not buffer the whole clip.
    assert isinstance(video, Generator)
    chunks = list(video)

    assert all(0 < chunk.shape[0] <= 48 for chunk in chunks)
    assert torch.equal(torch.cat(chunks), frames[:frame_limit])
    assert events == ["exhausted", "released"]


def test_closing_trim_iterator_releases_decoder():
    events = []

    def decode():
        try:
            yield torch.zeros(48, 1, 1, 1)
            yield torch.zeros(48, 1, 1, 1)
        finally:
            events.append("released")

    video, _ = trim_a2v_output(decode(), _audio(2), duration=2, fps=24)
    assert isinstance(video, Generator)
    next(video)
    video.close()
    assert events == ["released"]


@pytest.mark.parametrize("streamed", [False, True])
@pytest.mark.parametrize(
    ("duration", "generated_frames", "expected_frames"),
    [(20, 481, 480), (4.25, 121, 102)],
)
def test_encoded_mp4_has_exact_window_duration_and_original_frame_rate(
    tmp_path, streamed, duration, generated_frames, expected_frames
):
    frames = torch.linspace(0, 1, generated_frames).reshape(-1, 1, 1, 1).expand(-1, 32, 32, 3)
    video, audio = trim_a2v_output(
        iter(frames.split(48)) if streamed else frames,
        _audio(generated_frames / 24),
        duration=duration,
        fps=24,
    )
    output_path = tmp_path / "clip.mp4"
    encode_video_output(
        video=video,
        audio=audio,
        fps=24,
        output_path=str(output_path),
        video_chunks_number_value=1,
    )

    with av.open(str(output_path)) as container:
        stream = container.streams.video[0]
        audio_stream = container.streams.audio[0]
        assert stream.frames == expected_frames
        assert stream.average_rate == 24
        assert stream.duration * stream.time_base == duration
        assert audio_stream.duration * audio_stream.time_base == duration
        assert container.duration / av.time_base == duration
        timestamps = [frame.pts * frame.time_base for frame in container.decode(video=0)]
        assert timestamps == [Fraction(index, 24) for index in range(expected_frames)]
