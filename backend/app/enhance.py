from collections.abc import Iterator
from dataclasses import dataclass

from google import genai
from google.genai import types

# This guardrail is appended to every preset (including "ultra" and
# "custom") — creativity controls HOW content is expressed, never WHAT
# content exists. Without this, a high-creativity rewrite could start
# inventing details, which would make this an unreliable transcription
# tool rather than a formatting aid.
GROUNDING_RULE = (
    "Do not invent facts, statistics, names, quotes, or claims that were "
    "not present in the original transcript — every idea in your output "
    "must trace back to something the speaker actually said."
)

FORMATTING_RULE = (
    "Add paragraph breaks, headings (only if there is clear topical "
    "structure), and lists (only if the speaker is clearly enumerating "
    "items) using Markdown syntax. Fix punctuation and capitalization."
)

OUTPUT_RULE = (
    "Output only the formatted Markdown document itself, with no "
    "commentary, preamble, or explanation before or after it."
)


@dataclass
class CreativityPreset:
    label: str
    description: str
    temperature: float
    instruction: str


CREATIVITY_PRESETS: dict[str, CreativityPreset] = {
    "verbatim": CreativityPreset(
        label="Verbatim — fix errors only",
        description=(
            "Only corrects transcription mistakes (typos, “um”/“uh”). "
            "Every word stays as close to what was actually said as possible."
        ),
        temperature=0.15,
        instruction=(
            "Fix obvious transcription errors: mishearings, filler words "
            "(um, uh, you know), false starts, and words repeated due to "
            "speech disfluency. Do not paraphrase, reword, summarize, or "
            "restructure sentences beyond these light corrections — "
            "preserve the speaker's exact wording, tone, and phrasing."
        ),
    ),
    "light": CreativityPreset(
        label="Light edit — clean up phrasing",
        description="Fixes errors and smooths a few awkward sentences. Mostly your original wording.",
        temperature=0.4,
        instruction=(
            "Fix transcription errors as above, and you may lightly reword "
            "awkward or run-on sentences for clarity. Keep the speaker's "
            "original word choices and voice wherever possible — this is "
            "polish, not a rewrite."
        ),
    ),
    "moderate": CreativityPreset(
        label="Balanced — reworded for readability",
        description="Sentences reworded for better flow. Same content and ideas, different phrasing.",
        temperature=0.6,
        instruction=(
            "You may rephrase sentences, improve flow and transitions, and "
            "vary word choice for readability, as long as all original "
            "content, meaning, and key points remain intact."
        ),
    ),
    "high": CreativityPreset(
        label="Expressive — polished blog prose",
        description="Substantially rewritten into engaging, polished prose. Same facts and ideas, noticeably different voice.",
        temperature=0.85,
        instruction=(
            "Rewrite the transcript into polished, engaging blog prose: "
            "improve sentence structure, transitions, and vocabulary, and "
            "meaningfully enhance readability. You have substantial "
            "creative freedom in how the content is expressed."
        ),
    ),
    "ultra": CreativityPreset(
        label="Full rewrite — maximum polish",
        description="Freely restructured and rewritten for maximum engagement. Same underlying facts, very different text and structure.",
        temperature=1.0,
        instruction=(
            "Fully rewrite the transcript into a compelling, polished blog "
            "article: restructure freely, add narrative flow and stylistic "
            "flourishes, and maximize engagement and readability. You have "
            "wide creative freedom in structure, tone, and expression."
        ),
    ),
}

CUSTOM_DESCRIPTION = "Uses the style/tone instructions you write below instead of a preset."


class GeminiFormattingError(RuntimeError):
    pass


def _build_system_prompt(creativity: str, custom_style: str | None) -> tuple[str, float]:
    if creativity == "custom":
        style = (custom_style or "").strip()
        if not style:
            raise GeminiFormattingError("custom creativity mode requires a style/tone prompt")
        instruction = (
            f"Format and rewrite the transcript to match this style/tone "
            f"direction from the user:\n\n{style}"
        )
        return (
            f"You are formatting a raw speech-to-text transcript into a clean, "
            f"readable document for a blog article draft.\n\n{FORMATTING_RULE}\n\n"
            f"{instruction}\n\n{GROUNDING_RULE}\n\n{OUTPUT_RULE}"
        ), 0.7

    preset = CREATIVITY_PRESETS.get(creativity)
    if preset is None:
        raise GeminiFormattingError(
            f"unsupported creativity '{creativity}', expected 'custom' or one of {list(CREATIVITY_PRESETS)}"
        )

    prompt = (
        f"You are formatting a raw speech-to-text transcript into a clean, "
        f"readable document for a blog article draft.\n\n{FORMATTING_RULE}\n\n"
        f"{preset.instruction}\n\n{GROUNDING_RULE}\n\n{OUTPUT_RULE}"
    )
    return prompt, preset.temperature


def stream_format_transcript(
    text: str,
    api_key: str,
    model: str,
    creativity: str = "verbatim",
    custom_style: str | None = None,
) -> Iterator[str]:
    """Yields text chunks as Gemini generates them (real progressive output,
    not a fake progress indicator) — used by /api/enhance's SSE endpoint so
    the frontend can show the formatted text appearing as it's written."""
    if not text.strip():
        raise GeminiFormattingError("transcript is empty")
    if not api_key.strip():
        raise GeminiFormattingError("missing Gemini API key")

    system_prompt, temperature = _build_system_prompt(creativity, custom_style)

    got_any_text = False
    try:
        client = genai.Client(api_key=api_key)
        stream = client.models.generate_content_stream(
            model=model,
            contents=text,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature,
            ),
        )
        for chunk in stream:
            if chunk.text:
                got_any_text = True
                yield chunk.text
    except Exception as exc:
        raise GeminiFormattingError(str(exc)) from exc

    if not got_any_text:
        raise GeminiFormattingError("Gemini returned an empty response")


def format_transcript(
    text: str,
    api_key: str,
    model: str,
    creativity: str = "verbatim",
    custom_style: str | None = None,
) -> str:
    """Non-streaming convenience wrapper — mainly for easy curl testing."""
    return "".join(stream_format_transcript(text, api_key, model, creativity, custom_style))
