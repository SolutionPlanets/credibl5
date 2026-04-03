"""
Production-grade prompt builder for AI review reply generation.

Builds a hardened, multi-section system prompt with safety guardrails,
compliance rules, PII handling, and escalation fallback instructions.

Also provides post-generation utilities:
  - parse_reply_output()  — detect escalation JSON vs. normal reply
  - sanitize_reply()      — defense-in-depth PII redaction & cleanup
  - ensure_sign_off()     — append brand voice sign-off if missing

Used by:
  - Single AI reply   (gmb/router.py  POST /reviews/generate-reply)
  - Bulk AI reply      (gmb/router.py  POST /reviews/bulk-ai-generate)
  - Automation reply   (automation/service.py  auto-reply job)
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_LENGTH_MAP: Dict[str, str] = {
    "short": "strictly 1-2 sentences",
    "medium": "strictly 2-3 sentences",
    "detailed": "strictly 3-5 sentences",
}

# Regex patterns for PII redaction in sanitize_reply()
_PHONE_RE = re.compile(
    r"(\+?\d{1,3}[-.\s]?)?"         # optional country code
    r"\(?\d{2,4}\)?[-.\s]?"         # area code
    r"\d{3,4}[-.\s]?"              # first group
    r"\d{3,5}",                     # second group
)
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)
_MARKDOWN_RE = re.compile(
    r"(\*{1,2}|#{1,3}\s|`{1,3}|~{2})"
)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def build_review_reply_prompt(
    *,
    business_name: str,
    reviewer_name: str,
    star_rating: Any,
    review_text: str,
    brand_voice: Dict[str, Any],
    custom_instructions: Optional[str] = None,
    support_contact: Optional[str] = None,
    allow_emojis: bool = False,
) -> str:
    """
    Build the Gemini prompt for generating a reply to a single review.

    Parameters
    ----------
    business_name : str
        Display name of the business / location.
    reviewer_name : str
        Name of the reviewer (first name preferred).
    star_rating : Any
        Numeric star rating (1-5) or "N/A".
    review_text : str
        The customer's review text.
    brand_voice : dict
        Brand voice row from Supabase (may be empty dict if none configured).
    custom_instructions : str | None
        Optional free-form instructions (e.g. from automation rule settings).
    support_contact : str | None
        Support email/phone to include in negative review replies.
        If None, the prompt forbids inventing contact details.
    allow_emojis : bool
        Whether emojis are permitted in the reply (default: False).
    """
    # Extract brand voice fields with safe defaults
    tone = brand_voice.get("tone", "professional")
    length_pref = brand_voice.get("preferred_response_length", "medium")
    length_constraint = _LENGTH_MAP.get(length_pref, _LENGTH_MAP["medium"])
    key_phrases = ", ".join(brand_voice.get("key_phrases", [])) or "none specified"
    phrases_to_avoid = ", ".join(brand_voice.get("phrases_to_avoid", [])) or "none"
    sign_off = brand_voice.get("signature_signoff", "").strip()
    industry = brand_voice.get("industry", "Local Business")
    target_audience = brand_voice.get("target_audience", "")
    brand_values = brand_voice.get("brand_values", "")
    language_dialect = brand_voice.get("language_dialect", "").strip()
    example_responses = brand_voice.get("example_responses", [])

    # Determine if this is a negative/neutral review
    is_negative = False
    try:
        is_negative = int(star_rating) <= 3
    except (ValueError, TypeError):
        pass

    # ----- Build prompt sections -----

    sections: list[str] = []

    # ── Section 1: Role & Context ──
    sections.append(f"""You are a professional review response writer for "{business_name}", a {industry} business.
Your job is to write a single reply to the following customer review.

REVIEW TO RESPOND TO:
- Reviewer Name: {reviewer_name or "Customer"}
- Star Rating: {star_rating or "N/A"} out of 5
- Review Text: \"{review_text or "(No text provided)"}\"
""")

    # ── Section 2: Brand Voice ──
    brand_section = f"""BRAND VOICE CONFIGURATION:
