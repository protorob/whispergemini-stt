from app.engines.base import Segment

# Whisper segments already break at pauses internally (VAD/silence), so a
# gap between one segment's end and the next one's start is a decent proxy
# for "the speaker paused here" — short breaths between words are well
# under this, real pauses (breath before a new thought, sentence break) are
# comfortably above it.
PARAGRAPH_GAP_SECONDS = 1.0


def group_into_paragraphs(
    segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS
) -> list[list[Segment]]:
    if not segments:
        return []

    paragraphs: list[list[Segment]] = [[segments[0]]]
    for prev, seg in zip(segments, segments[1:]):
        if seg.start - prev.end >= gap_seconds:
            paragraphs.append([seg])
        else:
            paragraphs[-1].append(seg)
    return paragraphs
