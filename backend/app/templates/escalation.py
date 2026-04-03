"""
Escalation pre-check for review content.

Fast regex-based classifier that detects high-risk review content
(legal threats, physical threats, severe allegations, hate speech)
BEFORE any LLM call is made. This saves AI credits and prevents
the model from generating public replies to volatile reviews.

Used by all three AI reply consumers:
  - Single AI reply   (gmb/router.py)
  - Bulk AI reply      (gmb/router.py)
  - Automation reply   (automation/service.py)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Pattern


@dataclass(frozen=True, slots=True)
class EscalationResult:
    """Result of the escalation pre-check."""
    should_escalate: bool
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Pattern definitions
# ---------------------------------------------------------------------------
# Each category maps to a list of regex patterns compiled with IGNORECASE.
# Patterns are tuned for threat-context to minimise false positives:
#   - "lawyer" alone is NOT flagged (could be "my lawyer recommended you")
#   - "sue you" / "take you to court" ARE flagged (clear threat intent)
# ---------------------------------------------------------------------------

def _compile(patterns: List[str]) -> List[Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


ESCALATION_PATTERNS: Dict[str, List[Pattern[str]]] = {
    "legal_threat": _compile([
        r"\b(i\s+will\s+sue|i\'?m\s+going\s+to\s+sue|we\s+will\s+sue)\b",
        r"\b(lawsuit|legal\s+action|class\s+action)\b",
        r"\b(take\s+(you|this|them)\s+to\s+court)\b",
        r"\b(my\s+(attorney|lawyer)\s+(will|is\s+going\s+to|has\s+been))\b",
        r"\b(retained\s+(an?\s+)?(attorney|lawyer|counsel))\b",
        r"\b(hear\s+from\s+my\s+(attorney|lawyer))\b",
        r"\b(litigation|litigate)\b",
        r"\b(report(ing)?\s+(you|this|them)\s+to\s+the\s+(bbb|fda|health\s+department|authorities|police))\b",
    ]),

    "physical_threat": _compile([
        r"\b(kill\s+you|hurt\s+you|harm\s+you|beat\s+you)\b",
        r"\b(come\s+(for|after|find)\s+(you|them))\b",
        r"\b(physical\s+(harm|violence|threat))\b",
        r"\b(i\s+(will|am\s+going\s+to)\s+(destroy|burn|attack))\b",
        r"\b(watch\s+your\s+back)\b",
        r"\b(death\s+threat)\b",
    ]),

    "severe_allegation": _compile([
        r"\b(food\s+poisoning|food\s*borne\s+illness)\b",
        r"\b(malpractice|medical\s+negligence)\b",
        r"\b(hospitali[sz]ed|ended\s+up\s+in\s+(the\s+)?(er|emergency\s+room|hospital|icu))\b",
        r"\b(severe\s+(injury|allergic\s+reaction|burn|infection|illness))\b",
        r"\b(nearly\s+died|almost\s+died|could\s+have\s+(died|killed))\b",
        r"\b(life\s*threatening)\b",
        r"\b(anaphyla(xis|ctic))\b",
        r"\b(permanent\s+(damage|injury|disability|scarring))\b",
    ]),

    "hate_speech": _compile([
        r"\b(racial\s+slur|racist|bigot|white\s+supremac|nazi)\b",
        r"\b(homophob|transphob|f[a@]gg?[o0]t)\b",
        r"\b(hate\s+(crime|speech))\b",
        r"\b(ethnic\s+cleansing|genocide)\b",
    ]),

    "harassment": _compile([
        r"\b(stalk(ing|er)?)\b",
        r"\b(doxx?(ing|ed)?)\b",
        r"\b(destroy\s+your\s+(business|reputation|life|career))\b",
        r"\b(ruin\s+your\s+(business|reputation|life|career))\b",
        r"\b(expose\s+you)\b",
        r"\b(harass(ing|ment|ed)?)\b",
    ]),
}

# Human-readable labels for escalation reasons
_CATEGORY_LABELS: Dict[str, str] = {
    "legal_threat": "Legal threat or lawsuit mention",
    "physical_threat": "Physical threat or violence",
    "severe_allegation": "Severe medical/safety allegation",
    "hate_speech": "Hate speech or discriminatory language",
    "harassment": "Harassment or intimidation",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_escalation(review_text: str) -> EscalationResult:
    """
    Scan review text for high-risk content that should NOT receive
    an automated AI reply.

    Returns EscalationResult with should_escalate=True and a reason
    if any pattern matches, otherwise should_escalate=False.

    This is a pure function with no I/O — runs in microseconds.
    """
    if not review_text or not review_text.strip():
        return EscalationResult(should_escalate=False)

    text = review_text.strip()

    for category, patterns in ESCALATION_PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                label = _CATEGORY_LABELS.get(category, category)
                return EscalationResult(
                    should_escalate=True,
                    reason=f"{label} detected in review.",
                )

    return EscalationResult(should_escalate=False)