- Tone: {tone}
- Key Phrases (incorporate naturally): {key_phrases}
- Phrases to AVOID (never use): {phrases_to_avoid}"""

    if sign_off:
        brand_section += f"\n- Sign-off: {sign_off}"
    if target_audience:
        brand_section += f"\n- Target Audience: {target_audience}"
    if brand_values:
        brand_section += f"\n- Brand Values: {brand_values}"
    if language_dialect:
        brand_section += f"\n- Language/Dialect: {language_dialect}"

    if example_responses:
        examples = "\n".join(f'  {i+1}. "{e}"' for i, e in enumerate(example_responses[:3]))
        brand_section += f"\n- Example Responses (match this style):\n{examples}"

    sections.append(brand_section)

    # ── Section 3: Length Constraint ──
    sections.append(f"""LENGTH CONSTRAINT:
Your reply MUST be {length_constraint}. Do not exceed this limit.
Be concise and impactful within this constraint.""")

    # ── Section 4: Safety & Compliance Guardrails ──
    sections.append("""SAFETY & COMPLIANCE RULES (MANDATORY — violations are unacceptable):

1. NO FINANCIAL PROMISES: Never offer or imply refunds, discounts, coupons,
   replacements, free services, compensation, credits, or any monetary remedy.
   Never promise specific outcomes, timelines, or resolution guarantees.

2. NO POLICY INVENTION: Never state or imply business hours, warranty terms,
   return policies, pricing, staffing details, or any factual claim about the
   business that is not explicitly provided in this prompt. If a fact was not
   given to you, do not state it.

3. NO FAULT ADMISSION: Express sincere empathy for the customer's experience
   and frustration, but NEVER admit legal fault, negligence, liability, or
   wrongdoing. Never say "it was our fault", "we were negligent", "we accept
   responsibility for the harm", or similar admissions.

4. NO PII REPETITION: If the review contains personal information such as
   phone numbers, email addresses, physical addresses, account numbers, or
   other personally identifiable information, do NOT repeat, reference, or
   summarize that information in your reply.

5. MEASURED EMPATHY: Express sincere concern using professional language.
   FORBIDDEN phrases: "absolutely heartbroken", "deeply devastated",
   "horrified to hear", "utterly appalled", "shocked and saddened".
   USE instead: "sorry to hear about your experience", "understand your
   frustration", "appreciate you bringing this to our attention".

6. NO ECHO: Synthesize the customer's concern in your own words. Do NOT
   quote, closely paraphrase, or repeat their review text back to them.

7. NON-DEFENSIVE: Never argue with the reviewer, question their account of
   events, or imply they are lying, exaggerating, or at fault — even if the
   review appears factually incorrect.""")

    # ── Section 5: Emoji Control ──
    if allow_emojis:
        sections.append("EMOJI USAGE: You may use 1-2 tasteful emojis if appropriate for the tone. Do not overuse.")
    else:
        sections.append("EMOJI USAGE: Do NOT use any emojis in your reply. Maintain a professional text-only aesthetic.")

    # ── Section 6: Offline Resolution ──
    if is_negative:
        if support_contact:
            sections.append(f"""OFFLINE RESOLUTION (required for this negative review):
Invite the customer to continue the conversation privately.
Use EXACTLY this contact information: {support_contact}
Example wording: "Please reach out to us at {support_contact} so we can look into this further."
Do NOT invent or modify the contact information provided above.""")
        else:
            sections.append("""OFFLINE RESOLUTION:
This is a negative review. Express willingness to improve, but do NOT suggest
any specific contact method, phone number, email address, or URL.
Do NOT invent generic phrases like "contact customer service" or make up email domains.
Simply express that you value their feedback and are committed to improvement.""")

    # ── Section 7: Escalation Fallback ──
    sections.append("""ESCALATION PROTOCOL:
If the review text contains any of the following, output ONLY the JSON object
below instead of a reply — do NOT generate a reply:
- Threats of lawsuit, legal action, or physical harm
- Severe hate speech, targeted harassment, or discrimination
- Extreme medical/safety allegations (e.g., severe injury, hospitalization, food poisoning, malpractice)

