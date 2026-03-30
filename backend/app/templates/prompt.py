"""
Template Generation via AI (Gemini)

Generates 3 review response templates (positive / negative / neutral)
using a user-supplied prompt and brand voice form data.

POST /templates/generate
"""

from __future__ import annotations

import os
import json
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_bearer_token, get_supabase_gateway
from app.core.supabase_gateway import SupabaseGateway


router = APIRouter()


# ── Pydantic models ──────────────────────────────────────────────────────────


class BrandVoiceInput(BaseModel):
    """Mirrors the brand_voices table / BrandVoiceForm fields."""

    business_name: str = ""
    industry: str = ""
    tone: str = "professional"                     # professional | formal | casual | friendly
    target_audience: str = ""
    brand_values: str = ""
    key_phrases: List[str] = Field(default_factory=list)
    phrases_to_avoid: List[str] = Field(default_factory=list)
    preferred_response_length: str = "medium"      # short | medium | detailed
    language_dialect: str = ""
    signature_signoff: str = ""
    example_responses: List[str] = Field(default_factory=list)


class TemplateGenerateRequest(BaseModel):
    """Request body for template generation."""

    brand_voice: BrandVoiceInput
    # Free-form instruction from the user, e.g.
    # "We are a pediatric dental clinic – keep the tone playful and reassuring."
    user_prompt: str = ""


class GeneratedTemplate(BaseModel):
    title: str
    content: str
    review_type: Literal["positive", "negative", "neutral"]


class TemplateGenerateResponse(BaseModel):
    templates: List[GeneratedTemplate]


# ── Helpers ──────────────────────────────────────────────────────────────────


_LENGTH_GUIDE = {
    "short": "1–2 short sentences",
    "detailed": "4–5 sentences with specific details",
    "medium": "2–3 sentences",
}

_TONE_GUIDE = {
    "professional": "polished and professional",
    "formal": "formal and respectful",
    "casual": "relaxed and conversational",
    "friendly": "warm, upbeat, and friendly",
}

# Real dental-clinic review/reply examples drawn from actual data to anchor
# the model on the expected style and length.
_FEW_SHOT_EXAMPLES = """
--- EXAMPLE POSITIVE REPLY (5-star, no text) ---
"Thank you very much, Vinod, for giving us a 5-star rating!
Our entire team is glad to see such amazing feedback. We are proud to be your Smile Partner, and we will always be here to welcome you again.
Keep smiling :-)"

--- EXAMPLE POSITIVE REPLY (5-star, with detailed text) ---
"Thank you very much, Rohan, for giving us a 5-star rating!
Our entire team is thrilled to hear that you had a great experience. We believe in honest advice and patient-first care, and it means a lot to know that reflects in your visits.
We look forward to being your family dentist for years to come. Keep smiling!"

--- EXAMPLE NEGATIVE REPLY (1-star) ---
"Dear Guest,
We are sorry to hear your experience did not meet our usual standards. We are known for our exceptional attention to detail and regret that we missed the mark this time.
Please reach out to us directly so we can make things right – your satisfaction matters greatly to us."

--- EXAMPLE NEUTRAL REPLY (3-star) ---
"Thank you for sharing your honest feedback with us.
We appreciate both the positive comments and the areas where you feel we can improve. Your input helps us serve every patient better.
We hope to exceed your expectations on your next visit!"
"""


