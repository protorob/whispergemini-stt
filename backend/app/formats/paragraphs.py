from app.engines.base import Segment

# Whisper segments already break at pauses internally (VAD/silence), so a
# gap between one segment's end and the next one's start is a decent proxy
# for "the speaker paused here" — short breaths between words are well
# under this, real pauses (breath before a new thought, sentence break) are
# comfortably above it.
PARAGRAPH_GAP_SECONDS = 1.0

PAUSE_SENSITIVITY_SECONDS: dict[str, float] = {
    "short": 0.5,
    "normal": PARAGRAPH_GAP_SECONDS,
    "long": 2.0,
}
DEFAULT_PAUSE_SENSITIVITY = "normal"


def group_into_paragraphs(
    segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS
) -> list[list[Segment]]:
    if not segments:
        return []

    paragraphs: list[list[Segment]] = [[segments[0]]]
    for prev, seg in zip(segments, segments[1:]):
        # A paragraph shouldn't span a speaker change even if the gap
        # between the two segments is short (people often talk over the
        # tail end of each other, or reply almost immediately).
        speaker_changed = seg.speaker is not None and seg.speaker != prev.speaker
        if seg.start - prev.end >= gap_seconds or speaker_changed:
            paragraphs.append([seg])
        else:
            paragraphs[-1].append(seg)
    return paragraphs