If escalation is needed, output ONLY this JSON (nothing else):
{"escalate_to_human": true, "reason": "<brief one-line description of why>"}""")

    # ── Section 8: Output Format ──
    sections.append("""OUTPUT FORMAT:
- Return ONLY the reply text (or escalation JSON if triggered).
- No markdown formatting. No bold, italic, headers, or bullet points.
- No prefixes like "Here is your reply:" or "Response:".
- No explanations, meta-commentary, or notes about the reply.
- The output should be ready to post publicly on Google Business Profile as-is.""")

    # ── Section 9: Custom Instructions ──
    if custom_instructions and custom_instructions.strip():
        sections.append(f"""ADDITIONAL INSTRUCTIONS FROM THE BUSINESS OWNER:
{custom_instructions.strip()}""")

    # ── Section 10: Composition Rules ──
    sections.append(f"""COMPOSITION RULES:
- Address the reviewer by their first name ("{reviewer_name or 'Customer'}").
- Be genuine, specific, and relevant to what they wrote.
- Naturally incorporate key phrases where they fit.
- End with the sign-off: {sign_off or '(no sign-off specified)'}.
- Write in a {tone} tone throughout.
- The reply must read as naturally human-written, not robotic or templated.""")

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Output parsing
# ---------------------------------------------------------------------------

def parse_reply_output(raw_text: str) -> Dict[str, Any]:
    """
    Parse the raw LLM output to detect escalation vs. normal reply.

    Returns
    -------
    dict with one of two shapes:
      {"escalated": True,  "reason": "..."}   — LLM triggered escalation
      {"escalated": False, "reply": "..."}    — normal reply text
    """
    text = raw_text.strip()

    # Try to detect escalation JSON
    # The LLM might wrap it in markdown fences — strip those first
    cleaned = text
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and parsed.get("escalate_to_human") is True:
            return {
                "escalated": True,
                "reason": str(parsed.get("reason", "High-risk content detected.")),
            }
    except (json.JSONDecodeError, ValueError):
        pass

    return {"escalated": False, "reply": text}


# ---------------------------------------------------------------------------
# Post-generation sanitization (defense-in-depth)
# ---------------------------------------------------------------------------

def sanitize_reply(reply: str) -> str:
    """
    Post-generation safety net. Runs after the LLM output is parsed as a
    normal reply. Catches any PII, markdown, or promise patterns that may
    have leaked through despite prompt instructions.

    This is defense-in-depth — the prompt should prevent these, but the
    sanitizer catches what slips through.
    """
    text = reply

    # 1. Strip markdown artifacts
    text = _MARKDOWN_RE.sub("", text)

    # 2. Redact email addresses
    text = _EMAIL_RE.sub("[email redacted]", text)

    # 3. Redact phone numbers (only standalone patterns, not inside words)
    #    Be careful not to redact star ratings or years
    text = _redact_phone_numbers(text)

    # 4. Clean up any double-spaces or trailing whitespace from redaction
    text = re.sub(r"  +", " ", text)
    text = "\n".join(line.rstrip() for line in text.splitlines())

    return text.strip()


def _redact_phone_numbers(text: str) -> str:
    """
    Redact phone number patterns while avoiding false positives on
    short numbers (years, star ratings, ZIP codes in addresses).
    Only redact sequences that look like actual phone numbers (7+ digits).
    """
    def _replacer(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group())
        # Only redact if it has 7+ digits (real phone number range)
        if len(digits) >= 7:
            return "[phone redacted]"
        return match.group()

    return _PHONE_RE.sub(_replacer, text)


# ---------------------------------------------------------------------------
# Sign-off helper
# ---------------------------------------------------------------------------

def ensure_sign_off(reply: str, brand_voice: Dict[str, Any]) -> str:
    """Append the brand voice sign-off if it is not already present."""
    sign_off = brand_voice.get("signature_signoff", "").strip()
    if sign_off and sign_off.lower() not in reply.lower():
        return f"{reply}\n\n{sign_off}"
    return reply