def _build_prompt(req: TemplateGenerateRequest) -> str:
    bv = req.brand_voice
    length_guide = _LENGTH_GUIDE.get(bv.preferred_response_length, _LENGTH_GUIDE["medium"])
    tone_guide = _TONE_GUIDE.get(bv.tone, bv.tone)

    key_phrases_str = ", ".join(bv.key_phrases) if bv.key_phrases else "none specified"
    avoid_str = ", ".join(bv.phrases_to_avoid) if bv.phrases_to_avoid else "none"
    signoff = bv.signature_signoff.strip() or "Best regards, The Team"
    dialect = bv.language_dialect.strip() or "standard English"

    example_block = ""
    if bv.example_responses:
        examples = "\n".join(f'- "{e}"' for e in bv.example_responses[:3])
        example_block = f"\nOwner's own example responses (match this style closely):\n{examples}\n"

    user_instruction = (
        f"\nAdditional instructions from the owner:\n{req.user_prompt.strip()}\n"
        if req.user_prompt.strip()
        else ""
    )

    prompt = f"""
You are an expert review-response writer for Google My Business listings.
Your job is to generate EXACTLY 3 review response templates for the business described below.

{_FEW_SHOT_EXAMPLES}

──────────────────────────────────────────
BUSINESS PROFILE
──────────────────────────────────────────
Business Name  : {bv.business_name or "the business"}
Industry       : {bv.industry or "local business"}
Target Audience: {bv.target_audience or "general customers"}
Brand Values   : {bv.brand_values or "quality service"}
Tone           : {tone_guide}
Response Length: {length_guide}
Language       : {dialect}
Key Phrases    : {key_phrases_str}
Phrases to AVOID: {avoid_str}
Sign-off       : {signoff}
{example_block}{user_instruction}
──────────────────────────────────────────
TEMPLATES TO GENERATE
──────────────────────────────────────────
Generate one template for each review sentiment:
1. POSITIVE  – customer left 4–5 stars, happy experience
2. NEGATIVE  – customer left 1–2 stars, unhappy experience
3. NEUTRAL   – customer left 3 stars, mixed or average experience

RULES:
- Use "{{{{reviewer_name}}}}" as a placeholder wherever the reviewer's first name would appear.
- Use "{{{{business_name}}}}" as a placeholder for the business name.
- Do NOT include actual star ratings or review text inside the templates.
- Each template must start with a greeting and end with the sign-off.
- Never include phrases listed under "Phrases to AVOID".
- Incorporate key phrases naturally where appropriate.
- Keep responses realistic, human, and empathetic – NOT robotic.

Return your answer as a JSON array with exactly 3 objects.
Each object must have these exact keys:
  "title"       : a short label (e.g. "Positive Review Response")
  "review_type" : one of "positive", "negative", "neutral"
  "content"     : the full template text

Output ONLY the JSON array, no extra text or markdown fences.
"""
    return prompt.strip()


def _parse_gemini_response(raw: str) -> List[GeneratedTemplate]:
    """Extract JSON array from Gemini's response (handles stray markdown fences)."""
    text = raw.strip()
    # Strip ```json ... ``` fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()

    data = json.loads(text)
    templates = []
    for item in data:
        templates.append(
            GeneratedTemplate(
                title=item["title"],
                content=item["content"],
                review_type=item["review_type"],
            )
        )
    return templates


# ── Endpoint ─────────────────────────────────────────────────────────────────


@router.post("/generate", response_model=TemplateGenerateResponse)
async def generate_templates(
    body: TemplateGenerateRequest,
    token: str = Depends(get_bearer_token),
    gateway: SupabaseGateway = Depends(get_supabase_gateway),
) -> TemplateGenerateResponse:
    """
    Generate 3 review response templates (positive / negative / neutral)
    using Gemini AI, guided by the brand voice form data and an optional
    free-text prompt from the user.
    """
    # Validate the caller's session
    user = gateway.get_user_from_access_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    api_key = (
        os.environ.get("GOOGLE_GEMINI_API_KEY")
        or os.environ.get("VITE_GOOGLE_AI_API_KEY")
    )
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in the environment.",
        )

    try:
        import google.generativeai as genai  # lazy import — avoids crash if not yet installed
    except ModuleNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="google-generativeai package is not installed. Run: pip install google-generativeai",
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = _build_prompt(body)

    try:
        result = model.generate_content(prompt)
        templates = _parse_gemini_response(result.text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned malformed JSON: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI generation failed: {exc}",
        )

    if len(templates) != 3:
        raise HTTPException(
            status_code=502,
            detail=f"Expected 3 templates, got {len(templates)}.",
        )

    return TemplateGenerateResponse(templates=templates)
